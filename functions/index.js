const {setGlobalOptions} = require("firebase-functions");
// const {onRequest} = require("firebase-functions/https");
// const logger = require("firebase-functions/logger");

setGlobalOptions({maxInstances: 10});

const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onCall} = require("firebase-functions/v2/https");
const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {DateTime} = require("luxon");
const admin = require("firebase-admin");
const functions = require("firebase-functions");

admin.initializeApp();
const db = admin.firestore();

exports.onLatenessUpdate = onDocumentUpdated(
    {
      document: "schedules/{scheduleId}",
      region: "asia-southeast1",
    },
    async (event) => {
      const scheduleData = event.data.after.data();
      const previousData = event.data.before.data();

      const rpointsAfter = JSON.stringify(scheduleData.rpoints);
      const rpointsBefore = JSON.stringify(previousData.rpoints);

      if (rpointsBefore === rpointsAfter) {
        console.log("Update detected, but rpoints did not change. Exiting function.");
        return null;
      }

      if (!scheduleData.rpoints || !previousData.rpoints) {
        console.log("No rpoints found in schedule.");
        return;
      }

      console.log("--- BEFORE DATA ---");
      console.log(JSON.stringify(previousData.rpoints, null, 2));
      console.log("--- AFTER DATA ---");
      console.log(JSON.stringify(scheduleData.rpoints, null, 2));

      let updatedRPoint = null;
      let updatedRPointIndex = -1;
      for (let i = 0; i < scheduleData.rpoints.length; i++) {
        const oldLateness = previousData.rpoints[i] ? previousData.rpoints[i].latenessMinutes : 0;
        const newLateness = scheduleData.rpoints[i].latenessMinutes;

        console.log(`Comparing index ${i}: oldLateness=${oldLateness}, newLateness=${newLateness}`);

        if (newLateness !== oldLateness) {
          updatedRPoint = scheduleData.rpoints[i];
          updatedRPointIndex = i;
          break;
        }
      }

      if (!updatedRPoint) {
        console.log("No lateness update detected.");
        return;
      }

      const latenessMinutes = updatedRPoint.latenessMinutes;

      if (latenessMinutes < 5) {
        console.log(`Lateness of ${latenessMinutes} minutes is below the threshold. Ignoring.`);
        return;
      }

      const studentsToNotify = new Set();
      if (updatedRPointIndex < scheduleData.rpoints.length - 1) {
        for (let i = updatedRPointIndex + 1; i < scheduleData.rpoints.length; i++) {
          const subsequentRPoint = scheduleData.rpoints[i];
          if (subsequentRPoint.queuedStudents && subsequentRPoint.queuedStudents.length > 0) {
            subsequentRPoint.queuedStudents.forEach((studentId) => studentsToNotify.add(studentId));
          }
        }
      }

      const studentIds = Array.from(studentsToNotify);
      if (studentIds.length === 0) {
        console.log("No students to notify in subsequent stops.");
        return;
      }

      console.log(`Found ${studentIds.length} students to notify.`);

      await saveAndSendStuNotifications(studentIds, scheduleData, latenessMinutes);
    },
);

/**
 * Creates notifications for a list of students using a batch write
 * and sends a single multicast push notification.
 * @param {string[]} studentIds Array of student IDs to notify.
 * @param {object} scheduleData The data from the schedule document.
 * @param {number} latenessMinutes The current delay in minutes.
 */
async function saveAndSendStuNotifications(studentIds, scheduleData, latenessMinutes) {
  const scheduledDatetime = DateTime.fromJSDate(scheduleData.scheduledDatetime.toDate()).setZone("Asia/Kuala_Lumpur");
  const normalizedDatetime = scheduledDatetime.toISO().substring(0, 16);
  const key = `delay-student-allStudents-${scheduleData.routeId}-${scheduleData.type}-${normalizedDatetime}`;

  const notificationsRef = db.collection("notifications");
  const query = notificationsRef.where("key", "==", key).orderBy("created", "desc").limit(1);
  const snapshot = await query.get();
  if (!snapshot.empty) {
    const lastNotification = snapshot.docs[0].data();
    const now = DateTime.now();
    const lastNotifTime = DateTime.fromJSDate(lastNotification.created.toDate());

    const timeGapMinutes = now.diff(lastNotifTime, "minutes").toObject().minutes;
    const latenessDifference = latenessMinutes - lastNotification.latenessMinutes;
    const hasTimeGapElapsed = timeGapMinutes >= 15;
    const hasLatenessIncreasedSignificantly = latenessDifference >= 10;

    console.log(`Checking throttle rules for key: ${key}`);
    console.log(`Time since last notification: ${timeGapMinutes.toFixed(2)} minutes.`);
    console.log(`Increase in lateness: ${latenessDifference} minutes.`);

    if (!hasTimeGapElapsed && !hasLatenessIncreasedSignificantly) {
      console.log("Throttling notification. Conditions not met.");
      return;
    }
    console.log("Throttling conditions met. Proceeding to send notification.");
  } else {
    console.log(`No existing notification found for key: ${key}. Sending first notification.`);
  }

  let routeName = "Unknown Route";
  let busPlateNumber = "Unknown";
  try {
    const routeDoc = await db.collection("routes").doc(scheduleData.routeId).get();
    if (routeDoc.exists) {
      routeName = routeDoc.data().name || routeName;
    }
    if (scheduleData.busDriverPairId) {
      const busDriverPairDoc = await db.collection("busDriverPairings").doc(scheduleData.busDriverPairId).get();
      if (busDriverPairDoc.exists) {
        const busDriverPairData = busDriverPairDoc.data();
        const busDoc = await db.collection("buses").doc(busDriverPairData.busId).get();
        if (busDoc.exists) {
          busPlateNumber = busDoc.data().plateNumber || busPlateNumber;
        }
      }
    }
  } catch (error) {
    console.error("Error fetching additional data:", error);
  }

  const notificationData = {
    key: key,
    type: "delay",
    audienceType: "student",
    audienceId: "allStudents",
    routeId: scheduleData.routeId,
    routeName: routeName,
    scheduleType: scheduleData.type,
    busDriverPairId: scheduleData.busDriverPairId || null,
    busPlateNumber: busPlateNumber,
    scheduledDatetime: scheduleData.scheduledDatetime,
    latenessMinutes: latenessMinutes,
    created: admin.firestore.FieldValue.serverTimestamp(),
  };

  try {
    await db.collection("notifications").add(notificationData);
    console.log("Successfully created one global notification document.");
  } catch (error) {
    console.error("Error creating global notification document:", error);
  }

  const studentsRef = db.collection("students");
  const pushTokens = [];
  const studentDocs = await Promise.all(studentIds.map((id) => studentsRef.doc(id).get()));
  for (const studentDoc of studentDocs) {
    if (!studentDoc.exists) continue;
    if (studentDoc.data() && studentDoc.data().pushToken) {
      pushTokens.push(studentDoc.data().pushToken);
    }
  }

  if (pushTokens.length > 0) {
    const formattedTime = scheduledDatetime.toFormat("HH:mm");
    const message = {
      tokens: pushTokens,
      notification: {
        title: "[DELAYED] Bus Delay Alert",
        body: `Bus ${busPlateNumber} on ${formattedTime} route is delayed by ${latenessMinutes} minutes.`,
      },
      data: {
        type: "delay",
        routeId: scheduleData.routeId,
        routeName: routeName,
        busPlateNumber: busPlateNumber,
        latenessMinutes: latenessMinutes.toString(),
        scheduledTime: formattedTime,
      },
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(message);
      console.log(`Successfully sent multicast message to ${response.successCount} devices.`);
      if (response.failureCount > 0) {
        console.log(`Failed to send to ${response.failureCount} devices.`);
      }
    } catch (error) {
      console.error("Error sending multicast push notification:", error);
    }
  }
}

exports.adminAccountManagement = onCall(
    {region: "asia-southeast1"},
    async (request) => {
      const auth = request.auth;
      if (!auth || !auth.token || auth.token.role !== "super_admin") {
        console.log("Permission denied. User role is:", auth ? auth.token.role : "not authenticated");
        throw new functions.https.HttpsError(
            "permission-denied",
            "Only super admins can perform admin account operations",
        );
      }

      const {action, email, name, role} = request.data;
      const inviterEmail = auth.token.email;

      try {
        switch (action) {
          case "createAdmin": {
            if (!email || !name || !role) {
              throw new functions.https.HttpsError(
                  "invalid-argument",
                  "Email, name, and role are required for creating admin accounts",
              );
            }
            const userRecord = await admin.auth().createUser({
              email: email,
              emailVerified: false,
              disabled: false,
              displayName: name,
            });
            await admin.auth().setCustomUserClaims(userRecord.uid, {role: role});
            const link = await admin.auth().generatePasswordResetLink(email);

            await admin.firestore().collection("admins").doc(userRecord.uid).set({
              name: name,
              email: email,
              role: role,
              status: "pending",
              invitedBy: inviterEmail,
              link: link,
              linkGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return {
              success: true,
              action: "createAdmin",
              selectedAdminEmail: email,
              adminId: userRecord.uid,
              resetLink: link,
            };
          }

          case "generateResetLink": {
            if (!email) {
              throw new functions.https.HttpsError(
                  "invalid-argument",
                  "Email is required for generating reset links",
              );
            }

            const resetLink = await admin.auth().generatePasswordResetLink(email);
            const adminQuery = await admin.firestore()
                .collection("admins")
                .where("email", "==", email)
                .limit(1)
                .get();

            if (!adminQuery.empty) {
              const adminDoc = adminQuery.docs[0];
              await adminDoc.ref.update({
                link: resetLink,
                linkGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            }

            return {
              success: true,
              action: "generateResetLink",
              resetLink: resetLink,
            };
          }

          default:
            throw new functions.https.HttpsError(
                "invalid-argument",
                "Invalid action. Use 'createAdmin' or 'generateResetLink'",
            );
        }
      } catch (error) {
        console.error("Error in admin account management:", error);
        if (error.code === "auth/email-already-exists") {
          throw new functions.https.HttpsError(
              "already-exists",
              "This email address is already in use.",
          );
        }
        if (error.code === "auth/user-not-found") {
          throw new functions.https.HttpsError(
              "not-found",
              "User not found for password reset.",
          );
        }
        throw new functions.https.HttpsError(
            "internal",
            "An unexpected error occurred. Please try again.",
        );
      }
    },
);

exports.driverAccountManagement = onCall(
    {region: "asia-southeast1"},
    async (request) => {
      const auth = request.auth;
      if (!auth || !auth.token || (auth.token.role !== "admin" && auth.token.role !== "super_admin")) {
        console.log("Permission denied. User role is:", auth ? auth.token.role : "not authenticated");
        throw new functions.https.HttpsError(
            "permission-denied",
            "Only admins can perform driver account operations",
        );
      }
      const {action, email, name, phone, licenseNumber} = request.data;
      const inviterEmail = auth.token.email;

      try {
        switch (action) {
          case "createDriver": {
            if (!email || !name || !phone || !licenseNumber) {
              throw new functions.https.HttpsError(
                  "invalid-argument",
                  "Email, name, phone, and license number are required for creating driver accounts",
              );
            }
            const driverQuery = await admin.firestore()
                .collection("drivers")
                .where("email", "==", email)
                .limit(1)
                .get();
            if (!driverQuery.empty) {
              throw new functions.https.HttpsError(
                  "already-exists",
                  "This email address is already registered as a driver",
              );
            }
            const userRecord = await admin.auth().createUser({
              email: email,
              emailVerified: false,
              disabled: false,
              displayName: name,
            });
            await admin.auth().setCustomUserClaims(userRecord.uid, {role: "driver"});
            const link = await admin.auth().generatePasswordResetLink(email);

            await admin.firestore().collection("drivers").doc(userRecord.uid).set({
              driverId: userRecord.uid,
              name: name,
              email: email,
              phone: phone,
              licenseNumber: licenseNumber,
              status: "pending",
              invitedBy: inviterEmail,
              link: link,
              linkGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return {
              success: true,
              action: "createDriver",
              selectedDriverEmail: email,
              driverId: userRecord.uid,
              resetLink: link,
            };
          }

          case "generateResetLink": {
            if (!email) {
              throw new functions.https.HttpsError(
                  "invalid-argument",
                  "Email is required for generating reset links",
              );
            }
            const driverQuery = await admin.firestore()
                .collection("drivers")
                .where("email", "==", email)
                .limit(1)
                .get();
            if (driverQuery.empty) {
              throw new functions.https.HttpsError(
                  "not-found",
                  "Driver not found with this email",
              );
            }
            const resetLink = await admin.auth().generatePasswordResetLink(email);
            const driverDoc = driverQuery.docs[0];
            await driverDoc.ref.update({
              link: resetLink,
              linkGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            return {
              success: true,
              action: "generateResetLink",
              resetLink: resetLink,
            };
          }

          default:
            throw new functions.https.HttpsError(
                "invalid-argument",
                "Invalid action. Use 'createDriver' or 'generateResetLink'",
            );
        }
      } catch (error) {
        console.error("Error in driver account management:", error);
        if (error.code === "auth/email-already-exists") {
          throw new functions.https.HttpsError(
              "already-exists",
              "This email address is already in use.",
          );
        }
        if (error.code === "auth/user-not-found") {
          throw new functions.https.HttpsError(
              "not-found",
              "User not found for password reset.",
          );
        }
        if (error.code === "already-exists") {
          throw error;
        }
        throw new functions.https.HttpsError(
            "internal",
            "An unexpected error occurred. Please try again.",
        );
      }
    },
);

/**
 * Cloud Function to automatically set queueEnabled based on queueOpenMinutes and queueCloseMinutes.
 *
 * This function runs every 10 minutes and updates the 'queueEnabled' field for schedule.
 */
exports.updateQueueStatus = onSchedule(
    {schedule: "every 10 minutes", region: "asia-southeast1"},
    async (event) => {
      console.log("Running queue status update...");

      const SCHEDULES_COLLECTION = "schedules";
      const now = DateTime.now().setZone("Asia/Kuala_Lumpur");

      try {
        const activeSchedulesSnapshot = await db
            .collection(SCHEDULES_COLLECTION)
            .where("status", "in", ["scheduled", "in_progress"])
            .get();

        if (activeSchedulesSnapshot.empty) {
          console.log("No active schedules with queue offsets found.");
          return null;
        }

        const batch = db.batch();
        let schedulesUpdated = 0;

        for (const doc of activeSchedulesSnapshot.docs) {
          const schedule = doc.data();
          const scheduleRef = doc.ref;

          if (
            schedule.queueOpenMinutes === null ||
          schedule.queueCloseMinutes === null
          ) {
            continue;
          }

          const scheduledDatetime = DateTime.fromJSDate(
              schedule.scheduledDatetime.toDate(),
          ).setZone("Asia/Kuala_Lumpur");
          const queueOpenMinutes = schedule.queueOpenMinutes;
          const queueCloseMinutes = schedule.queueCloseMinutes;

          const queueOpenTime = scheduledDatetime.minus({
            minutes: queueOpenMinutes,
          });
          const queueCloseTime = scheduledDatetime.minus({
            minutes: queueCloseMinutes,
          });

          let newQueueEnabledStatus = schedule.queueEnabled;

          if (now >= queueOpenTime && now < queueCloseTime) {
            if (schedule.queueEnabled === false) {
              newQueueEnabledStatus = true;
              console.log(`Setting queueEnabled to true for schedule ${doc.id}. 
                        Scheduled: ${scheduledDatetime.toFormat("yyyy-MM-dd HH:mm")}, 
                        Open: ${queueOpenTime.toFormat("yyyy-MM-dd HH:mm")}, 
                        Close: ${queueCloseTime.toFormat("yyyy-MM-dd HH:mm")}`);
            }
          } else {
            if (schedule.queueEnabled === true) {
              newQueueEnabledStatus = false;
              console.log(`Setting queueEnabled to false for schedule ${doc.id}. 
                        Scheduled: ${scheduledDatetime.toFormat("yyyy-MM-dd HH:mm")}, 
                        Open: ${queueOpenTime.toFormat("yyyy-MM-dd HH:mm")}, 
                        Close: ${queueCloseTime.toFormat("yyyy-MM-dd HH:mm")}`);
            }
          }

          if (newQueueEnabledStatus !== schedule.queueEnabled) {
            batch.update(scheduleRef, {queueEnabled: newQueueEnabledStatus});
            schedulesUpdated++;
          }
        }

        if (schedulesUpdated > 0) {
          await batch.commit();
          console.log(
              `Successfully updated ${schedulesUpdated} schedules' queue status.`,
          );
        } else {
          console.log("No queue statuses needed to be updated.");
        }

        return null;
      } catch (error) {
        console.error("Error updating queue status:", error);
        throw new Error("Failed to update queue status.");
      }
    },
);

/**
 * Saves a notification document to a driver's subcollection in Firestore.
 * This function does NOT send a push notification and does not require a token.
 *
 * @param {object} request The data passed from the client.
 * @param {object} request.data The notification data to be saved.
 */
exports.saveDrvNotification = onCall(
    {region: "asia-southeast1"},
    async (request) => {
      const data = request.data;

      let finalScheduledDatetime;

      if (data.scheduledDatetime) {
        const dateObj = new Date(data.scheduledDatetime);
        if (!isNaN(dateObj.getTime())) {
          finalScheduledDatetime = admin.firestore.Timestamp.fromDate(dateObj);
        }
      }
      if (!finalScheduledDatetime) {
        console.warn(`Received invalid or missing scheduledDatetime: ${data.scheduledDatetime}.`, "Using current server time as a fallback.");
        finalScheduledDatetime = admin.firestore.Timestamp.now();
      }

      const notificationData = {
        ...data,
        scheduledDatetime: finalScheduledDatetime,
        created: admin.firestore.FieldValue.serverTimestamp(),
      };
      delete notificationData.title;
      delete notificationData.body;

      try {
        const docRef = db.collection(`notifications`).doc();
        await docRef.set(notificationData);
        console.log(`Successfully saved notification with ID: ${docRef.id}`);
        return {success: true, message: "Notification saved successfully."};
      } catch (error) {
        console.error("Error saving notification to Firestore:", error);
        console.error("Failing notification data:", notificationData);
        throw new functions.https.HttpsError(
            "internal",
            "Failed to save notification. See logs for details.",
        );
      }
    },
);

/**
 * Sends a push notification to a single device using an FCM token.
 *
 * @param {object} request The data passed from the client.
 * @param {string} request.data.token The FCM token of the driver's device.
 * @param {string} request.data.title The title of the push notification.
 * @param {string} [request.data.body] The body of the push notification.
 */
exports.sendDrvNotification = onCall(
    {region: "asia-southeast1"},
    async (request) => {
      const {token, title, body} = request.data;

      if (!token) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "FCM token is required.",
        );
      }
      if (!title) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Notification title is required.",
        );
      }

      const message = {
        token: token,
        notification: {
          title: title,
        },
      };

      if (body) {
        message.notification.body = body;
      }

      try {
        await admin.messaging().send(message);
        return {success: true};
      } catch (error) {
        console.error(
            `Failed to send push notification to token: ${token}`,
            error,
        );
        throw new functions.https.HttpsError(
            "internal",
            "Firebase Messaging service failed.",
        );
      }
    },
);

/**
 * Cloud Function to archive notifications older than 30 days to notificationsArchived collection
 * and delete them from the main notifications collection.
 *
 * This function runs daily to prevent unbounded growth of notifications.
 */
exports.archiveOldNotifications = onSchedule(
    {schedule: "every 24 hours", region: "asia-southeast1"},
    async (event) => {
      console.log("Running notification archiving process...");

      const NOTIFICATIONS_COLLECTION = "notifications";
      const ARCHIVED_COLLECTION = "notificationsArchived";
      const cutoffDate = DateTime.now().minus({days: 30}).toJSDate();
      const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoffDate);

      try {
        const oldNotificationsSnapshot = await db
            .collection(NOTIFICATIONS_COLLECTION)
            .where("created", "<", cutoffTimestamp)
            .get();

        if (oldNotificationsSnapshot.empty) {
          console.log("No notifications older than 30 days found.");
          return null;
        }

        console.log(`Found ${oldNotificationsSnapshot.size} notifications to archive.`);

        const batch = db.batch();
        let archivedCount = 0;

        for (const doc of oldNotificationsSnapshot.docs) {
          const notificationData = doc.data();
          const archivedRef = db.collection(ARCHIVED_COLLECTION).doc(doc.id);
          batch.set(archivedRef, {
            ...notificationData,
            originalId: doc.id,
            archivedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          const originalRef = db.collection(NOTIFICATIONS_COLLECTION).doc(doc.id);
          batch.delete(originalRef);
          archivedCount++;
        }

        if (archivedCount > 0) {
          await batch.commit();
          console.log(`Successfully archived ${archivedCount} notifications.`);
        } else {
          console.log("No notifications were archived.");
        }
        return null;
      } catch (error) {
        console.error("Error archiving notifications:", error);
        throw new Error("Failed to archive notifications.");
      }
    },
);

exports.archiveNotificationsManual = onCall(
    {region: "asia-southeast1"},
    async (request) => {
      console.log("Manual archive process triggered");
      const NOTIFICATIONS_COLLECTION = "notifications";
      const ARCHIVED_COLLECTION = "notificationsArchived";
      const cutoffDate = DateTime.now().minus({days: 30}).toJSDate();
      const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoffDate);

      try {
        const oldNotificationsSnapshot = await db
            .collection(NOTIFICATIONS_COLLECTION)
            .where("created", "<", cutoffTimestamp)
            .get();

        if (oldNotificationsSnapshot.empty) {
          console.log("No notifications older than 30 days found.");
          return {success: true, message: "No notifications to archive"};
        }

        console.log(`Found ${oldNotificationsSnapshot.size} notifications to archive.`);

        const batch = db.batch();
        let archivedCount = 0;

        for (const doc of oldNotificationsSnapshot.docs) {
          const notificationData = doc.data();
          const archivedRef = db.collection(ARCHIVED_COLLECTION).doc(doc.id);
          batch.set(archivedRef, {
            ...notificationData,
            originalId: doc.id,
            archivedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          const originalRef = db.collection(NOTIFICATIONS_COLLECTION).doc(doc.id);
          batch.delete(originalRef);
          archivedCount++;
        }

        if (archivedCount > 0) {
          await batch.commit();
          console.log(`Successfully archived ${archivedCount} notifications.`);
          return {success: true, message: `Archived ${archivedCount} notifications`};
        } else {
          console.log("No notifications were archived.");
          return {success: true, message: "No notifications to archive"};
        }
      } catch (error) {
        console.error("Error archiving notifications:", error);
        throw new functions.https.HttpsError(
            "internal",
            "Failed to archive notifications.",
        );
      }
    },
);

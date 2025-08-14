// /**
//  * Import function triggers from their respective submodules:
//  *
//  * const {onCall} = require("firebase-functions/v2/https");
//  * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
//  *
//  * See a full list of supported triggers at https://firebase.google.com/docs/functions
//  */

const {setGlobalOptions} = require("firebase-functions");
// const {onRequest} = require("firebase-functions/https");
// const logger = require("firebase-functions/logger");

// // For cost control, you can set the maximum number of containers that can be
// // running at the same time. This helps mitigate the impact of unexpected
// // traffic spikes by instead downgrading performance. This limit is a
// // per-function limit. You can override the limit for each function using the
// // `maxInstances` option in the function's options, e.g.
// // `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// // NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// // functions should each use functions.runWith({ maxInstances: 10 }) instead.
// // In the v1 API, each function can only serve one request per container, so
// // this will be the maximum concurrent request count.
setGlobalOptions({maxInstances: 10});

// // Create and deploy your first functions
// // https://firebase.google.com/docs/functions/get-started

// // exports.helloWorld = onRequest((request, response) => {
// //   logger.info("Hello logs!", {structuredData: true});
// //   response.send("Hello from Firebase!");
// // });

const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onCall} = require("firebase-functions/v2/https");
const {DateTime} = require("luxon");
const admin = require("firebase-admin");
const functions = require("firebase-functions");

admin.initializeApp();
const db = admin.firestore();

exports.createAdminAccount = onCall(
    {region: "asia-southeast1"},
    async (request) => {
        const auth = request.auth;
        if (!auth || !auth.token || auth.token.role !== "super_admin") {
            console.log("Permission denied. User role is:", auth ? auth.token.role : "not authenticated");
            throw new functions.https.HttpsError(
                "permission-denied",
                "Only super admins can create account for new admins",
            );
        }

        const {email, name, role} = request.data;
        const inviterEmail = auth.token.email;
        try {
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
            });

            return {
                success: true,
                message: `An invitation has been sent to ${email}.`,
                passwordResetLink: link,
                newAdminEmail: email,
            };
        } catch (error) {
            console.error("Error inviting admin:", error);
            if (error.code === "auth/email-already-exists") {
                throw new functions.https.HttpsError(
                    "already-exists",
                    "This email address is already in use.",
                );
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

                // Calculate queue open and close times
                const queueOpenTime = scheduledDatetime.minus({
                    minutes: queueOpenMinutes,
                });
                const queueCloseTime = scheduledDatetime.minus({
                    minutes: queueCloseMinutes,
                });

                let newQueueEnabledStatus = schedule.queueEnabled;

                if (now >= queueOpenTime && now < queueCloseTime) {
                    // If current time is between queue open and queue close times, enable queue
                    if (schedule.queueEnabled === false) {
                        newQueueEnabledStatus = true;
                        console.log(`Setting queueEnabled to true for schedule ${doc.id}. 
                        Scheduled: ${scheduledDatetime.toFormat("yyyy-MM-dd HH:mm")}, 
                        Open: ${queueOpenTime.toFormat("yyyy-MM-dd HH:mm")}, 
                        Close: ${queueCloseTime.toFormat("yyyy-MM-dd HH:mm")}`);
                    }
                } else {
                    // Otherwise, disable queue
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
exports.saveNotification = onCall(
    {region: "asia-southeast1"},
    async (request) => {
        const {driverId, timestamp, scheduledTime} = request.data;

        if (!driverId) {
            console.error("saveNotification called without a driverId.");
            throw new functions.https.HttpsError(
                "invalid-argument",
                "The function must be called with a 'driverId'.",
            );
        }

        let firestoreTimestamp;

        if (timestamp) {
            const date = new Date(timestamp);
            if (!isNaN(date.getTime())) {
                firestoreTimestamp = admin.firestore.Timestamp.fromDate(date);
            }
        } else if (scheduledTime && typeof scheduledTime.seconds === "number") {
            firestoreTimestamp = new admin.firestore.Timestamp(
                scheduledTime.seconds,
                scheduledTime.nanoseconds || 0,
            );
        }

        if (!firestoreTimestamp) {
            console.warn(
                "No valid client timestamp found. Using server time as a fallback.",
            );
            firestoreTimestamp = admin.firestore.FieldValue.serverTimestamp();
        }

        const notificationData = {
            ...request.data,
            scheduledDatetime: firestoreTimestamp,
            created: admin.firestore.FieldValue.serverTimestamp(),
            isRead: false,
        };
        delete notificationData.title;
        delete notificationData.body;
        delete notificationData.driverId;
        delete notificationData.scheduledTime;

        try {
            const docRef = db.collection(`drivers/${driverId}/notifications`).doc();
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
exports.sendNotification = onCall(
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

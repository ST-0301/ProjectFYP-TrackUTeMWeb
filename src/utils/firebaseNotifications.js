import { getFirestore, doc, getDoc, getDocs, collection, query, where, orderBy, limit } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "@/firebase";

const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp, "asia-southeast1"); 
const saveDrvNotificationFunction = httpsCallable(functions, "saveDrvNotification");
const sendDrvPushNotificationFunction = httpsCallable(functions, "sendDrvNotification");

/**
 * Saves a notification and then attempts to send a push notification.
 * This guarantees the notification is stored in the database for the driver
 * regardless of whether they have an FCM token.
 */
export const sendPushNotification = async (
  type,
  driverId,
  routeId,
  routeName,
  scheduleType,
  busDriverPairId,
  busPlateNumber,
  scheduledTime,
  title,
  body
) => {
  if (!driverId || typeof driverId !== "string" || driverId.trim() === "") {
    console.error(
      "sendPushNotification called without a valid driverId:",
      driverId
    );
    return;
  }
  if (!routeId || !routeName || !scheduleType) {
    console.error("Missing required parameters for notification:", {
      routeId,
      routeName,
      scheduleType,
    });
    return;
  }

  let finalScheduledDatetime;
  if (scheduledTime instanceof Date) {
    finalScheduledDatetime = scheduledTime;
  } else if (typeof scheduledTime === 'string') {
    finalScheduledDatetime = new Date(scheduledTime);
  } else if (scheduledTime && typeof scheduledTime.toDate === 'function') {
    finalScheduledDatetime = scheduledTime.toDate();
  }
  if (!finalScheduledDatetime || isNaN(finalScheduledDatetime.getTime())) {
    console.warn(
      `Could not determine a valid schedule datetime from:`,
      scheduledTime,
      `Falling back to the current time.`
    );
    finalScheduledDatetime = new Date();
  }

  const pad = (num) => String(num).padStart(2, "0");
  const normalizedDate = `${finalScheduledDatetime.getFullYear()}-${pad(finalScheduledDatetime.getMonth() + 1)}-${pad(finalScheduledDatetime.getDate())}`;

  const key = `${type}-driver-${driverId}-${routeId}-${scheduleType}-${normalizedDate}`;

  try {
    const notificationsRef = collection(db, "notifications");
    const existingNotificationQuery = query(
      notificationsRef,
      where("key", "==", key),
      orderBy("created", "desc"),
      limit(1)
    );
    const existingNotificationSnapshot = await getDocs(existingNotificationQuery);
    if (!existingNotificationSnapshot.empty) {
     console.log(`Notification with key ${key} already exists. Skipping.`);
     return;
    }
    const notificationData = {
      key: key,
      type: type,
      audienceType: "driver",
      audienceId: driverId,
      routeId: routeId,
      routeName: routeName,
      scheduleType: scheduleType,
      busDriverPairId: busDriverPairId || null,
      busPlateNumber: busPlateNumber,
      scheduledDatetime: finalScheduledDatetime,
      latenessMinutes: 0,
      title: title,
      body: body || `Update for route: ${routeName}`,
    };
    
    await saveDrvNotificationFunction(notificationData);
    console.log(`Notification for driver ${driverId} saved to Firestore.`);

    const driverDocRef = doc(db, "drivers", driverId);
    const driverDocSnap = await getDoc(driverDocRef);

    if (driverDocSnap.exists() && driverDocSnap.data().pushToken) {
      const pushToken = driverDocSnap.data().pushToken;

      await sendDrvPushNotificationFunction({
        token: pushToken,
        title: title,
        body: notificationData.body,
      });
      console.log(`Push notification sent to driver: ${driverId}`);
    } else {
      console.warn(
        `Driver ${driverId} has no FCM token. Skipping push notification.`
      );
    }
  } catch (error) {
    console.error(
      `An error occurred during the notification process for driver ${driverId}:`,
      error
    );
  }
};
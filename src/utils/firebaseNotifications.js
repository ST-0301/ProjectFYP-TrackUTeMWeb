import { getFirestore, doc, getDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "@/firebase";

const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp, "asia-southeast1"); 
const saveNotificationFunction = httpsCallable(functions, "saveNotification");
const sendPushNotificationFunction = httpsCallable(functions, "sendNotification");

/**
 * Saves a notification and then attempts to send a push notification.
 * This guarantees the notification is stored in the database for the driver
 * regardless of whether they have an FCM token.
 */
export const sendPushNotification = async (
  driverId,
  type,
  routeName,
  routeType,
  scheduledTime,
  title,
  body
) => {
  if (!driverId) {
    console.error("sendPushNotification called without a driverId.");
    return;
  }

  const notificationData = {
    driverId,
    type,
    routeName,
    routeType,
    scheduledTime,
    title,
    body: body || `Update for route: ${routeName}`,
  };

  try {
    await saveNotificationFunction(notificationData);
    console.log(`Notification for driver ${driverId} saved to Firestore.`);

    const driverDocRef = doc(db, "drivers", driverId);
    const driverDocSnap = await getDoc(driverDocRef);

    if (driverDocSnap.exists() && driverDocSnap.data().fcmToken) {
      const fcmToken = driverDocSnap.data().fcmToken;

      await sendPushNotificationFunction({
        token: fcmToken,
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
    console.error(`An error occurred during the notification process for driver ${driverId}:`, error);
  }
};
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// import { getAnalytics } from "firebase/analytics";
import { getFirestore, collection } from "firebase/firestore";
import { getDatabase, ref } from "firebase/database";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries
// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyDwRWqAjl01vuIoM0FT9Lr2kzu3rUzY6Ew",
    authDomain: "trackutem-7c56e.firebaseapp.com",
    databaseURL: "https://trackutem-7c56e-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "trackutem-7c56e",
    storageBucket: "trackutem-7c56e.firebasestorage.app",
    messagingSenderId: "322741159514",
    appId: "1:322741159514:web:007bcf01571c2a70ec7a63",
    measurementId: "G-LX7JY3W1CB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);
const db = getFirestore(app);
const database = getDatabase(app);

const auth = getAuth(app);
const storage = getStorage(app);

// Create a reference to the driver collection
const driverCollection = collection(db, "drivers");
const busCollection = collection(db, "buses");

export { db, driverCollection, busCollection, database, ref, auth, storage };
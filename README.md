# 🚍 TrackUTeM Web

![License: MIT](https://img.shields.io/github/license/st-0301/ProjectFYP-TrackUTeMWeb?style=for-the-badge)
![GitHub issues](https://img.shields.io/github/issues/st-0301/ProjectFYP-TrackUTeMWeb?style=for-the-badge&color=brightgreen)
![GitHub stars](https://img.shields.io/github/stars/st-0301/ProjectFYP-TrackUTeMWeb?style=for-the-badge)

**TrackUTeM Web** is a real-time bus tracking system for UTeM students and staff. It helps users track campus buses, estimate arrival times, and provides an admin panel to manage routes, schedules, and drivers.

Built with **Vue.js** and **Firebase**, this project aims to reduce waiting times and improve the campus commuting experience.

---

## 📸 Screenshots
*(Add screenshots here later, for example:)*
![Dashboard Screenshot](./docs/dashboard-preview.png)
![Schedule Management](./docs/schedule-management.png)

## 🌐 Live Demo

You can try the live system hosted on GitHub Pages:

[![View Live Demo](https://img.shields.io/badge/View%20Live%20Demo-20c997?style=for-the-badge&logo=githubpages)](https://st-0301.github.io/ProjectFYP-TrackUTeMWeb/)

## ✨ Features

* 🚌 Real-time bus tracking and estimated arrival times
* 📅 Schedule and route management
* 👨‍✈️ Bus-driver pair assignment system
* 🔔 Push notification support for updates and alerts
* 📱 Responsive web interface (desktop and mobile)
* 🔒 Firebase Authentication for secure access control

## 🛠️ Tech Stack

This project is built with modern web technologies:

![Vue.js](https://img.shields.io/badge/Vue.js-35495E?style=for-the-badge&logo=vue.js&logoColor=4FC08D)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Vue Router](https://img.shields.io/badge/Vue_Router-35495E?style=for-the-badge&logo=vue.js)
![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-222222?style=for-the-badge&logo=github&logoColor=white)

* **Frontend:** Vue.js 3
* **Routing:** Vue Router
* **Backend & Database:** Firebase Firestore
* **Authentication:** Firebase Auth
* **Notifications:** Firebase Cloud Messaging (FCM)
* **Deployment:** GitHub Pages

## 🚀 Getting Started

Follow these steps to set up and run the project locally.

### Prerequisites

Make sure you have the following installed:
* [Node.js](https://nodejs.org/) (LTS recommended)
* [npm](https://www.npmjs.com/)
* A configured [Firebase](https://firebase.google.com/) project with:
    * Firestore
    * Authentication
    * Cloud Messaging

### 🧩 Local Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/st-0301/ProjectFYP-TrackUTeMWeb.git
    cd ProjectFYP-TrackUTeMWeb
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**
    Create a `.env` file in the root of the project. This is used for keys like the Google Maps API key.
    ```env
    VUE_APP_GOOGLE_MAPS_API_KEY="[YOUR_GOOGLE_MAPS_API_KEY]"
    ```

4.  **Configure Firebase:**
    The Firebase configuration is located in a JavaScript file, (e.g., `src/firebase.js` or `src/firebase/index.js`). Find the `firebaseConfig` object and replace it with your own project's credentials from the Firebase console.

    ```javascript
    // e.g., in src/firebase.js
    import { initializeApp } from "firebase/app";
    
    // Your web app's Firebase configuration
    const firebaseConfig = {
      apiKey: "[YOUR_FIREBASE_API_KEY]",
      authDomain: "[YOUR_FIREBASE_AUTH_DOMAIN]",
      databaseURL: "[YOUR_FIREBASE_DATABASE_URL]",
      projectId: "[YOUR_FIREBASE_PROJECT_ID]",
      storageBucket: "[YOUR_FIREBASE_STORAGE_BUCKET]",
      messagingSenderId: "[YOUR_FIREBASE_MESSAGING_SENDER_ID]",
      appId: "[YOUR_FIREBASE_APP_ID]",
      measurementId: "[YOUR_FIREBASE_MEASUREMENT_ID]"
    };

    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    // ... rest of your file
    ```

## ⚙️ Available Scripts

Once installed, you can run the following commands:

* **Run in development mode:**
    ```bash
    npm run serve
    ```
    The app will be accessible at `http://localhost:8080`.

* **Build for production:**
    ```bash
    npm run build
    ```

* **Deploy to GitHub Pages:**
    ```bash
    npm run deploy
    ```

## 🗃️ Firestore Database Structure

The project uses Firebase Firestore to store data. The data is organized into the following top-level collections:

| Collection | Purpose |
| :--- | :--- |
| `/admins` | Stores administrator user accounts and permissions. |
| `/drivers` | Stores driver information (name, contact, etc.). |
| `/buses` | Stores details for each bus (plate number, capacity). |
| `/routes` | Defines the different bus routes (e.g., "Hop On Induk"). |
| `/routePoints` | Stores the specific geographic coordinates (stops) for each route. |
| `/schedules` | Manages the bus schedules, linking routes, buses, and times. |
| `/busDriverPairings` | Tracks the real-time assignment of a specific driver to a specific bus. |

**Note:** You do not need to manually create these collections in your Firebase console. Firestore will automatically create them when the first document is added by the application.

## 👩‍💻 Author

Ng Sue Ting
Final Year Project — Universiti Teknikal Malaysia Melaka (UTeM)

🔗 GitHub: [@ST-0301](https://github.com/st-0301)

🌐 Live Demo: https://st-0301.github.io/ProjectFYP-TrackUTeMWeb/

## 📄 License

This project is released under the MIT License.
You are free to use and modify this code for educational or non-commercial purposes with proper attribution.

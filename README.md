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

3.  **Configure Firebase:**
    Create a `.env` file in the root of the project and add your Firebase project credentials:
    ```env
    VITE_API_KEY="[YOUR_FIREBASE_API_KEY]"
    VITE_AUTH_DOMAIN="[YOUR_FIREBASE_AUTH_DOMAIN]"
    VITE_PROJECT_ID="[YOUR_FIREBASE_PROJECT_ID]"
    # ...add other Firebase environment variables here
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

## 👩‍💻 Author

Ng Sue Ting
Final Year Project — Universiti Teknikal Malaysia Melaka (UTeM)

🔗 GitHub: [@ST-0301](https://github.com/st-0301)

🌐 Live Demo: https://st-0301.github.io/ProjectFYP-TrackUTeMWeb/

## 🪪 License

This project is released under the MIT License.
You are free to use and modify this code for educational or non-commercial purposes with proper attribution.

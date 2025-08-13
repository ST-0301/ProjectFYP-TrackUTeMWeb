import { createRouter, createWebHistory } from "vue-router";
import { getAuth, onAuthStateChanged } from "firebase/auth";
// import Dashboard from "../views/Dashboard.vue";
// import Tables from "../views/Tables.vue";
import DriverLocation from '../views/DriverLocation.vue';
import Drivers from "../views/Drivers.vue";
import Buses from "../views/Buses.vue";
import RoutePoints from "../views/RoutePoints.vue";
import Routes from "../views/Routes.vue";
// import Schedule from "../views/components/Schedule-copy.vue";
import Schedule from "../views/components/Schedule-copy2.vue";
import Schedules from "../views/Schedules.vue";

import Profile from "../views/Profile.vue";
// import Signup from "../views/Signup.vue";
import Signin from "../views/Signin.vue";

const routes = [
  {
    path: "/",
    name: "/",
    meta: {
      requiresAuth: true,
    },
    redirect: "/driver-location",
  },
  // {
  //   path: "/dashboard-default",
  //   name: "Dashboard",
  //   component: Dashboard,
  // },
  // {
  //   path: "/tables",
  //   name: "Tables",
  //   component: Tables,
  // },
  {
    path: "/driver-location",
    name: "driver-location",
    component: DriverLocation,
    meta: {
      requiresAuth: true,
    },
  },
  {
    path: "/drivers",
    name: "Drivers",
    component: Drivers,
    meta: {
      requiresAuth: true,
    },
  },
  {
    path: "/buses",
    name: "Buses",
    component: Buses,
    meta: {
      requiresAuth: true,
    },
  },
  {
    path: "/locations",
    name: "Locations",
    component: RoutePoints,
    meta: {
      requiresAuth: true,
    },
  },
  {
    path: "/routes",
    name: "routes",
    component: Routes,
    meta: {
      requiresAuth: true,
    },
  },
  {
    path: "/routes/:id/schedule",
    name: "RouteSchedule",
    component: Schedule,
    meta: {
      requiresAuth: true,
    },
  },
  {
    path: "/schedules",
    name: "Schedules",
    component: Schedules,
    meta: {
      requiresAuth: true,
    },
  },
  {
    path: "/profile",
    name: "Profile",
    component: Profile,
    meta: {
      requiresAuth: true,
    },
  },
  {
    path: "/signin",
    name: "Signin",
    component: Signin,
  },
  // {
  //   path: "/signup",
  //   name: "Signup",
  //   component: Signup,
  // },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
  linkActiveClass: "active",
});

const getCurrentUser = () => {
  return new Promise((resolve, reject) => {
    const removeListener = onAuthStateChanged(
      getAuth(),
      (user) => {
        removeListener();
        resolve(user);
      },
      reject
    );
  });
};

router.beforeEach(async (to, from, next) => {
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth);
  const user = await getCurrentUser();

  if (requiresAuth && !user) {
    next("/signin");
  } else if (to.path === "/signin" && user) {
    next("/driver-location");
  } else {
    next();
  }
});
export default router;

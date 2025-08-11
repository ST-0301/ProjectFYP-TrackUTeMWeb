import { createRouter, createWebHistory } from "vue-router";
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
import Signup from "../views/Signup.vue";
import Signin from "../views/Signin.vue";

const routes = [
  {
    path: "/",
    name: "/",
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
  },
  {
    path: "/drivers",
    name: "Drivers",
    component: Drivers,
  },
  {
    path: "/buses",
    name: "Buses",
    component: Buses,
  },
  {
    path: "/locations",
    name: "Locations",
    component: RoutePoints,
  },
  {
    path: "/routes",
    name: "routes",
    component: Routes,
  },
  {
    path: "/routes/:id/schedule",
    name: "RouteSchedule",
    component: Schedule,
  },
  {
    path: "/schedules",
    name: "Schedules",
    component: Schedules,
  },
  {
    path: "/profile",
    name: "Profile",
    component: Profile,
  },
  {
    path: "/signin",
    name: "Signin",
    component: Signin,
  },
  {
    path: "/signup",
    name: "Signup",
    component: Signup,
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
  linkActiveClass: "active",
});

export default router;

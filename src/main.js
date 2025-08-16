import { createApp } from "vue";
import App from "./App.vue";
import store from "./store";
import createMyRouter from "./router";
import "./assets/css/nucleo-icons.css";
import "./assets/css/nucleo-svg.css";
import ArgonDashboard from "./argon-dashboard";

const appInstance = createApp(App);
appInstance.use(store);
const router = createMyRouter(store);
appInstance.use(router);
appInstance.use(ArgonDashboard);
appInstance.mount("#app");

<script setup>
import { ref, onMounted } from "vue";
import { useStore } from "vuex";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { adminCollection } from "@/firebase";
import { useRouter } from "vue-router";
import Breadcrumbs from "../Breadcrumbs.vue";

const showMenu = ref(false);
const store = useStore();
const router = useRouter();
const minimizeSidebar = () => store.commit("sidebarMinimize");
const closeMenu = () => {
  setTimeout(() => {
    showMenu.value = false;
  }, 100);
};
const user = ref(null);
const userData = ref(null);
const auth = getAuth();

const fetchUserData = async (uid) => {
  try {
    const userDoc = await getDoc(doc(adminCollection, uid));
    if (userDoc.exists()) {
      userData.value = userDoc.data();
    }
  } catch (error) {
    console.error("Error fetching user data:", error);
  }
};
const getUserDisplayName = () => {
  if (userData.value?.name) {
    return userData.value.name;
  }
  return user.value?.email || '';
};
const handleLogout = async () => {
  try {
    await signOut(auth);
    router.push("/signin");
  } catch (error) {
    console.error("Logout error:", error);
  }
};
const navigateToProfile = () => {
  router.push({ name: 'Profile' });
  showMenu.value = false;
};
onMounted(() => {
  onAuthStateChanged(auth, async (authUser) => {
    if (authUser) {
      user.value = authUser;
      await fetchUserData(authUser.uid);
    } else {
      user.value = null;
      userData.value = null;
    }
  });
});
</script>

<template>
  <nav class="navbar navbar-main navbar-expand-lg px-0 mx-4 shadow-none border-radius-xl" v-bind="$attrs"
    id="navbarBlur" data-scroll="true">
    <div class="px-3 py-1 container-fluid">
      <Breadcrumbs />

      <div class="mt-2 collapse navbar-collapse mt-sm-0 me-md-0 me-sm-4" id="navbar">
        <ul class="navbar-nav justify-content-end ms-md-auto">
          <li class="nav-item d-flex align-items-center">
            <router-link v-if="!user" :to="{ name: 'Signin' }" class="px-0 nav-link font-weight-bold text-white">
              <i class="fa fa-user me-sm-2"></i>
              <span class="d-sm-inline d-none">Sign In</span>
            </router-link>

            <div v-else class="nav-item dropdown">
              <a href="#" class="px-0 nav-link font-weight-bold text-white" :class="[showMenu ? 'show' : '']"
                id="profileDropdownMenuButton" data-bs-toggle="dropdown" aria-expanded="false"
                @click="showMenu = !showMenu" @blur="closeMenu">
                <i class="fa fa-user me-sm-2"></i>
                <span class="d-sm-inline d-none">
                  {{ getUserDisplayName() }}
                </span>
              </a>
              <ul class="dropdown-menu dropdown-menu-end" :class="showMenu ? 'show' : ''"
                aria-labelledby="profileDropdownMenuButton">
                <li>
                  <a class="dropdown-item" href="#" @click.prevent="navigateToProfile">
                    <i class="fas fa-user me-2"></i> Profile
                  </a>
                </li>
                <li>
                  <a class="dropdown-item" href="#" @click.prevent="handleLogout">
                    <i class="fas fa-sign-out-alt me-2"></i> Logout
                  </a>
                </li>
              </ul>
            </div>
          </li>
          <li class="nav-item d-xl-none ps-3 d-flex align-items-center">
            <a href="#" @click="minimizeSidebar" class="p-0 nav-link text-white" id="iconNavbarSidenav">
              <div class="sidenav-toggler-inner">
                <i class="sidenav-toggler-line bg-white"></i>
                <i class="sidenav-toggler-line bg-white"></i>
                <i class="sidenav-toggler-line bg-white"></i>
              </div>
            </a>
          </li>
        </ul>
      </div>
    </div>
  </nav>
</template>
<script setup>
import { onBeforeUnmount, onBeforeMount, ref } from "vue";
import { useStore } from "vuex";
import { useRouter } from "vue-router";
import { adminCollection } from '@/firebase';
import { getAuth, signInWithEmailAndPassword, setPersistence, browserSessionPersistence, browserLocalPersistence, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import AppFooter from "@/examples/PageLayout/Footer.vue";
import ArgonInput from "@/components/ArgonInput.vue";
import ArgonSwitch from "@/components/ArgonSwitch.vue";
import ArgonButton from "@/components/ArgonButton.vue";


const body = document.getElementsByTagName("body")[0];
const store = useStore();
const router = useRouter();
// Reactive state
// Data state
const email = ref("");
const password = ref("");
const rememberMe = ref(false);
// UI state
const showPassword = ref(false);
// Error state
const errorMessage = ref("");


// Lifecycle hooks
onBeforeMount(() => {
  store.state.hideConfigButton = true;
  store.state.showNavbar = false;
  store.state.showSidenav = false;
  store.state.showFooter = false;
  body.classList.remove("bg-gray-100");
});
onBeforeUnmount(() => {
  store.state.hideConfigButton = false;
  store.state.showNavbar = true;
  store.state.showSidenav = true;
  store.state.showFooter = true;
  body.classList.add("bg-gray-100");
});


// Validation functions
const validateEmail = (email) => {
  const re = /^[^\s@]+@utem\.edu\.my$/;
  return re.test(email);
};
const validatePassword = (password) => {
  const re = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?#^;:,./])[A-Za-z\d@$!%*?#^;:,./]{8,}$/;
  return re.test(password);
};


// UI handlers
const handleSignIn = async () => {
  errorMessage.value = "";
  if (!validateEmail(email.value)) {
    errorMessage.value = "Please use a valid UTEM email (@utem.edu.my)";
    return;
  }
  if (!validatePassword(password.value)) {
    errorMessage.value = "Password must be 8+ characters with uppercase, lowercase, number, and special character";
    return;
  }
  try {
    const auth = getAuth();
    await setPersistence(auth, rememberMe.value ? browserLocalPersistence : browserSessionPersistence);
    const userCredential = await signInWithEmailAndPassword(auth, email.value, password.value);
    const adminRef = doc(adminCollection, userCredential.user.uid);
    const adminSnap = await getDoc(adminRef);

    if (adminSnap.exists()) {
      if (adminSnap.data().status === 'disabled') {
        await auth.signOut();
        errorMessage.value = "Your account has been disabled.";
        return;
      }
      if (adminSnap.data().status === 'pending') {
        await updateDoc(adminRef, { status: 'active' });
      }
      router.push("/realtime-location");
    } else {
      await signOut(auth);
      errorMessage.value = "You do not have permission to access this system.";
    }
    // await signInWithEmailAndPassword(auth, email.value, password.value);
    // router.push("/realtime-location");
  } catch (error) {
    console.error("Login error:", error);
    switch (error.code) {
      case "auth/user-not-found":
        errorMessage.value = "User not found. Please check your email.";
        break;
      case "auth/wrong-password":
        errorMessage.value = "Incorrect password. Please try again.";
        break;
      default:
        errorMessage.value = "Login failed. Please try again later.";
    }
  }
};
</script>



<template>
  <main class="main-content mt-0">
    <div class="page-header align-items-start min-vh-50 pt-5 pb-11 m-3 border-radius-lg" style="
        background-image: url('https://raw.githubusercontent.com/creativetimofficial/public-assets/master/argon-dashboard-pro/assets/img/signup-cover.jpg');
        background-position: top;
      ">
      <span class="mask bg-gradient-dark opacity-6"></span>
      <div class="container">
        <div class="row justify-content-center">
          <div class="col-lg-5 text-center mx-auto">
            <h1 class="text-white mb-2 mt-5">Welcome Back!</h1>
            <p class="text-lead text-white">
              Sign in to access your account and continue your journey.
            </p>
          </div>
        </div>
      </div>
    </div>
    <div class="container">
      <div class="row mt-lg-n10 mt-md-n11 mt-n10 justify-content-center">
        <div class="col-xl-4 col-lg-5 col-md-7 mx-auto">
          <div class="card z-index-0">
            <div class="card-header text-center pt-4">
              <h5>Sign in to your account</h5>
            </div>
            <div class="card-body">
              <form role="form" @submit.prevent="handleSignIn">
                <argon-input id="email" type="email" placeholder="Email" aria-label="Email" size="lg" v-model="email"
                  required />
                <div class="password-input-group">
                  <argon-input id="password" :type="showPassword ? 'text' : 'password'" placeholder="Password"
                    aria-label="Password" size="lg" class="password-field" v-model="password" required />
                  <span class="password-toggle m-1" @click="showPassword = !showPassword">
                    <i :class="showPassword ? 'fas fa-eye-slash' : 'fas fa-eye'"></i>
                  </span>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-3">
                  <argon-switch id="rememberMe" name="remember-me" v-model="rememberMe">Remember me</argon-switch>
                  <a href="#" class="text-sm text-dark font-weight-bold">Forgot password?</a>
                </div>
                <div v-if="errorMessage" class="alert alert-danger text-white mt-3">
                  {{ errorMessage }}
                </div>

                <div class="text-center">
                  <argon-button fullWidth color="dark" variant="gradient" class="my-4 mb-2" size="lg" type="submit">
                    Sign in
                  </argon-button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
  <app-footer />
</template>
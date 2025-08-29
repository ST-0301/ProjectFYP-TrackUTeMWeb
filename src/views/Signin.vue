<script setup>
import { onBeforeUnmount, onBeforeMount, ref, onMounted } from "vue";
import { useStore } from "vuex";
import { useRouter } from "vue-router";
import { adminCollection } from '@/firebase';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, setPersistence, browserSessionPersistence, browserLocalPersistence } from "firebase/auth";
import { query, where, getDocs, updateDoc } from "firebase/firestore";
import AppFooter from "@/examples/PageLayout/Footer.vue";
import ArgonButton from "@/components/ArgonButton.vue";
import ArgonInput from "@/components/ArgonInput.vue";
import ArgonSwitch from "@/components/ArgonSwitch.vue";


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
const isLoading = ref(false);
// Error state
const errorMessage = ref("");


// Lifecycle hooks
onBeforeMount(() => {
  store.state.showNavbar = false;
  store.state.showSidenav = false;
  store.state.showFooter = false;
  body.classList.remove("bg-gray-100");
});
onBeforeUnmount(() => {
  store.state.showNavbar = true;
  store.state.showSidenav = true;
  store.state.showFooter = true;
  body.classList.add("bg-gray-100");
});
onMounted(() => {
  checkExistingAuth();
});
const checkExistingAuth = () => {
  const auth = getAuth();
  isLoading.value = true;
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const q = query(adminCollection, where("email", "==", user.email));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const adminDoc = querySnapshot.docs[0];
          const adminData = adminDoc.data();
          if (adminData.status === 'disabled') {
            await auth.signOut();
            errorMessage.value = "Your account has been disabled. Please contact the administrator.";
          } else {
            router.push('/live-driver-map');
          }
        } else {
          await auth.signOut();
          errorMessage.value = "Unauthorized access. You do not have permission to access this system.";
        }
      } catch (error) {
        console.error("Auth check error:", error);
        await auth.signOut();
      }
    }
    isLoading.value = false;
  });
};


// Validation functions
const validateEmail = (email) => {
  const re = /^[^\s@]+@utem\.edu\.my$/;
  return re.test(email);
};


// UI handlers
const handleSignIn = async () => {
  errorMessage.value = '';
  if (!email.value || !password.value) {
    errorMessage.value = "Please enter both email and password.";
    return;
  } else if (!validateEmail(email.value)) {
    errorMessage.value = "Please use a valid UTeM email (@utem.edu.my)";
    return;
  }
  isLoading.value = true;

  try {
    const auth = getAuth();
    const persistenceType = rememberMe.value
      ? browserLocalPersistence
      : browserSessionPersistence;
    await setPersistence(auth, persistenceType);

    const q = query(adminCollection, where("email", "==", email.value));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      errorMessage.value = "Unauthorized access. You do not have permission to access this system.";
      return;
    }

    const adminDoc = querySnapshot.docs[0];
    const adminData = adminDoc.data();
    if (adminData.status === 'disabled') {
      errorMessage.value = "Your account has been disabled. Please contact the administrator.";
      return;
    }

    await signInWithEmailAndPassword(auth, email.value, password.value);

    if (adminData.status === 'pending') {
      await updateDoc(adminDoc.ref, { status: 'active', link: null, linkGeneratedAt: null });
    }
    router.push('/live-driver-map');
  } catch (error) {
    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      errorMessage.value = 'Invalid email or password.';
    } else {
      console.error("Sign-in error:", error);
      errorMessage.value = "An unexpected error occurred. Please try again.";
    }
    isLoading.value = false;
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
                  <argon-switch id="rememberMe" name="remember-me" :checked="rememberMe"
                    @change="rememberMe = $event.target.checked">Remember me</argon-switch>
                </div>
                <div v-if="errorMessage" class="alert alert-danger text-white mt-3">
                  {{ errorMessage }}
                </div>

                <div class="text-center">
                  <argon-button fullWidth color="dark" variant="gradient" class="my-4 mb-2" size="lg" type="submit"
                    :disabled="isLoading">
                    <span v-if="!isLoading">Sign in</span>
                    <span v-else>
                      <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                      Signing in...
                    </span>
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
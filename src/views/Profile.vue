<script setup>
import { ref, onBeforeMount, onMounted, onBeforeUnmount } from "vue";
import { useStore } from "vuex";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { adminCollection } from '@/firebase';

import setNavPills from "@/assets/js/nav-pills.js";
import setTooltip from "@/assets/js/tooltip.js";
import ArgonInput from "@/components/ArgonInput.vue";
import ArgonButton from "@/components/ArgonButton.vue";
import AdminsTable from '@/views/components/AdminsTable.vue';

const body = document.getElementsByTagName("body")[0];
const store = useStore();
const auth = getAuth();

const adminData = ref(null);
const name = ref('');
const email = ref('');
const isLoading = ref(true);
const showSuccessModal = ref(false);
const updatedName = ref('');
const refreshKey = ref(0);

const fetchAdminData = async (uid) => {
  try {
    const adminDoc = await getDoc(doc(adminCollection, uid));
    if (adminDoc.exists()) {
      adminData.value = adminDoc.data();
      name.value = adminData.value.name;
      email.value = adminData.value.email;
    }
  } catch (error) {
    console.error("Error fetching admin data:", error);
  } finally {
    isLoading.value = false;
  }
};

const updateProfile = async () => {
  try {
    const user = auth.currentUser;
    if (!user) return;

    isLoading.value = true;
    await updateDoc(doc(adminCollection, user.uid), {
      name: name.value
    });
    updatedName.value = name.value;
    showSuccessModal.value = true;
    await fetchAdminData(user.uid);
    refreshKey.value++; 
  } catch (error) {
    console.error("Error updating profile:", error);
  } finally {
    isLoading.value = false;
  }
};


onMounted(() => {
  store.state.isAbsolute = true;
  setNavPills();
  setTooltip();

  onAuthStateChanged(auth, (user) => {
    if (user) {
      fetchAdminData(user.uid);
    }
  });
});
onBeforeMount(() => {
  store.state.imageLayout = "profile-overview";
  store.state.showNavbar = false;
  store.state.showFooter = true;
  body.classList.add("profile-overview");
});
onBeforeUnmount(() => {
  store.state.isAbsolute = false;
  store.state.imageLayout = "default";
  store.state.showNavbar = true;
  store.state.showFooter = true;
  body.classList.remove("profile-overview");
});
</script>
<template>
  <main>
    <div class="container-fluid">
      <div class="page-header min-height-300" style="
          background-image: url(&quot;https://images.unsplash.com/photo-1531512073830-ba890ca4eba2?ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&ixlib=rb-1.2.1&auto=format&fit=crop&w=1920&q=80&quot;);
          margin-right: -24px;
          margin-left: -34%;
        ">
        <span class="mask bg-gradient-trackutemblue opacity-6"></span>
      </div>
      <div class="card shadow-lg mt-n6">
        <div class="card-body p-3">
          <div class="row gx-4 mb-2">
            <div class="col-auto">
            </div>
            <div class="col-auto my-auto">
              <div class="h-100">
                <h5 class="text-uppercase mb-1" v-if="!isLoading">{{ name }}</h5>
                <h5 class="mb-1" v-else>Loading...</h5>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="py-4 container-fluid">
      <div class="card">
        <div class="card-header pb-0">
          <div class="d-flex align-items-center">
            <h6 class="mb-0">Edit Profile</h6>
            <argon-button color="trackutemlightblue" size="sm" class="ms-auto text-white" @click="updateProfile"
              :disabled="isLoading">Update
              Profile</argon-button>
          </div>
        </div>
        <div class="card-body">
          <p class="text-uppercase text-sm">User Information</p>
          <div class="row">
            <div class="col-md-6">
              <label for="example-text-input" class="form-control-label">Name</label>
              <argon-input type="text" v-model="name" :disabled="isLoading" />
            </div>
            <div class="col-md-6">
              <label for="example-text-input" class="form-control-label">Email address</label>
              <argon-input type="email" v-model="email" disabled />
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="py-4 container-fluid">
      <AdminsTable :refreshKey="refreshKey" />
    </div>

    <!-- Success Modal -->
    <div class="modal fade" :class="{ 'show d-block': showSuccessModal }" tabindex="-1" role="dialog">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Profile Updated</h5>
            <button type="button" class="btn-close" @click="showSuccessModal = false"></button>
          </div>
          <div class="modal-body">
            <p>Your name has been successfully updated to <strong>{{ updatedName }}</strong>.</p>
          </div>
          <div class="d-flex justify-content-end gap-3 mt-4">
            <argon-button color="success" @click="showSuccessModal = false">OK</argon-button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show" v-if="showSuccessModal"></div>
  </main>
</template>

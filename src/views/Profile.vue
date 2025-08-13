<script setup>
import { onBeforeMount, onMounted, onBeforeUnmount } from "vue";
import { useStore } from "vuex";

import setNavPills from "@/assets/js/nav-pills.js";
import setTooltip from "@/assets/js/tooltip.js";
import ArgonInput from "@/components/ArgonInput.vue";
import ArgonButton from "@/components/ArgonButton.vue";

const body = document.getElementsByTagName("body")[0];

const store = useStore();

onMounted(() => {
  store.state.isAbsolute = true;
  setNavPills();
  setTooltip();
});
onBeforeMount(() => {
  store.state.imageLayout = "profile-overview";
  store.state.showNavbar = false;
  store.state.showFooter = true;
  store.state.hideConfigButton = true;
  body.classList.add("profile-overview");
});
onBeforeUnmount(() => {
  store.state.isAbsolute = false;
  store.state.imageLayout = "default";
  store.state.showNavbar = true;
  store.state.showFooter = true;
  store.state.hideConfigButton = false;
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
        <span class="mask bg-gradient-success opacity-6"></span>
      </div>
      <div class="card shadow-lg mt-n6">
        <div class="card-body p-3">
          <div class="row gx-4">
            <div class="col-auto">
            </div>
            <div class="col-auto my-auto">
              <div class="h-100">
                <h5 class="mb-1">Sayo Kravits</h5>
              </div>
            </div>
            <div class="mx-auto mt-3 col-lg-4 col-md-6 my-sm-auto ms-sm-auto me-sm-0">
              <div class="nav-wrapper position-relative end-0">
                <ul class="p-1 bg-transparent nav nav-pills nav-fill" role="tablist">
                  <li class="nav-item">
                    <a class="px-0 py-1 mb-0 nav-link" data-bs-toggle="tab" href="javascript:;" role="tab"
                      aria-selected="false">
                      <svg class="text-dark" width="16px" height="16px" viewBox="0 0 40 40" version="1.1"
                        xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
                        <title>settings</title>
                        <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
                          <g transform="translate(-2020.000000, -442.000000)" fill="#FFFFFF" fill-rule="nonzero">
                            <g transform="translate(1716.000000, 291.000000)">
                              <g transform="translate(304.000000, 151.000000)">
                                <polygon class="color-background" opacity="0.596981957"
                                  points="18.0883333 15.7316667 11.1783333 8.82166667 13.3333333 6.66666667 6.66666667 0 0 6.66666667 6.66666667 13.3333333 8.82166667 11.1783333 15.315 17.6716667" />
                                <path class="color-background"
                                  d="M31.5666667,23.2333333 C31.0516667,23.2933333 30.53,23.3333333 30,23.3333333 C29.4916667,23.3333333 28.9866667,23.3033333 28.48,23.245 L22.4116667,30.7433333 L29.9416667,38.2733333 C32.2433333,40.575 35.9733333,40.575 38.275,38.2733333 L38.275,38.2733333 C40.5766667,35.9716667 40.5766667,32.2416667 38.275,29.94 L31.5666667,23.2333333 Z"
                                  opacity="0.596981957" />
                                <path class="color-background"
                                  d="M33.785,11.285 L28.715,6.215 L34.0616667,0.868333333 C32.82,0.315 31.4483333,0 30,0 C24.4766667,0 20,4.47666667 20,10 C20,10.99 20.1483333,11.9433333 20.4166667,12.8466667 L2.435,27.3966667 C0.95,28.7083333 0.0633333333,30.595 0.00333333333,32.5733333 C-0.0583333333,34.5533333 0.71,36.4916667 2.11,37.89 C3.47,39.2516667 5.27833333,40 7.20166667,40 C9.26666667,40 11.2366667,39.1133333 12.6033333,37.565 L27.1533333,19.5833333 C28.0566667,19.8516667 29.01,20 30,20 C35.5233333,20 40,15.5233333 40,10 C40,8.55166667 39.685,7.18 39.1316667,5.93666667 L33.785,11.285 Z" />
                              </g>
                            </g>
                          </g>
                        </g>
                      </svg>
                      <span class="ms-1">Settings</span>
                    </a>
                  </li>
                </ul>
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
            <p class="mb-0">Edit Profile</p>
            <argon-button color="success" size="sm" class="ms-auto">Settings</argon-button>
          </div>
        </div>
        <div class="card-body">
          <p class="text-uppercase text-sm">User Information</p>
          <div class="row">
            <div class="col-md-6">
              <label for="example-text-input" class="form-control-label">Username</label>
              <argon-input type="text" value="lucky.jesse" />
            </div>
            <div class="col-md-6">
              <label for="example-text-input" class="form-control-label">Email address</label>
              <argon-input type="email" value="jesse@example.com" />
            </div>
            <div class="col-md-6">
              <label for="example-text-input" class="form-control-label">First name</label>
              <input class="form-control" type="text" value="Jesse" />
            </div>
            <div class="col-md-6">
              <label for="example-text-input" class="form-control-label">Last name</label>
              <argon-input type="text" value="Lucky" />
            </div>
          </div>
          <hr class="horizontal dark" />
          <p class="text-uppercase text-sm">Contact Information</p>
          <div class="row">
            <div class="col-md-12">
              <label for="example-text-input" class="form-control-label">Address</label>
              <argon-input type="text" value="Bld Mihail Kogalniceanu, nr. 8 Bl 1, Sc 1, Ap 09" />
            </div>
            <div class="col-md-4">
              <label for="example-text-input" class="form-control-label">City</label>
              <argon-input type="text" value="New York" />
            </div>
            <div class="col-md-4">
              <label for="example-text-input" class="form-control-label">Country</label>
              <argon-input type="text" value="United States" />
            </div>
            <div class="col-md-4">
              <label for="example-text-input" class="form-control-label">Postal code</label>
              <argon-input type="text" value="437300" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

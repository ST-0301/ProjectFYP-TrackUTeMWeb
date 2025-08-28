<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { updateDoc, onSnapshot, doc, getDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import { driverCollection, busCollection, busDriverPairingCollection } from '@/firebase';
import BusDriverPairingsTable from '@/views/components/BusDriverPairingsTable.vue';
import ArgonButton from "@/components/ArgonButton.vue";
import ArgonInput from "@/components/ArgonInput.vue";
import ArgonSwitch from "@/components/ArgonSwitch.vue";


// Constants
const statusDisplay = {
    pending: {
        label: "Pending",
        color: "bg-gradient-primary",
        icon: "fas fa-clock",
        tooltip: "Driver account setup pending"
    },
    available: {
        label: "Available",
        color: "bg-gradient-success",
        icon: "fas fa-check-circle",
        tooltip: "Driver is ready for work"
    },
    on_duty: {
        label: "On Duty",
        color: "bg-gradient-warning",
        icon: "fas fa-route",
        tooltip: "Driver is currently working"
    },
    off_duty: {
        label: "Off Duty",
        color: "bg-gradient-secondary",
        icon: "fas fa-power-off",
        tooltip: "Driver is off for the day"
    },
    disabled: {
        label: "Disabled",
        color: "bg-white border border-secondary",
        icon: "fas fa-ban",
        textClass: "text-secondary font-italic",
        tooltip: "Driver account is disabled"
    }
};
// Reactive state
// Data state
const drivers = ref([]);
const buses = ref([]);
const busDriverPairings = ref([]);
const currentDriver = ref(createDefaultDriver());
// const driverToDelete = ref(null);
const passwordResetLink = ref('');
const currentLinkTime = ref(null);
const selectedDriverEmail = ref('');
const driverToDisable = ref(null);
const driverToActivate = ref(null);
// UI state
const showAddDriverModal = ref(false);
const showDisableModal = ref(false);
const showActivateModal = ref(false);
const showLinkModal = ref(false);
const showPairingModal = ref(false);
// const showPassword = ref(false);
const editingDriver = ref(false);
// const isDriverPaired = ref(false);
const isLoading = ref(false);
const isLoadingReset = ref({});
// Table state
const sortColumn = ref('name');
const sortDirection = ref('asc');
const currentPage = ref(1);
const itemsPerPage = ref(10);
// Error state
const errors = ref({ name: '', email: '', phone: '', licenseNumber: '', password: '', confirmPassword: '' });


// Computed properties
const sortedDrivers = computed(() => {
    if (!sortColumn.value) return drivers.value;
    return [...drivers.value].sort((a, b) => {
        let valA = a[sortColumn.value];
        let valB = b[sortColumn.value];
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return sortDirection.value === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection.value === 'asc' ? 1 : -1;
        return 0;
    });
});
const paginatedDrivers = computed(() => {
    const start = (currentPage.value - 1) * itemsPerPage.value;
    const end = start + itemsPerPage.value;
    return sortedDrivers.value.slice(start, end);
});
const totalItems = computed(() => sortedDrivers.value.length);
const totalPages = computed(() => Math.ceil(totalItems.value / itemsPerPage.value));
const showingFrom = computed(() => (currentPage.value - 1) * itemsPerPage.value + 1);
const showingTo = computed(() => {
    const to = currentPage.value * itemsPerPage.value;
    return to > totalItems.value ? totalItems.value : to;
});
const showLeftEllipsis = computed(() => {
    return currentPage.value > 3 && totalPages.value > 5;
});
const showRightEllipsis = computed(() => {
    return currentPage.value < totalPages.value - 2 && totalPages.value > 5;
});
const visiblePages = computed(() => {
    const pages = [];
    const maxVisible = 3;

    if (totalPages.value <= maxVisible) {
        for (let i = 1; i <= totalPages.value; i++) {
            pages.push(i);
        }
    } else {
        let start = Math.max(1, currentPage.value - 1);
        let end = Math.min(totalPages.value, currentPage.value + 1);

        if (currentPage.value <= 2) {
            end = maxVisible;
        } else if (currentPage.value >= totalPages.value - 1) {
            start = totalPages.value - maxVisible + 1;
        }

        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
    }

    return pages;
});


// Lifecycle hooks
onMounted(() => {
    const unsubscribeDrivers = onSnapshot(driverCollection, (snapshot) => {
        drivers.value = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    });
    const unsubscribeBuses = onSnapshot(busCollection, (snapshot) => {
        buses.value = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    });
    fetchPairings();
    return () => {
        unsubscribeDrivers();
        unsubscribeBuses();
    };
});


// Helper functions
function createDefaultDriver() {
    return {
        driverId: "",
        name: "",
        email: "",
        phone: "",
        licenseNumber: "",
        status: "pending",
        originalEmail: ""
    };
}
async function checkExistingEmail() {
    if (editingDriver.value && currentDriver.value.email === currentDriver.value.originalEmail) {
        return false;
    }

    const q = query(driverCollection, where("email", "==", currentDriver.value.email));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}
async function checkExistingLicense() {
    if (editingDriver.value) {
        const q = query(
            driverCollection,
            where("licenseNumber", "==", currentDriver.value.licenseNumber),
            where("driverId", "!=", currentDriver.value.driverId)
        );
        const snapshot = await getDocs(q);
        return !snapshot.empty;
    } else {
        const q = query(driverCollection, where("licenseNumber", "==", currentDriver.value.licenseNumber));
        const snapshot = await getDocs(q);
        return !snapshot.empty;
    }
}
const formatLicenseInput = (event) => {
    currentDriver.value.licenseNumber = event.target.value
        .replace(/[^A-Za-z0-9]/g, '')
        .slice(0, 8);
    validateLicense();
};
const formatPhoneInput = (event) => {
    currentDriver.value.phone = event.target.value
        .replace(/\D/g, '')
        .slice(0, 11);
    validatePhone();
};
const fetchPairings = async () => {
    try {
        const q = query(busDriverPairingCollection);
        const snapshot = await getDocs(q);
        busDriverPairings.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error fetching pairings:", error);
    }
};
const copyToClipboard = () => {
    navigator.clipboard.writeText(passwordResetLink.value);
    alert('Link copied to clipboard!');
};
const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown';
    try {
        let date;
        if (timestamp && typeof timestamp === 'object' && timestamp.toDate) {
            date = timestamp.toDate();
        } else if (timestamp instanceof Date) {
            date = timestamp;
        } else if (typeof timestamp === 'string') {
            date = new Date(timestamp);
        } else if (typeof timestamp === 'number') {
            date = new Date(timestamp);
        } else {
            console.warn('Unknown timestamp format:', timestamp);
            return 'Invalid date';
        }
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    } catch (error) {
        console.error('Error formatting date:', error, timestamp);
        return 'Invalid date';
    }
};


// Validation functions
const validateName = () => {
    errors.value.name = currentDriver.value.name.trim() ? '' : 'Name is required';
};
const validateEmail = async () => {
    const email = currentDriver.value.email.trim();
    const emailPattern = /^[a-zA-Z0-9._%+-]+@utem\.edu\.my$/i;
    if (!email) {
        errors.value.email = 'Email is required';
        return;
    }
    if (!emailPattern.test(email)) {
        errors.value.email = 'Must be a valid UTEM email address';
        return;
    }
    if (await checkExistingEmail()) {
        errors.value.email = 'Email already registered';
        return;
    }
    errors.value.email = '';
};
const validatePhone = () => {
    const phone = currentDriver.value.phone.trim();
    const phonePattern = /^\d{10,11}$/;
    if (!phone) {
        errors.value.phone = 'Phone number is required';
        return;
    }
    if (!phonePattern.test(phone)) {
        errors.value.phone = 'Must be 10-11 digits';
        return;
    }
    errors.value.phone = '';
};
const validateLicense = async () => {
    const license = currentDriver.value.licenseNumber.trim();
    const licensePattern = /^[A-Za-z0-9]{8}$/;
    if (!license) {
        errors.value.licenseNumber = 'License number is required';
        return;
    }
    if (!licensePattern.test(license)) {
        errors.value.licenseNumber = 'Must be exactly 8 alphanumeric characters';
        return;
    }
    if (await checkExistingLicense()) {
        errors.value.licenseNumber = 'License number already exists';
        return;
    }
    errors.value.licenseNumber = '';
};
async function validateForm() {
    validateName();
    await validateEmail();
    validatePhone();
    await validateLicense();
    return Object.values(errors.value).every(error => !error);
}


// CRUD operations
async function createDriver() {
    const isValid = await validateForm();
    if (!isValid) return;

    try {
        isLoading.value = true;
        errors.value = { name: '', email: '', phone: '', licenseNumber: '', general: '' };
        passwordResetLink.value = '';

        const functions = getFunctions(getApp(), 'asia-southeast1');
        const callDriverManagement = httpsCallable(functions, "driverAccountManagement");
        const auth = getAuth();
        const token = await auth.currentUser.getIdToken();
        const result = await callDriverManagement({
            action: 'createDriver',
            email: currentDriver.value.email,
            name: currentDriver.value.name,
            phone: currentDriver.value.phone,
            licenseNumber: currentDriver.value.licenseNumber,
        }, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const driverDocRef = doc(driverCollection, result.data.driverId);
        const driverDoc = await getDoc(driverDocRef);

        if (driverDoc.exists()) {
            const driverData = driverDoc.data();
            passwordResetLink.value = driverData.link;
            selectedDriverEmail.value = result.data.selectedDriverEmail;
            currentLinkTime.value = driverData.linkGeneratedAt ? driverData.linkGeneratedAt.toDate() : new Date();

            showAddDriverModal.value = false;
            currentDriver.value = createDefaultDriver();
            showLinkModal.value = true;
        } else {
            throw new Error('Failed to retrieve driver document after creation');
        }
    } catch (error) {
        console.error('Error creating driver:', error);
        if (error.code === 'already-exists') {
            errors.value.email = 'This email address is registered';
        } else if (error.code === 'permission-denied') {
            errors.value.general = 'You do not have permission to create driver accounts';
        } else {
            errors.value.general = error.message || 'Failed to create driver account';
        }
    } finally {
        isLoading.value = false;
    }
}
async function updateDriver() {
    const driverDocRef = doc(driverCollection, currentDriver.value.id);

    const updates = {
        name: currentDriver.value.name,
        phone: currentDriver.value.phone,
        licenseNumber: currentDriver.value.licenseNumber,
        status: currentDriver.value.status
};
    if (currentDriver.value.email !== currentDriver.value.originalEmail) {
        updates.email = currentDriver.value.email;
    }
    await updateDoc(driverDocRef, updates);
}
const disableDriver = async (driverId) => {
    try {
        errors.value.general = ''
        await updateDoc(doc(driverCollection, driverId), {
            status: 'disabled'
        });
        showDisableModal.value = false;
        driverToDisable.value = null;
    } catch (error) {
        console.error('Error disabling driver:', error);
        errors.value.general = error.message || 'Failed to disable driver';
    }
};
const activateDriver = async (driverId) => {
    try {
        errors.value.general = '';
        await updateDoc(doc(driverCollection, driverId), {
            status: 'available'
        });
        showActivateModal.value = false;
        driverToActivate.value = null;
    } catch (error) {
        console.error('Error activating driver:', error);
        errors.value.general = error.message || 'Failed to activate driver';
    }
};
const resetDriverPassword = async (email, driverId) => {
    try {
        isLoading.value = true;
        isLoadingReset.value[driverId] = true;
        errors.value.general = '';

        const driver = drivers.value.find(d => d.email === email);
        if (!driver) {
            throw new Error('Driver not found with email: ' + email);
        }

        const driverDocRef = doc(driverCollection, driver.id);
        const driverDoc = await getDoc(driverDocRef);
        if (driverDoc.exists()) {
            const driverData = driverDoc.data();

            const functions = getFunctions(getApp(), 'asia-southeast1');
            const callDriverManagement = httpsCallable(functions, "driverAccountManagement");
            const auth = getAuth();
            const token = await auth.currentUser.getIdToken();
            const result = await callDriverManagement({
                action: 'generateResetLink',
                email: email
            }, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            await updateDoc(driverDocRef, {
                link: result.data.resetLink,
                linkGeneratedAt: serverTimestamp()
            });
            passwordResetLink.value = result.data.resetLink;
            selectedDriverEmail.value = driverData.email;
            currentLinkTime.value = new Date();
            showLinkModal.value = true;
        } else {
            throw new Error('Driver document not found');
        }
    } catch (error) {
        console.error('Error resetting password:', error);
        errors.value.general = error.message || 'Failed to reset password';
    } finally {
        isLoading.value = false;
        isLoadingReset.value[driverId] = false;
    }
};


// UI handlers
const addDriver = () => {
    currentDriver.value = createDefaultDriver();
    editingDriver.value = false;
    showAddDriverModal.value = true;
};
const editDriver = (driver) => {
    currentDriver.value = {
        ...driver,
        originalEmail: driver.email
    };
    editingDriver.value = true;
    showAddDriverModal.value = true;
};
const saveDriver = async () => {
    if (editingDriver.value) {
        const isValid = await validateForm();
        if (!isValid) return;
        try {
            await updateDriver();
            closeModal();
        } catch (error) {
            console.error("Error updating driver:", error);
            errors.value.general = error.message;
        }
    } else {
        await createDriver();
    }
};
const confirmDisable = (id) => {
    driverToDisable.value = id;
    showDisableModal.value = true;
};
const confirmActivate = (id) => {
    driverToActivate.value = id;
    showActivateModal.value = true;
};
const showSetupLink = (driver) => {
    passwordResetLink.value = driver.link || '';
    selectedDriverEmail.value = driver.email;
    if (driver.linkGeneratedAt && driver.linkGeneratedAt.toDate) {
        currentLinkTime.value = driver.linkGeneratedAt.toDate();
    } else {
        currentLinkTime.value = driver.linkGeneratedAt || null;
    }
    showLinkModal.value = true;
};
const closeModal = () => {
    showAddDriverModal.value = false;
    showDisableModal.value = false;
    editingDriver.value = false;
    currentDriver.value = createDefaultDriver();
    errors.value = {
        name: '',
        email: '',
        phone: '',
        licenseNumber: '',
        general: ''
    };
};
const closeLinkModal = () => {
    showLinkModal.value = false;
    currentLinkTime.value = null;
    passwordResetLink.value = '';
    selectedDriverEmail.value = '';
};
const handleSort = (column) => {
    if (column === sortColumn.value) {
        sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn.value = column;
        sortDirection.value = 'asc';
    }
    currentPage.value = 1;
};
const goToPage = (page) => {
    if (page >= 1 && page <= totalPages.value) {
        currentPage.value = page;
    }
};


// Watchers
watch(drivers, (newDrivers) => {
    newDrivers.forEach(async (driver) => {
        if (driver.status === 'disabled') {
            const pairingQuery = query(
                busDriverPairingCollection,
                where("driverId", "==", driver.id)
            );
            const pairingSnapshot = await getDocs(pairingQuery);

            pairingSnapshot.forEach(async (doc) => {
                await updateDoc(doc.ref, {
                    isActive: false
                });
            });
        }
    });
}, { deep: true });
watch([sortColumn, sortDirection], () => {
    currentPage.value = 1;
});
</script>



<template>
    <div class="py-4 container-fluid">
        <div class="row">
            <div class="col-12">
                <div class="card">
                    <div class="card-header pb-0">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6>Driver List</h6>
                            <div>
                                <argon-button color="info" size="sm" variant="gradient" @click="showPairingModal = true"
                                    class="me-2">
                                    <i class="fas fa-link"></i> View Pairings
                                </argon-button>
                                <argon-button color="success" size="sm" @click="addDriver">
                                    <i class="ni ni-fat-add"></i> Add Driver
                                </argon-button>
                            </div>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="table-responsive p-0">
                            <table class="table table-hover align-items-center justify-content-center mb-0">
                                <thead>
                                    <tr>
                                        <th class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2 cursor-pointer"
                                            @click="handleSort('name')">
                                            Driver
                                            <i v-if="sortColumn === 'name'" class="fas ms-1"
                                                :class="sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down'"></i>
                                        </th>
                                        <th class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2 cursor-pointer"
                                            @click="handleSort('phone')">
                                            Phone
                                            <i v-if="sortColumn === 'phone'" class="fas ms-1"
                                                :class="sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down'"></i>
                                        </th>
                                        <th class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2 cursor-pointer"
                                            @click="handleSort('licenseNumber')">
                                            License Number
                                            <i v-if="sortColumn === 'licenseNumber'" class="fas ms-1"
                                                :class="sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down'"></i>
                                        </th>
                                        <th class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2 cursor-pointer"
                                            @click="handleSort('status')">
                                            Status
                                            <i v-if="sortColumn === 'status'" class="fas ms-1"
                                                :class="sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down'"></i>
                                        </th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-if="paginatedDrivers.length === 0">
                                        <td colspan="5" class="text-center py-4">
                                            No driver found
                                        </td>
                                    </tr>

                                    <tr v-for="driver in paginatedDrivers" :key="driver.id">
                                        <td>
                                            <div class="d-flex">
                                                <div class="my-auto">
                                                    <h6 class="mb-0 text-sm">{{ driver.name }}</h6>
                                                    <p class="text-xs text-secondary mb-0">{{ driver.email }}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">{{ driver.phone }}</p>
                                        </td>
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">{{ driver.licenseNumber }}</p>
                                        </td>
                                        <td>
                                            <span class="badge badge-sm d-inline-flex align-items-center gap-1"
                                                :class="[statusDisplay[driver.status]?.color, statusDisplay[driver.status]?.textClass]"
                                                :title="statusDisplay[driver.status]?.tooltip">
                                                <i v-if="statusDisplay[driver.status]?.icon"
                                                    :class="statusDisplay[driver.status]?.icon"></i>
                                                {{ statusDisplay[driver.status]?.label || driver.status }}
                                            </span>
                                        </td>
                                        <td class="align-middle">
                                            <button class="btn btn-link text-secondary mb-0 px-1"
                                                @click="editDriver(driver)" v-if="driver.status === 'available' || driver.status === 'on_duty' || driver.status === 'off_duty'">
                                                <i class="fas fa-pencil-alt text-xs" aria-hidden="true"></i>
                                            </button>

                                            <button class="btn btn-link text-info mb-0 px-1"
                                                @click="showSetupLink(driver)" v-if="driver.status === 'pending'">
                                                <i class="fas fa-link text-xs" aria-hidden="true"
                                                    title="Get Setup Link"></i>
                                                Link
                                            </button>

                                            <button class="btn btn-link text-info mb-0 px-1"
                                                @click="resetDriverPassword(driver.email, driver.id)"
                                                :disabled="isLoadingReset[driver.id]"
                                                v-if="driver.status === 'available' || driver.status === 'on_duty' || driver.status === 'off_duty'">
                                                <span v-if="!isLoadingReset[driver.id]"><i class="fas fa-key text-xs"
                                                        aria-hidden="true" title="Reset Password"></i></span>
                                                <span v-else>
                                                    <span class="spinner-border spinner-border-sm" role="status"
                                                        aria-hidden="true"></span>
                                                </span>
                                            </button>

                                            <button class="btn btn-link text-danger mb-0 px-1"
                                                @click="confirmDisable(driver.id)"
                                                v-if="driver.status !== 'disabled' && driver.status !== 'pending'">
                                                <i class="fas fa-ban text-xs" aria-hidden="true" title="Disable"></i>
                                            </button>

                                            <button class="btn btn-link text-success mb-0 px-1"
                                                @click="confirmActivate(driver.id)" v-if="driver.status === 'disabled'">
                                                <i class="fas fa-check text-xs" aria-hidden="true" title="Activate"></i>
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <!-- Pagination Controls -->
                        <div class="d-flex justify-content-between align-items-center mt-3 ms-2">
                            <div class="text-sm">
                                Showing {{ showingFrom }}-{{ showingTo }} of {{ totalItems }} entries
                            </div>
                            <nav v-if="totalPages > 1">
                                <ul class="pagination pagination-sm mb-0">
                                    <li class="page-item" :class="{ disabled: currentPage === 1 }">
                                        <button class="page-link" @click="goToPage(1)" title="First">
                                            <i class="fas fa-angle-double-left"></i>
                                        </button>
                                    </li>
                                    <li class="page-item" :class="{ disabled: currentPage === 1 }">
                                        <button class="page-link" @click="goToPage(currentPage - 1)" title="Previous">
                                            <i class="fas fa-chevron-left"></i>
                                        </button>
                                    </li>

                                    <li class="page-item disabled" v-if="showLeftEllipsis">
                                        <span class="page-link">...</span>
                                    </li>
                                    <template v-for="page in visiblePages" :key="page">
                                        <li class="page-item" :class="{ active: currentPage === page }">
                                            <button class="page-link" @click="goToPage(page)">{{ page }}</button>
                                        </li>
                                    </template>
                                    <li class="page-item disabled" v-if="showRightEllipsis">
                                        <span class="page-link">...</span>
                                    </li>

                                    <li class="page-item" :class="{ disabled: currentPage === totalPages }">
                                        <button class="page-link" @click="goToPage(currentPage + 1)" title="Next">
                                            <i class="fas fa-chevron-right"></i>
                                        </button>
                                    </li>
                                    <li class="page-item" :class="{ disabled: currentPage === totalPages }">
                                        <button class="page-link" @click="goToPage(totalPages)" title="Last">
                                            <i class="fas fa-angle-double-right"></i>
                                        </button>
                                    </li>
                                </ul>
                            </nav>
                        </div>
                    </div>

                    <!-- Add/Edit Driver Modal -->
                    <div class="modal fade" :class="{ 'show d-block': showAddDriverModal }" tabindex="-1" role="dialog"
                        v-if="showAddDriverModal">
                        <div class="modal-dialog modal-dialog-centered" role="document">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h5 class="modal-title">{{ editingDriver ? 'Edit Driver' : 'Add New Driver' }}</h5>
                                    <button type="button" class="btn-close" @click="closeModal"></button>
                                </div>
                                <div class="modal-body">
                                    <div v-if="errors.general" class="alert alert-danger text-white mb-3">
                                        {{ errors.general }}
                                    </div>

                                    <form @submit.prevent="saveDriver">
                                        <div class="mb-3">
                                            <label for="driverName" class="form-label">Full Name</label>
                                            <argon-input id="driverName" v-model="currentDriver.name" type="text"
                                                placeholder="Driver name" @input="validateName"
                                                :disabled="editingDriver && currentDriver.status === 'disabled'"
                                                required />
                                            <div v-if="errors.name" class="text-danger text-sm mt-1">{{ errors.name }}
                                            </div>
                                        </div>

                                        <div class="mb-3">
                                            <label for="driverEmail" class="form-label">Email (@utem.edu.my)</label>
                                            <argon-input id="driverEmail" v-model="currentDriver.email" type="email"
                                                placeholder="Email" @input="validateEmail" :disabled="editingDriver"
                                                required />
                                            <div v-if="errors.email" class="text-danger text-sm mt-1">{{ errors.email }}
                                            </div>
                                        </div>

                                        <div class="mb-3">
                                            <label for="driverPhone" class="form-label">Phone Number</label>
                                            <argon-input id="driverPhone" v-model="currentDriver.phone" type="tel"
                                                placeholder="Phone number" @input="formatPhoneInput"
                                                :disabled="editingDriver && currentDriver.status === 'disabled'"
                                                required />
                                            <div v-if="errors.phone" class="text-danger text-sm mt-1">{{ errors.phone }}
                                            </div>
                                        </div>

                                        <div class="mb-3">
                                            <label for="driverLicense" class="form-label">License Number</label>
                                            <argon-input id="driverLicense" v-model="currentDriver.licenseNumber"
                                                type="text" placeholder="License number" @input="formatLicenseInput"
                                                :disabled="editingDriver && currentDriver.status === 'disabled'"
                                                required />
                                            <div v-if="errors.licenseNumber" class="text-danger text-sm mt-1">{{
                                                errors.licenseNumber }}</div>
                                        </div>

                                        <div class="mb-3" v-if="editingDriver">
                                            <label class="form-label">Status</label>
                                            <div class="d-flex align-items-center">
                                                <ArgonSwitch id="driverStatus" name="driverStatus"
                                                    :checked="currentDriver.status !== 'disabled'"
                                                    @change="currentDriver.status = $event.target.checked ? 'available' : 'disabled'"
                                                    :disabled="currentDriver.status === 'pending'">
                                                    Status: {{ currentDriver.status !== 'disabled' ? 'Available' :
                                                    'Disabled' }}
                                                </ArgonSwitch>
                                            </div>
                                        </div>

                                        <div class="d-flex justify-content-end gap-3 mt-4">
                                            <argon-button type="submit" color="success" variant="gradient"
                                                :disabled="isLoading">
                                                {{ editingDriver ? 'Update Driver' : 'Add Driver' }}
                                                <span v-if="isLoading" class="ms-2">
                                                    <span class="spinner-border spinner-border-sm" role="status"
                                                        aria-hidden="true"></span>
                                                </span>
                                            </argon-button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-backdrop fade show" v-if="showAddDriverModal"></div>

                    <!-- Disable Confirmation Modal -->
                    <div class="modal fade" :class="{ 'show d-block': showDisableModal }" tabindex="-1" role="dialog"
                        v-if="showDisableModal">
                        <div class="modal-dialog modal-dialog-centered" role="document">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h5 class="modal-title">Confirm Disable</h5>
                                    <button type="button" class="btn-close" @click="closeModal"></button>
                                </div>
                                <div class="modal-body">
                                    <p>Are you sure you want to disable this driver account?</p>
                                    <p class="text-muted">The driver will no longer be able to access the system.</p>
                                </div>
                                <div class="d-flex justify-content-end gap-3 mt-4">
                                    <argon-button color="secondary" @click="closeModal">Cancel</argon-button>
                                    <argon-button color="danger"
                                        @click="disableDriver(driverToDisable)">Disable</argon-button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-backdrop fade show" v-if="showDisableModal"></div>

                    <!-- Activate Confirmation Modal -->
                    <div class="modal fade" :class="{ 'show d-block': showActivateModal }" tabindex="-1" role="dialog"
                        v-if="showActivateModal">
                        <div class="modal-dialog modal-dialog-centered" role="document">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h5 class="modal-title">Confirm Activation</h5>
                                    <button type="button" class="btn-close" @click="showActivateModal = false"></button>
                                </div>
                                <div class="modal-body">
                                    <p>Are you sure you want to activate this driver account?</p>
                                    <p class="text-muted">The driver will regain access to the system.</p>
                                </div>
                                <div class="d-flex justify-content-end gap-3 mt-4">
                                    <argon-button color="secondary"
                                        @click="showActivateModal = false">Cancel</argon-button>
                                    <argon-button color="success"
                                        @click="activateDriver(driverToActivate)">Activate</argon-button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-backdrop fade show" v-if="showActivateModal"></div>

                    <!-- Link Modal -->
                    <div class="modal fade" :class="{ 'show d-block': showLinkModal }" tabindex="-1" role="dialog">
                        <div class="modal-dialog modal-dialog-centered" role="document">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h5 class="modal-title">Driver Setup Link</h5>
                                    <button type="button" class="btn-close" @click="closeLinkModal"></button>
                                </div>
                                <div class="modal-body">
                                    <div v-if="errors.general" class="alert alert-danger text-white mb-3">
                                        {{ errors.general }}
                                    </div>
                                    <p>Driver account for: <strong>{{ selectedDriverEmail }}</strong></p>
                                    <p>Password setup link:</p>
                                    <div class="input-group mb-3">
                                        <input type="text" class="form-control" :value="passwordResetLink" readonly>
                                        <argon-button color="secondary" variant="outline" class="mb-0" type="button"
                                            @click="copyToClipboard">
                                            Copy
                                        </argon-button>
                                    </div>
                                    <p v-if="currentLinkTime" class="text-sm text-muted mb-3">
                                        <i class="fas fa-clock me-1"></i>
                                        Link generated: {{ formatDate(currentLinkTime) }}
                                    </p>
                                    <p class="text-muted">Send this link to the driver to complete their account setup.
                                    </p>

                                    <div v-if="!passwordResetLink" class="alert alert-warning text-white">
                                        <i class="fas fa-exclamation-triangle me-2"></i>
                                        No setup link available. Please regenerate the link.
                                    </div>
                                </div>
                                <div class="d-flex justify-content-end gap-3 mt-4">
                                    <argon-button color="secondary" @click="closeLinkModal">Close</argon-button>
                                    <argon-button color="primary"
                                        @click="resetDriverPassword(selectedDriverEmail, null)" :disabled="isLoading"
                                        v-if="!passwordResetLink">
                                        <span v-if="!isLoading">Regenerate Link</span>
                                        <span v-else>
                                            <span class="spinner-border spinner-border-sm" role="status"
                                                aria-hidden="true"></span>
                                            Regenerating...
                                        </span>
                                    </argon-button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-backdrop fade show" v-if="showLinkModal"></div>

                    <!-- Bus Driver Pairing Modal -->
                    <div class="modal fade" :class="{ 'show d-block': showPairingModal }" tabindex="-1" role="dialog"
                        v-if="showPairingModal">
                        <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h5 class="modal-title">Bus-Driver Pairings</h5>
                                    <button type="button" class="btn-close" @click="showPairingModal = false"></button>
                                </div>
                                <div class="modal-body">
                                    <BusDriverPairingsTable :pairings="busDriverPairings" :buses="buses"
                                        :drivers="drivers" @update-pairings="fetchPairings" />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-backdrop fade show" v-if="showPairingModal"></div>
                </div>
            </div>
        </div>
    </div>
</template>
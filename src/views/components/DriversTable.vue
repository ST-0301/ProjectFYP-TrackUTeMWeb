<script setup>
import { ref, onMounted } from 'vue';
import { deleteDoc, updateDoc, setDoc, onSnapshot, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { driversCollection } from '@/firebase';
import ArgonButton from "@/components/ArgonButton.vue";
import ArgonInput from "@/components/ArgonInput.vue";
import bcrypt from 'bcryptjs';


// Reactive state
const drivers = ref([]);
const showAddDriverModal = ref(false);
const showDeleteModal = ref(false);
const editingDriver = ref(false);
const currentDriver = ref(createDefaultDriver());
const driverToDelete = ref(null);
const errors = ref({
    name: '',
    email: '',
    phone: '',
    licenseNumber: '',
    password: '',
    confirmPassword: ''
});


// Lifecycle hooks
onMounted(() => {
    const unsubscribe = onSnapshot(driversCollection, (snapshot) => {
        drivers.value = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    });
    return () => unsubscribe();
});


// Helper functions
function createDefaultDriver() {
    return {
        driverId: "",
        name: "",
        email: "",
        phone: "",
        licenseNumber: "",
        password: "",
        confirmPassword: "",
        status: "active",
        originalEmail: ""
    };
}
async function checkExistingEmail() {
    const q = query(driversCollection, where("email", "==", currentDriver.value.email));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
        return false;
    }

    // If editing, make sure it's not the same driver being edited
    if (editingDriver.value) {
        // Check if any document is not the same as current driver's ID
        return snapshot.docs.some(doc => doc.id !== currentDriver.value.id);
    }

    // If adding a new driver, any match is a duplicate
    return true;
};
async function checkExistingLicense() {
    const q = query(driversCollection, where("licenseNumber", "==", currentDriver.value.licenseNumber));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
        return false;
    }

    // If editing, make sure it's not the same driver being edited
    if (editingDriver.value) {
        // Check if any document is not the same as current driver's ID
        return snapshot.docs.some(doc => doc.id !== currentDriver.value.id);
    }

    // If adding a new driver, any match is a duplicate
    return true;
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
    if (!editingDriver.value && await checkExistingEmail()) {
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
const validatePassword = () => {
    const password = currentDriver.value.password;
    const passwordPattern = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?#^;:,./])[A-Za-z\d@$!%*?#^;:,./]{8,}$/;
    if (!password) {
        errors.value.password = 'Password is required';
        return;
    }
    if (!passwordPattern.test(password)) {
        errors.value.password = 'Requires 8+ characters with uppercase, lowercase, number, and special character';
        return;
    }
    errors.value.password = '';
    validateConfirmPassword();
};
const validateConfirmPassword = () => {
    errors.value.confirmPassword =
        currentDriver.value.password === currentDriver.value.confirmPassword
            ? ''
            : 'Passwords do not match';
};

async function validateForm() {
    validateName();
    await validateEmail();
    validatePhone();
    await validateLicense();
    if (!editingDriver.value) {
        validatePassword();
        validateConfirmPassword();
    }
    return Object.values(errors.value).every(error => !error);
}


// CRUD operations
async function createDriver() {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(currentDriver.value.password, salt);

    const driverData = {
        ...currentDriver.value,
        password: hashedPassword,
    };
    delete driverData.confirmPassword;
    delete driverData.originalEmail;

    const newDriverRef = doc(driversCollection);
    driverData.driverId = newDriverRef.id;
    await setDoc(newDriverRef, driverData);
}
async function updateDriver() {
    const driverDocRef = doc(driversCollection, currentDriver.value.id);

    const updates = {
        name: currentDriver.value.name,
        phone: currentDriver.value.phone,
        licenseNumber: currentDriver.value.licenseNumber,
        status: currentDriver.value.status
    };

    // Add email to updates if it changed
    if (currentDriver.value.email !== currentDriver.value.originalEmail) {
        updates.email = currentDriver.value.email;
    }
    await updateDoc(driverDocRef, updates);
}
async function deleteDriver() {
    try {
        const driverDocRef = doc(driversCollection, driverToDelete.value);
        const driverSnapshot = await getDoc(driverDocRef);
        if (!driverSnapshot.exists()) {
            throw new Error('Driver not found');
        }

        // Delete from Firestore
        await deleteDoc(driverDocRef);
        showDeleteModal.value = false;
    } catch (error) {
        console.error("Error deleting driver: ", error);
        errors.value.general = error.message;
    }
};

// UI handlers
const addDriver = () => {
    currentDriver.value = createDefaultDriver();
    editingDriver.value = false;
    showAddDriverModal.value = true;
};
const editDriver = (driver) => {
    currentDriver.value = { ...driver, password: "", confirmPassword: "", originalEmail: driver.email };
    editingDriver.value = true;
    showAddDriverModal.value = true;
};
const saveDriver = async () => {
    const isValid = await validateForm();
    if (!isValid) return;
    try {
        if (editingDriver.value) {
            await updateDriver();
        } else {
            await createDriver();
        }
        closeModal();
    } catch (error) {
        console.error("Error saving driver:", error);
        errors.value.general = error.message;
    }
};
const confirmDelete = (id) => {
    driverToDelete.value = id;
    showDeleteModal.value = true;
};
const closeModal = () => {
    showAddDriverModal.value = false;
    editingDriver.value = false;
    currentDriver.value = createDefaultDriver();
    errors.value = {
        name: '',
        email: '',
        phone: '',
        licenseNumber: '',
        password: '',
        confirmPassword: ''
    };
};


// Formatters
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
</script>


<template>
    <div class="card mb-4">
        <div class="card-header pb-0">
            <div class="d-flex justify-content-between align-items-center">
                <h6>Drivers List</h6>
                <argon-button color="success" size="sm" @click="addDriver">
                    <i class="ni ni-fat-add"></i> Add Driver
                </argon-button>
            </div>
        </div>
        <div class="card-body px-0 pt-0 pb-2">
            <div class="table-responsive p-0">
                <table class="table align-items-center justify-content-center mb-0">
                    <thead>
                        <tr>
                            <th class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7">Driver</th>
                            <th class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">License
                                Number</th>
                            <th class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">Phone
                            </th>
                            <th class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">Status
                            </th>
                            <th class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="drivers.length === 0">
                            <td colspan="5" class="text-center py-4">
                                No drivers found
                            </td>
                        </tr>

                        <tr v-for="driver in drivers" :key="driver.id">
                            <td>
                                <div class="d-flex px-2">
                                    <div>
                                        <img :src="driver.avatar || '../../assets/img/team-2.jpg'"
                                            class="avatar avatar-sm rounded-circle me-2" alt="driver" />
                                    </div>
                                    <div class="my-auto">
                                        <h6 class="mb-0 text-sm">{{ driver.name }}</h6>
                                        <p class="text-xs text-secondary mb-0">{{ driver.email }}</p>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <p class="text-sm font-weight-bold mb-0">{{ driver.licenseNumber }}</p>
                            </td>
                            <td>
                                <p class="text-sm font-weight-bold mb-0">{{ driver.phone }}</p>
                            </td>
                            <td>
                                <span class="badge badge-sm" :class="{
                                    'bg-gradient-success': driver.status === 'active',
                                    'bg-gradient-secondary': driver.status === 'inactive'
                                }">
                                    {{ driver.status }}
                                </span>
                            </td>
                            <td class="align-middle">
                                <button class="btn btn-link text-secondary mb-0 px-1" @click="editDriver(driver)">
                                    <i class="fas fa-pencil-alt text-xs" aria-hidden="true"></i>
                                </button>
                                <button class="btn btn-link text-danger mb-0 px-1" @click="confirmDelete(driver.driverId)">
                                    <i class="fas fa-trash-alt text-xs" aria-hidden="true"></i>
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
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
                        <form @submit.prevent="saveDriver">
                            <div class="mb-3">
                                <label class="form-label">Full Name</label>
                                <argon-input v-model="currentDriver.name" type="text" placeholder="Driver name"
                                    @input="validateName" required />
                                <div v-if="errors.name" class="text-danger text-sm mt-1">{{ errors.name }}</div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">Email</label>
                                <argon-input v-model="currentDriver.email" type="email" placeholder="Email"
                                    @input="validateEmail" required />
                                <div v-if="errors.email" class="text-danger text-sm mt-1">{{ errors.email }}</div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">Phone Number</label>
                                <argon-input v-model="currentDriver.phone" type="tel" placeholder="Phone number"
                                    @input="formatPhoneInput" required />
                                <div v-if="errors.phone" class="text-danger text-sm mt-1">{{ errors.phone }}</div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">License Number</label>
                                <argon-input v-model="currentDriver.licenseNumber" type="text"
                                    placeholder="License number" @input="formatLicenseInput" required />
                                <div v-if="errors.licenseNumber" class="text-danger text-sm mt-1">{{
                                    errors.licenseNumber }}</div>
                            </div>

                            <!-- Password fields (only for new drivers) -->
                            <div class="mb-3" v-if="!editingDriver">
                                <label class="form-label">Password</label>
                                <argon-input v-model="currentDriver.password" type="password"
                                    placeholder="Set driver's password" @input="validatePassword" required />
                                <div v-if="errors.password" class="text-danger text-sm mt-1">{{ errors.password }}</div>
                            </div>

                            <div class="mb-3" v-if="!editingDriver">
                                <label class="form-label">Confirm Password</label>
                                <argon-input v-model="currentDriver.confirmPassword" type="password"
                                    placeholder="Confirm driver's password" @input="validateConfirmPassword" required />
                                <div v-if="errors.confirmPassword" class="text-danger text-sm mt-1">{{
                                    errors.confirmPassword }}</div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">Status</label>
                                <select v-model="currentDriver.status" class="form-select" required>
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </div>
                            <div v-if="errors.general" class="alert alert-danger text-sm mt-2">
                                {{ errors.general }}
                            </div>
                            <div class="d-flex justify-content-end gap-3 mt-4">
                                <argon-button type="button" color="secondary" @click="closeModal">
                                    Cancel
                                </argon-button>
                                <argon-button type="submit" color="success" variant="gradient">
                                    {{ editingDriver ? 'Update Driver' : 'Add Driver' }}
                                </argon-button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-backdrop fade show" v-if="showAddDriverModal"></div>

        <!-- Delete Confirmation Modal -->
        <div class="modal fade" :class="{ 'show d-block': showDeleteModal }" tabindex="-1" role="dialog"
            v-if="showDeleteModal">
            <div class="modal-dialog modal-dialog-centered" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Confirm Delete</h5>
                        <button type="button" class="btn-close" @click="showDeleteModal = false"></button>
                    </div>
                    <div class="modal-body">
                        <p>Are you sure you want to delete this driver?</p>
                    </div>
                    <div class="modal-footer">
                        <argon-button color="danger" @click="deleteDriver">Delete</argon-button>
                        <argon-button color="secondary" @click="showDeleteModal = false">Cancel</argon-button>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-backdrop fade show" v-if="showDeleteModal"></div>
    </div>
</template>
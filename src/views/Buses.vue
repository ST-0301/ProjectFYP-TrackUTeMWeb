<script setup>
import { ref, onMounted } from 'vue';
import { deleteDoc, updateDoc, setDoc, onSnapshot, doc, getDocs, query, where } from 'firebase/firestore';
import { busCollection } from '@/firebase';
import ArgonButton from "@/components/ArgonButton.vue";
import ArgonInput from "@/components/ArgonInput.vue";


// Reactive state
const buses = ref([]);
const showAddBusModal = ref(false);
const showDeleteModal = ref(false);
const editingBus = ref(false);
const currentBus = ref(createDefaultBus());
const busToDelete = ref(null);
const errors = ref({
    licensePlate: '',
    capacity: '',
    general: ''
});


// Lifecycle hooks
onMounted(() => {
    const unsubscribe = onSnapshot(busCollection, (snapshot) => {
        buses.value = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    });
    return () => unsubscribe();
});


// Helper functions
function createDefaultBus() {
    return {
        busId: "",
        licensePlate: "",
        capacity: "",
        created: null,
        status: "active"
    };
}
async function checkExistingLicensePlate() {
    const q = query(busCollection, where("licensePlate", "==", currentBus.value.licensePlate));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
        return false;
    }

    // If editing, make sure it's not the same bus being edited
    if (editingBus.value) {
        // Check if any document is not the same as current bus's ID
        return snapshot.docs.some(doc => doc.id !== currentBus.value.id);
    }

    // If adding a new bus, any match is a duplicate
    return true;
};


// Validation functions
const validateLicensePlate = async () => {
    const licensePlate = currentBus.value.licensePlate.trim();
    const licensePlatePattern = /^[A-Z0-9]{2,8}$/;
    if (!licensePlate) {
        errors.value.licensePlate = 'License plate is required';
        return;
    }
    if (!licensePlatePattern.test(licensePlate)) {
        errors.value.licensePlate = 'Must be exactly 8 alphanumeric characters';
        return;
    }
    if (await checkExistingLicensePlate()) {
        errors.value.licensePlate = 'License plate already exists';
        return;
    }
    errors.value.licensePlate = '';
};
const validateCapacity = () => {
    const capacity = currentBus.value.capacity;
    if (!capacity) {
        errors.value.capacity = 'Capacity is required';
        return;
    }
    if (isNaN(capacity)) {
        errors.value.capacity = 'Must be a valid number';
        return;
    }
    if (capacity < 1) {
        errors.value.capacity = 'Must be at least 1';
        return;
    }
    errors.value.capacity = '';
};


// CRUD operations
async function createBus() {
    try {
        const newBusRef = doc(busCollection);

        const busData = {
            ...currentBus.value,
            busId: newBusRef.id,
            created: new Date().toISOString()
        };
        await setDoc(newBusRef, busData);
    } catch (error) {
        console.error("Error creating bus:", error);
        throw error;
    }
}
async function updateBus() {
    const busDocRef = doc(busCollection, currentBus.value.id);
    const updates = {
        licensePlate: currentBus.value.licensePlate,
        capacity: currentBus.value.capacity,
        status: currentBus.value.status
    };
    await updateDoc(busDocRef, updates);
}
async function deleteBus() {
    try {
        const busDocRef = doc(busCollection, busToDelete.value);
        await deleteDoc(busDocRef);
        showDeleteModal.value = false;
    } catch (error) {
        console.error("Error deleting bus: ", error);
        errors.value.general = error.message;
    }
}


// UI handlers
const addBus = () => {
    currentBus.value = createDefaultBus();
    editingBus.value = false;
    showAddBusModal.value = true;
};
const editBus = (bus) => {
    currentBus.value = { ...bus };
    editingBus.value = true;
    showAddBusModal.value = true;
};
const saveBus = async () => {
    await validateLicensePlate();
    validateCapacity();
    if (errors.value.licensePlate || errors.value.capacity) return;
    try {
        if (editingBus.value) {
            await updateBus();
        } else {
            await createBus();
        }
        closeModal();
    } catch (error) {
        console.error("Error saving bus:", error);
        errors.value.general = error.message;
    }
};
const confirmDelete = (id) => {
    busToDelete.value = id;
    showDeleteModal.value = true;
};
const closeModal = () => {
    showAddBusModal.value = false;
    editingBus.value = false;
    currentBus.value = createDefaultBus();
    errors.value = {
        licensePlate: '',
        capacity: ''
    };
};


// Formatters
const formatLicensePlateInput = (event) => {
    currentBus.value.licensePlate = event.target.value
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase()
        .slice(0, 8);
    validateLicensePlate();
};
const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
};
</script>



<template>
    <div class="py-4 container-fluid">
        <div class="row">
            <div class="col-12">
                <div class="card mb-4">
                    <div class="card-header pb-0">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6>Bus List</h6>
                            <argon-button color="success" size="sm" @click="addBus">
                                <i class="ni ni-fat-add"></i> Add Bus
                            </argon-button>
                        </div>
                    </div>
                    <div class="card-body px-0 pt-0 pb-2">
                        <div class="table-responsive p-0">
                            <table class="table align-items-center justify-content-center mb-0">
                                <thead>
                                    <tr>
                                        <th class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7">
                                            License
                                            Plate</th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Capacity
                                        </th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Created
                                        </th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Status
                                        </th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-if="buses.length === 0">
                                        <td colspan="5" class="text-center py-4">
                                            No bus found
                                        </td>
                                    </tr>

                                    <tr v-for="bus in buses" :key="bus.busId">
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0 px-2">{{ bus.licensePlate }}</p>
                                        </td>
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">{{ bus.capacity }}</p>
                                        </td>
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">{{ formatDateTime(bus.created) }}</p>
                                        </td>
                                        <td>
                                            <span class="badge badge-sm" :class="{
                                                'bg-gradient-success': bus.status === 'active',
                                                'bg-gradient-secondary': bus.status === 'inactive'
                                            }">
                                                {{ bus.status }}
                                            </span>
                                        </td>
                                        <td class="align-middle">
                                            <button class="btn btn-link text-secondary mb-0 px-1" @click="editBus(bus)">
                                                <i class="fas fa-pencil-alt text-xs" aria-hidden="true"></i>
                                            </button>
                                            <button class="btn btn-link text-danger mb-0 px-1"
                                                @click="confirmDelete(bus.id)">
                                                <i class="fas fa-trash-alt text-xs" aria-hidden="true"></i>
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Add/Edit Bus Modal -->
                    <div class="modal fade" :class="{ 'show d-block': showAddBusModal }" tabindex="-1" role="dialog"
                        v-if="showAddBusModal">
                        <div class="modal-dialog modal-dialog-centered" role="document">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h5 class="modal-title">{{ editingBus ? 'Edit Bus' : 'Add New Bus' }}</h5>
                                    <button type="button" class="btn-close" @click="closeModal"></button>
                                </div>
                                <div class="modal-body">
                                    <form @submit.prevent="saveBus">
                                        <div class="mb-3">
                                            <label class="form-label">License Plate</label>
                                            <argon-input v-model="currentBus.licensePlate" type="text"
                                                placeholder="License plate" @input="formatLicensePlateInput" required />
                                            <div v-if="errors.licensePlate" class="text-danger text-sm mt-1">{{
                                                errors.licensePlate }}</div>
                                        </div>

                                        <div class="mb-3">
                                            <label class="form-label">Capacity</label>
                                            <argon-input v-model="currentBus.capacity" type="number"
                                                placeholder="Capacity" min="1" @input="validateCapacity" required />
                                            <div v-if="errors.capacity" class="text-danger text-sm mt-1">{{
                                                errors.capacity }}
                                            </div>
                                        </div>

                                        <div class="mb-3">
                                            <label class="form-label">Status</label>
                                            <select v-model="currentBus.status" class="form-select" required>
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
                                                {{ editingBus ? 'Update Bus' : 'Add Bus' }}
                                            </argon-button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-backdrop fade show" v-if="showAddBusModal"></div>

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
                                    <p>Are you sure you want to delete this bus?</p>
                                </div>
                                <div class="modal-footer">
                                    <argon-button color="danger" @click="deleteBus">Delete</argon-button>
                                    <argon-button color="secondary"
                                        @click="showDeleteModal = false">Cancel</argon-button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-backdrop fade show" v-if="showDeleteModal"></div>
                </div>
            </div>
        </div>
    </div>
</template>
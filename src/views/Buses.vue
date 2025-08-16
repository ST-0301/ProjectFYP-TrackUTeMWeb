<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { deleteDoc, updateDoc, setDoc, onSnapshot, doc, getDocs, query, where } from 'firebase/firestore';
import { busCollection, driverCollection, busDriverPairingCollection } from '@/firebase';
import BusDriverPairingsTable from '@/views/components/BusDriverPairingsTable.vue';
import ArgonButton from "@/components/ArgonButton.vue";
import ArgonInput from "@/components/ArgonInput.vue";


// Reactive state
// Data state
const buses = ref([]);
const drivers = ref([]);
const busDriverPairings = ref([]);
const currentBus = ref(createDefaultBus());
const busToDelete = ref(null);
const isBusPaired = ref(false);
// UI state
const showAddBusModal = ref(false);
const showDeleteModal = ref(false);
const showPairingModal = ref(false);
const editingBus = ref(false);
// Table state
const sortColumn = ref('plateNumber');
const sortDirection = ref('asc');
const currentPage = ref(1);
const itemsPerPage = ref(10);
// Error state
const errors = ref({ plateNumber: '', capacity: '', general: '' });


// Computed properties
const sortedBuses = computed(() => {
    if (!sortColumn.value) return buses.value;

    return [...buses.value].sort((a, b) => {
        let valA = a[sortColumn.value];
        let valB = b[sortColumn.value];

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortDirection.value === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection.value === 'asc' ? 1 : -1;
        return 0;
    });
});
const paginatedBuses = computed(() => {
    const start = (currentPage.value - 1) * itemsPerPage.value;
    const end = start + itemsPerPage.value;
    return sortedBuses.value.slice(start, end);
});
const totalItems = computed(() => sortedBuses.value.length);
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
    const unsubscribeBuses = onSnapshot(busCollection, (snapshot) => {
        buses.value = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    });
    const unsubscribeDrivers = onSnapshot(driverCollection, (snapshot) => {
        drivers.value = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    });

    fetchPairings();
    return () => {
        unsubscribeBuses();
        unsubscribeDrivers();
    };
});


// Helper functions
function createDefaultBus() {
    return {
        busId: "",
        plateNumber: "",
        capacity: "",
        status: "active"
    };
}
async function checkExistingPlateNumber() {
    const q = query(busCollection, where("plateNumber", "==", currentBus.value.plateNumber));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
        return false;
    }
    if (editingBus.value) {
        return snapshot.docs.some(doc => doc.id !== currentBus.value.id);
    }
    return true;
};


// Validation functions
const validatePlateNumber = async () => {
    const plateNumber = currentBus.value.plateNumber.trim();
    const plateNumberPattern = /^[A-Z0-9]{2,8}$/;
    if (!plateNumber) {
        errors.value.plateNumber = 'Plate number is required';
        return;
    }
    if (!plateNumberPattern.test(plateNumber)) {
        errors.value.plateNumber = 'Must be exactly 8 alphanumeric characters';
        return;
    }
    if (await checkExistingPlateNumber()) {
        errors.value.plateNumber = 'Plate number already exists';
        return;
    }
    errors.value.plateNumber = '';
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
        plateNumber: currentBus.value.plateNumber,
        capacity: currentBus.value.capacity,
        status: currentBus.value.status
    };
    await updateDoc(busDocRef, updates);
}
const deleteOrDeactivateBus = async () => {
    try {
        if (isBusPaired.value) {
             const busDocRef = doc(busCollection, busToDelete.value);
            await updateDoc(busDocRef, {
                status: "inactive"
            });
        } else {
            const busDocRef = doc(busCollection, busToDelete.value);
            await deleteDoc(busDocRef);
        }
        showDeleteModal.value = false;
    } catch (error) {
        console.error("Error handling bus action: ", error);
        errors.value.general = error.message;
    }
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
    await validatePlateNumber();
    validateCapacity();
    if (errors.value.plateNumber || errors.value.capacity) return;
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
const confirmDelete = async (id) => {
    busToDelete.value = id;
    const pairingQuery = query(busDriverPairingCollection, where("busId", "==", id));
    const pairingSnapshot = await getDocs(pairingQuery);
    showDeleteModal.value = true;
    isBusPaired.value = !pairingSnapshot.empty;
};
const closeModal = () => {
    showAddBusModal.value = false;
    editingBus.value = false;
    currentBus.value = createDefaultBus();
    errors.value = {
        plateNumber: '',
        capacity: ''
    };
};
const handleSort = (column) => {
    if (column === sortColumn.value) {
        sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn.value = column;
        sortDirection.value = 'asc';
    }
};
const goToPage = (page) => {
    if (page >= 1 && page <= totalPages.value) {
        currentPage.value = page;
    }
};


// Formatter
const formatPlateNumberInput = (event) => {
    currentBus.value.plateNumber = event.target.value
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase()
        .slice(0, 8);
    validatePlateNumber();
};


// Watcher
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
                            <h6>Bus List</h6>
                            <div>
                                <argon-button color="info" size="sm" variant="gradient" @click="showPairingModal = true"
                                    class="me-2">
                                    <i class="fas fa-link"></i> View Pairings
                                </argon-button>
                                <argon-button color="success" size="sm" @click="addBus">
                                    <i class="ni ni-fat-add"></i> Add Bus
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
                                            @click="handleSort('plateNumber')">
                                            Plate Number
                                            <i v-if="sortColumn === 'plateNumber'" class="fas ms-1"
                                                :class="sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down'"></i>
                                        </th>
                                        <th class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2 cursor-pointer"
                                            @click="handleSort('capacity')">
                                            Capacity
                                            <i v-if="sortColumn === 'capacity'" class="fas ms-1"
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
                                    <tr v-if="paginatedBuses.length === 0">
                                        <td colspan="4" class="text-center py-4">
                                            No bus found
                                        </td>
                                    </tr>

                                    <tr v-for="bus in paginatedBuses" :key="bus.busId">
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">{{ bus.plateNumber }}</p>
                                        </td>
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">{{ bus.capacity }}</p>
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
                                    <div v-if="errors.general" class="alert alert-danger text-white mb-3">
                                        {{ errors.general }}
                                    </div>

                                    <form @submit.prevent="saveBus">
                                        <div class="mb-3">
                                            <label class="form-label">Plate Number</label>
                                            <argon-input v-model="currentBus.plateNumber" type="text"
                                                placeholder="Plate number" @input="formatPlateNumberInput" required />
                                            <div v-if="errors.plateNumber" class="text-danger text-sm mt-1">{{
                                                errors.plateNumber }}</div>
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
                                        
                                        <div class="d-flex justify-content-end gap-3 mt-4">
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

                    <!-- Delete or Deactivate Confirmation Modal -->
                    <div class="modal fade" :class="{ 'show d-block': showDeleteModal }" tabindex="-1" role="dialog"
                        v-if="showDeleteModal">
                        <div class="modal-dialog modal-dialog-centered" role="document">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h5 class="modal-title">Confirm Action</h5>
                                    <button type="button" class="btn-close" @click="showDeleteModal = false"></button>
                                </div>
                                <div class="modal-body">
                                    <div v-if="isBusPaired">
                                        <p>This bus is currently assigned to a driver and cannot be deleted.</p>
                                        <p>Would you like to set its status to "inactive" instead?</p>
                                    </div>
                                    <div v-else>
                                        <p>Are you sure you want to permanently delete this bus?</p>
                                    </div>
                                </div>
                                <div class="d-flex justify-content-end gap-2 mt-4">
                                    <argon-button color="secondary"
                                        @click="showDeleteModal = false">Cancel</argon-button>
                                    <argon-button color="danger" @click="deleteOrDeactivateBus">
                                        {{ isBusPaired ? 'Deactivate Bus' : 'Delete Bus' }}
                                    </argon-button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-backdrop fade show" v-if="showDeleteModal"></div>

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



<style>
.modal-backdrop {
    display: flex;
    justify-content: center;
    align-items: center;
}
.modal-content {
    padding: 20px;
    max-width: 700px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-height: 92vh;
    overflow-y: auto;
}
</style>
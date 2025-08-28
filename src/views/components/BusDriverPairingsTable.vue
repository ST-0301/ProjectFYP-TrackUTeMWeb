<script setup>
import { ref, computed } from 'vue';
import { addDoc, updateDoc, doc } from 'firebase/firestore';
import { busDriverPairingCollection } from '@/firebase';
import ArgonButton from "@/components/ArgonButton.vue";
import ArgonSwitch from "@/components/ArgonSwitch.vue";


// Props and Emits
const props = defineProps({
    pairings: {
        type: Array,
        default: () => []
    },
    buses: {
        type: Array,
        default: () => []
    },
    drivers: {
        type: Array,
        default: () => []
    }
});
const emit = defineEmits(['update-pairings']);
// Reactive state
// Data
const editingPairing = ref(false);
const newPairing = ref(createDefaultPairing());
const pairingToDeactivate = ref(null);
// UI state
const showDeactivateModal = ref(false);
const showAddPairing = ref(false);
const showInactive = ref(false);
// Table state
const sortColumn = ref("isActive");
const sortDirection = ref('asc');
const currentPage = ref(1);
const itemsPerPage = ref(4);
const lastActivePage = ref(1);
// Error state
const errors = ref({ general: '' });


// Computed properties
const displayPairings = computed(() => {
    const mappedPairings = props.pairings.map(pairing => {
        const bus = props.buses.find(b => b.id === pairing.busId);
        const driver = props.drivers.find(d => d.id === pairing.driverId);
        return {
            ...pairing,
            busPlateNumber: bus ? bus.plateNumber : 'Unknown Bus',
            driverName: driver ? driver.name : 'Unknown Driver',
            driverStatus: driver ? driver.status : 'unknown',
            isDriverDisabled: driver ? driver.status === 'disabled' : false
        };
    });

    let filteredPairings = mappedPairings;
    if (!showInactive.value) {
        filteredPairings = filteredPairings.filter(pairing => pairing.isActive);
    }

    if (sortColumn.value) {
        return [...filteredPairings].sort((a, b) => {
            let valA = a[sortColumn.value];
            let valB = b[sortColumn.value];

            if (sortColumn.value === 'isActive') {
                valA = valA ? 1 : 0;
                valB = valB ? 1 : 0;
                const plateNumberA = a.busPlateNumber.toLowerCase();
                const plateNumberB = b.busPlateNumber.toLowerCase();
                if (valA === valB) {
                    if (plateNumberA < plateNumberB) return sortDirection.value === 'asc' ? -1 : 1;
                    if (plateNumberA > plateNumberB) return sortDirection.value === 'asc' ? 1 : -1;
                    return 0;
                }
            } else if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }
            if (valA < valB) {
                return sortDirection.value === 'asc' ? -1 : 1;
            }
            if (valA > valB) {
                return sortDirection.value === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }
    return filteredPairings;
});
const paginatedPairings = computed(() => {
    const start = (currentPage.value - 1) * itemsPerPage.value;
    const end = start + itemsPerPage.value;
    return displayPairings.value.slice(start, end);
});
const totalItems = computed(() => displayPairings.value.length);
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
const availableBuses = computed(() => props.buses);
const availableDrivers = computed(() => {
    return props.drivers.filter(driver =>
        driver.status !== 'disabled' && driver.status !== 'pending'
    );
});


// Helper functions
function createDefaultPairing() {
    return {
        busId: '',
        driverId: '',
        isActive: true,
        id: null
    };
}
const isDriverAvailable = (driverId) => {
    if (!driverId) return true;
    const driver = props.drivers.find(d => d.id === driverId);
    return driver && driver.status !== 'disabled' && driver.status !== 'pending';
};


// CRUD operations
const savePairing = async () => {
    errors.value.general = '';

    if (!newPairing.value.busId || !newPairing.value.driverId) {
        errors.value.general = 'Please select both a bus and a driver.';
        return;
    }
    const selectedDriver = props.drivers.find(d => d.id === newPairing.value.driverId);
    if (selectedDriver && selectedDriver.status === 'disabled') {
        errors.value.general = 'Cannot pair with a disabled driver. Please select an active driver.';
        return;
    }
    const existingDuplicatePairing = props.pairings.find(p =>
        p.busId === newPairing.value.busId &&
        p.driverId === newPairing.value.driverId &&
        (!editingPairing.value || p.id !== newPairing.value.id)
    );
    if (existingDuplicatePairing) {
        const bus = props.buses.find(b => b.id === existingDuplicatePairing.busId);
        const driver = props.drivers.find(d => d.id === existingDuplicatePairing.driverId);
        const statusText = existingDuplicatePairing.isActive ? 'Active' : 'Inactive';
        errors.value.general = `This driver (${driver?.name || 'Unknown Driver'}) is already paired with this bus (${bus?.plateNumber || 'Unknown Bus'}). The current status is: ${statusText}.`;
        return;
    }

    if (newPairing.value.isActive) {
        const driverHasOtherActivePairing = props.pairings.find(p =>
            p.isActive &&
            p.driverId === newPairing.value.driverId &&
            (!editingPairing.value || p.id !== newPairing.value.id)
        );
        if (driverHasOtherActivePairing) {
            const conflictingBus = props.buses.find(b => b.id === driverHasOtherActivePairing.busId);
            const conflictingDriver = props.drivers.find(d => d.id === driverHasOtherActivePairing.driverId);
            errors.value.general = `This driver (${conflictingDriver?.name || 'Unknown Driver'}) is already actively paired with another bus (${conflictingBus?.plateNumber || 'Unknown Bus'}). Please deactivate the existing pairing first.`;
            return;
        }
    }

    try {
        if (editingPairing.value) {
            const pairingDocRef = doc(busDriverPairingCollection, newPairing.value.id);
            await updateDoc(pairingDocRef, {
                busId: newPairing.value.busId,
                driverId: newPairing.value.driverId,
                isActive: newPairing.value.isActive
            });
        } else {
            await addDoc(busDriverPairingCollection, {
                busId: newPairing.value.busId,
                driverId: newPairing.value.driverId,
                isActive: newPairing.value.isActive
            });
        }
        emit('update-pairings');
        cancelAddPairing();
    } catch (error) {
        console.error("Error saving pairing:", error);
        errors.value.general = "An unexpected error occurred while saving the pairing. Please try again.";
    }
};
const deactivatePairing = async () => {
    if (!pairingToDeactivate.value) return;
    try {
        const pairingDocRef = doc(busDriverPairingCollection, pairingToDeactivate.value);
        await updateDoc(pairingDocRef, {
            isActive: false
        });
        emit('update-pairings');
        showDeactivateModal.value = false;
        pairingToDeactivate.value = null;
    } catch (error) {
        console.error("Error deactivating pairing:", error);
        errors.value.general = "An unexpected error occurred while deactivating the pairing. Please try again.";
    }
};


// UI handlers
const toggleAddPairingSection = () => {
    showAddPairing.value = !showAddPairing.value;
    if (!showAddPairing.value) {
        cancelAddPairing();
    }
};
const cancelAddPairing = () => {
    newPairing.value = createDefaultPairing();
    editingPairing.value = false;
    showAddPairing.value = false;
    errors.value.general = '';
};
const editPairing = (pairing) => {
    newPairing.value = { ...pairing };
    editingPairing.value = true;
    showAddPairing.value = true;
    errors.value.general = '';
};
const sortBy = (column) => {
    if (sortColumn.value === column) {
        sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn.value = column;
        sortDirection.value = 'asc';
    }
};
const toggleShowInactive = () => {
    if (!showInactive.value) {
        lastActivePage.value = currentPage.value;
        showInactive.value = true;
        sortColumn.value = 'isActive';
        sortDirection.value = 'desc';
    } else {
        showInactive.value = false;
        sortColumn.value = null;
        sortDirection.value = 'asc';
        currentPage.value = lastActivePage.value;
    }
};
const goToPage = (page) => {
    if (page >= 1 && page <= totalPages.value) {
        currentPage.value = page;
    }
};
const promptDeactivatePairing = (id) => {
    pairingToDeactivate.value = id;
    showDeactivateModal.value = true;
};
</script>



<template>
    <div>
        <div class="d-flex justify-content-end mb-3">
            <argon-button :color="showAddPairing ? 'danger' : 'primary'" size="sm" variant="outline"
                @click="toggleAddPairingSection">
                <i :class="showAddPairing ? 'fas fa-times' : 'ni ni-fat-add'"></i>
                {{ showAddPairing ? 'Cancel Add Pairing' : 'Add New Pairing' }}
            </argon-button>
        </div>

        <div v-if="showAddPairing" class="add-pairing-section">
            <h5>{{ editingPairing ? 'Edit Pairing' : 'Add New Pairing' }}</h5>
            <div class="row mb-3">
                <div class="col-md-6">
                    <label for="busSelect" class="form-label">Bus Plate Number</label>
                    <select id="busSelect" class="form-select" v-model="newPairing.busId" required>
                        <option value="" disabled>Select a Bus</option>
                        <option v-for="bus in availableBuses" :key="bus.id" :value="bus.id">{{ bus.plateNumber }}
                        </option>
                    </select>
                </div>
                <div class="col-md-6">
                    <label for="driverSelect" class="form-label">Driver Name</label>
                    <select id="driverSelect" class="form-select" v-model="newPairing.driverId" required>
                        <option value="" disabled>Select a Driver</option>
                        <option v-for="driver in availableDrivers" :key="driver.id" :value="driver.id"
                            :disabled="driver.status === 'disabled' || driver.status === 'pending'"
                            :class="{ 'text-muted': driver.status === 'disabled' || driver.status === 'pending' }">
                            {{ driver.name }}
                            <span v-if="driver.status === 'disabled'">(Disabled)</span>
                            <span v-if="driver.status === 'pending'">(Pending)</span>
                        </option>
                    </select>
                    <div v-if="!isDriverAvailable(newPairing.driverId)" class="invalid-feedback">
                        Selected driver is not available
                    </div>
                </div>
            </div>

            <div class="mb-3">
                <ArgonSwitch id="isActive" name="isActive" :checked="newPairing.isActive"
                    @change="newPairing.isActive = $event.target.checked">
                    Status: {{ newPairing.isActive ? 'Active' : 'Inactive' }}
                </ArgonSwitch>
            </div>
            <div v-if="errors.general" class="alert alert-danger text-white mb-3">
                {{ errors.general }}
            </div>
            <div class="d-flex justify-content-end gap-3 mt-4">
                <argon-button color="secondary" @click="cancelAddPairing">
                    Cancel
                </argon-button>
                <argon-button color="success" @click="savePairing">
                    {{ editingPairing ? 'Update Pairing' : 'Save Pairing' }}
                </argon-button>
            </div>
        </div>

        <div class="table-responsive p-0 mt-3">
            <table class="table align-items-center justify-content-center mb-0">
                <thead>
                    <tr>
                        <th class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2 cursor-pointer"
                            @click="sortBy('busPlateNumber')">
                            Bus Plate Number
                            <i v-if="sortColumn === 'busPlateNumber'"
                                :class="['fas', sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down']"></i>
                        </th>
                        <th class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2 cursor-pointer"
                            @click="sortBy('driverName')">
                            Driver Name
                            <i v-if="sortColumn === 'driverName'"
                                :class="['fas', sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down']"></i>
                        </th>
                        <th class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2 cursor-pointer"
                            @click="sortBy('isActive')">
                            Status
                            <i v-if="sortColumn === 'isActive'"
                                :class="['fas', sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down']"></i>
                        </th>
                        <th class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                            Actions
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="paginatedPairings.length === 0">
                        <td colspan="4" class="text-center py-4">
                            No pairings found
                        </td>
                    </tr>
                    <tr v-for="pairing in paginatedPairings" :key="pairing.id">
                        <td>
                            <p class="text-sm font-weight-bold mb-0">{{ pairing.busPlateNumber }}</p>
                        </td>
                        <td>
                            <p class="text-sm font-weight-bold mb-0"
                                :class="{ 'text-decoration-line-through': pairing.isDriverDisabled }">
                                {{ pairing.driverName }}
                                <span v-if="pairing.isDriverDisabled" class="text-muted ms-1">(disabled)</span>
                            </p>
                        </td>
                        <td>
                            <span
                                :class="['badge badge-sm', pairing.isActive ? 'bg-gradient-success' : 'bg-gradient-secondary']">
                                {{ pairing.isActive ? 'Active' : 'Inactive' }}
                            </span>
                        </td>
                        <td class="align-middle">
                            <button class="btn btn-link text-secondary mb-0 px-1" @click="editPairing(pairing)">
                                <i class="fas fa-pencil-alt text-xs" aria-hidden="true"></i>
                            </button>
                            <button class="btn btn-link text-danger mb-0 px-1"
                                @click="promptDeactivatePairing(pairing.id)">
                                <i class="fas fa-trash-alt text-xs" aria-hidden="true"></i>
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>

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

            <div v-if="currentPage === totalPages" class="d-flex justify-content-center mt-3">
                <argon-button color="link" @click="toggleShowInactive">
                    <i :class="['fas', showInactive ? 'fa-angle-double-up' : 'fa-angle-double-down']"></i>
                    {{ showInactive ? 'Hide Inactive Pairings' : 'Show All' }}
                </argon-button>
            </div>
        </div>

        <!-- Deactivate Confirmation Modal -->
        <div class="modal fade" :class="{ 'show d-block': showDeactivateModal }" tabindex="-1" role="dialog"
            v-if="showDeactivateModal">
            <div class="modal-dialog modal-dialog-centered" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Confirm Pairing Deactivation</h5>
                        <button type="button" class="btn-close" @click="showDeactivateModal = false"></button>
                    </div>
                    <div class="modal-body">
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        <strong>Important:</strong> Pairings cannot be permanently deleted.
                        <p class="mt-3">This will mark the bus-driver pairing as inactive. Are you sure you want to
                            proceed with deactivation?</p>
                    </div>
                    <div class="d-flex justify-content-end gap-2 mt-4">
                        <argon-button color="secondary" @click="showDeactivateModal = false">Cancel</argon-button>
                        <argon-button color="danger" @click="deactivatePairing">Set Inactive</argon-button>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-backdrop fade show" v-if="showDeactivateModal"></div>
    </div>
</template>



<style scoped>
.add-pairing-section {
    padding: 20px;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    background-color: #f9f9f9;
    margin-top: 15px;
}
</style>
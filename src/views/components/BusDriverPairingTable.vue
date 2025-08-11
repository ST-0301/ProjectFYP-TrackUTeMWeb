<script setup>
import { ref, computed } from 'vue';
import { addDoc, updateDoc, doc } from 'firebase/firestore';
import { busDriverPairingCollection } from '@/firebase';
import ArgonButton from "@/components/ArgonButton.vue";
import ArgonSwitch from "@/components/ArgonSwitch.vue";


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
const showAddPairing = ref(false);
const editingPairing = ref(false);
const newPairing = ref(createDefaultPairing());
const pairingToDeactivate = ref(null);
const showDeactivateModal = ref(false);
const errors = ref({ general: '' });
const sortColumn = ref(null);
const sortDirection = ref('asc');
const showInactive = ref(false);


// Helper functions
function createDefaultPairing() {
    return {
        busId: '',
        driverId: '',
        isActive: true,
        id: null
    };
}
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
    showInactive.value = !showInactive.value;
    if (showInactive.value) {
        sortColumn.value = 'isActive';
        sortDirection.value = 'desc';
    } else {
        if (sortColumn.value === 'isActive') {
            sortColumn.value = null;
            sortDirection.value = 'asc';
        }
    }
};


// Computed properties
const displayPairings = computed(() => {
    const mappedPairings = props.pairings.map(pairing => {
        const bus = props.buses.find(b => b.id === pairing.busId);
        const driver = props.drivers.find(d => d.id === pairing.driverId);
        return {
            ...pairing,
            busPlateNumber: bus ? bus.plateNumber : 'Unknown Bus',
            driverName: driver ? driver.name : 'Unknown Driver'
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
const availableBuses = computed(() => props.buses);
const availableDrivers = computed(() => props.drivers);


// CRUD operations
const savePairing = async () => {
    errors.value.general = '';

    if (!newPairing.value.busId || !newPairing.value.driverId) {
        errors.value.general = 'Please select both a bus and a driver.';
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
const promptDeactivatePairing = (id) => {
    pairingToDeactivate.value = id;
    showDeactivateModal.value = true;
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
</script>



<template>
    <div>
        <div class="d-flex justify-content-end mb-3">
            <argon-button color="success" size="sm" @click="toggleAddPairingSection">
                <i class="ni ni-fat-add"></i> {{ showAddPairing ? 'Cancel Add Pairing' : 'Add New Pairing' }}
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
                        <option v-for="driver in availableDrivers" :key="driver.id" :value="driver.id">{{ driver.name }}
                        </option>
                    </select>
                </div>
            </div>

            <div class="mb-3">
                <ArgonSwitch id="isActive" name="isActive" :checked="newPairing.isActive"
                    @change="newPairing.isActive = $event.target.checked">
                    Status: {{ newPairing.isActive ? 'Active' : 'Inactive' }}
                </ArgonSwitch>
            </div>
            <div v-if="errors.general" class="text-danger text-sm mt-2">
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
                    <tr v-if="displayPairings.length === 0">
                        <td colspan="4" class="text-center py-4">
                            No pairings found
                        </td>
                    </tr>
                    <tr v-for="pairing in displayPairings" :key="pairing.id">
                        <td>
                            <p class="text-sm font-weight-bold mb-0">{{ pairing.busPlateNumber }}</p>
                        </td>
                        <td>
                            <p class="text-sm font-weight-bold mb-0">{{ pairing.driverName }}</p>
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

            <div class="d-flex justify-content-center mt-3">
                <argon-button color="link" @click="toggleShowInactive">
                    <i :class="['fas', showInactive ? 'fa-angle-double-up' : 'fa-angle-double-down']"></i>
                    {{ showInactive ? 'Hide Inactive Pairings' : 'Show All' }}
                </argon-button>
            </div>
        </div>

        <div class="modal fade" :class="{ 'show d-block': showDeactivateModal }" tabindex="-1" role="dialog"
            v-if="showDeactivateModal">
            <div class="modal-dialog modal-dialog-centered" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Confirm Deactivation</h5>
                        <button type="button" class="btn-close" @click="showDeactivateModal = false"></button>
                    </div>
                    <div class="modal-body">
                        <p>Pairings cannot be removed, only set to inactive. Are you sure you want to set this
                            pairing
                            to inactive?</p>
                    </div>
                    <div class="modal-footer">
                        <argon-button color="danger" @click="deactivatePairing">Set Inactive</argon-button>
                        <argon-button color="secondary" @click="showDeactivateModal = false">Cancel</argon-button>
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
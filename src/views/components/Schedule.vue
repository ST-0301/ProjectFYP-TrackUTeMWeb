<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { routeCollection, stopCollection, driverCollection, busCollection } from '@/firebase';
import { doc, getDoc, getDocs, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import ArgonButton from "@/components/ArgonButton.vue";


// Reactive state
const route = useRoute();
const currentRoute = ref({});
const activeTab = ref('monThu');
const schedule = ref({ monThu: { inbound: [], outbound: [] }, friday: { inbound: [], outbound: [] } });
const stops = ref([]);
const drivers = ref([]);
const buses = ref([]);
const showSlotModal = ref(false);
const showDeleteSlotModal = ref(false);
const currentSlot = ref({ dayType: '', direction: '', index: -1, time: '', driver: '', bus: '' });
const slotToDelete = ref(null);
const slotErrors = ref({ time: '', general: '' });


// Lifecycle hooks
onMounted(async () => {
    const routeId = route.params.id;

    // Fetch route 
    const routeRef = doc(routeCollection, routeId);
    const routeSnap = await getDoc(routeRef);
    if (routeSnap.exists()) currentRoute.value = routeSnap.data();

    // Fetch schedules
    const fetchSchedule = async (dayType) => {
        const ref = doc(routeCollection, routeId, 'schedule', dayType);
        const snap = await getDoc(ref);
        if (snap.exists()) schedule.value[dayType] = snap.data();
    };
    await Promise.all([fetchSchedule('monThu'), fetchSchedule('friday')]);

    // Fetch stops 
    const stopUnsub = onSnapshot(stopCollection, (snapshot) => {
        stops.value = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    });

    // Fetch drivers and buses
    const [driversSnap, busesSnap] = await Promise.all([
        getDocs(driverCollection),
        getDocs(busCollection)
    ]);
    drivers.value = driversSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    buses.value = busesSnap.docs.map(b => ({ id: b.id, ...b.data() }));

    return () => stopUnsub();
});



// Helper functions
const getStopNames = (stopIds) => {
    if (!Array.isArray(stopIds) || stops.value.length === 0) {
        return '-';
    }
    const stopMap = stops.value.reduce((acc, stop) => {
        acc[stop.id] = stop.name;
        return acc;
    }, {});
    return stopIds.map(stopId => stopMap[stopId] || 'Unknown Stop').join(' → ') || '→';
};
const getDriverName = (driverId) => {
    const driver = drivers.value.find(d => d.id === driverId);
    return driver?.name || 'Unassigned';
};
const getBusNumber = (busId) => {
    const bus = buses.value.find(b => b.id === busId);
    return bus?.licensePlate || 'Unassigned';
};


// Validation functions
function validateSlot() {
    slotErrors.value = { time: '', general: '' };
    let isValid = true;
    if (!currentSlot.value.time) {
        slotErrors.value.time = 'Time is required';
        isValid = false;
    }
    return isValid;
}


// CRUD operations
const saveSlot = async () => {
    if (!validateSlot()) return;

    const { dayType, direction, index, time, driver, bus } = currentSlot.value;
    const routeId = route.params.id;
    const scheduleRef = doc(routeCollection, routeId, 'schedule', dayType);
    try {
        const scheduleSnap = await getDoc(scheduleRef);
        const currentData = scheduleSnap.exists() ? scheduleSnap.data() : { inbound: [], outbound: [] };
        const slots = [...currentData[direction]];

        if (index === -1) {
            slots.push({ time, driver, bus });
        } else {
            slots[index] = { time, driver, bus };
        }
        await setDoc(scheduleRef, {
            ...currentData,
            [direction]: slots
        }, { merge: true });

        const updatedSnap = await getDoc(scheduleRef);
        if (updatedSnap.exists()) {
            schedule.value[dayType][direction] = updatedSnap.data()[direction];
        }
    } catch (error) {
        console.error("Error saving slot:", error);
        slotErrors.value.general = "Failed to save slot. Please check your connection.";
    }
    showSlotModal.value = false;
};
const deleteSlot = async () => {
    const { direction, index } = slotToDelete.value;
    const dayType = activeTab.value;
    const routeId = route.params.id;
    const scheduleRef = doc(routeCollection, routeId, 'schedule', dayType);

    try {
        const currentData = (await getDoc(scheduleRef)).data();
        const slots = [...currentData[direction]];
        slots.splice(index, 1);
        await updateDoc(scheduleRef, {
            [direction]: slots
        });

        schedule.value[dayType][direction] = slots;
    } catch (error) {
        console.error("Error deleting slot:", error);
    }
    showDeleteSlotModal.value = false;
};


// UI handlers
const openSlotModal = (direction, index = -1) => {
    if (index === -1) {
        currentSlot.value = {
            dayType: activeTab.value,
            direction,
            index: -1,
            time: '',
            driver: '',
            bus: ''
        };
    } else {
        const slot = schedule.value[activeTab.value][direction][index];
        currentSlot.value = {
            dayType: activeTab.value,
            direction,
            index,
            ...slot
        };
    }
    showSlotModal.value = true;
};
const confirmDeleteSlot = (direction, index) => {
    slotToDelete.value = { direction, index };
    showDeleteSlotModal.value = true;
};


// Computed properties
const filteredInbound = computed(() => {
    const daySchedule = schedule.value[activeTab.value];
    return daySchedule?.inbound || [];
});
const filteredOutbound = computed(() => {
    const daySchedule = schedule.value[activeTab.value];
    return daySchedule?.outbound || [];
});


// Watchers
watch(() => currentSlot.value.time, () => {
    if (currentSlot.value.time) slotErrors.value.time = '';
});
</script>



<template>
    <div class="py-4 container-fluid">
        <div class="row">
            <div class="col-12">
                <div class="card mb-4">
                    <div class="card-header pb-0">
                        <h4>Schedule for {{ currentRoute.name }}</h4>
                        <p class="text-sm">Stops: {{ getStopNames(currentRoute.stops) }}</p>
                    </div>

                    <div class="card-body">
                        <!-- Tab Buttons -->
                        <div class="tabs-container justify-content-center mb-4">
                            <ul class="nav nav-pills nav-fill equal-width-tabs-centered">
                                <li class="nav-item">
                                    <button class="nav-link" :class="{ 'active': activeTab === 'monThu' }"
                                        @click="activeTab = 'monThu'">
                                        Monday – Thursday
                                    </button>
                                </li>
                                <li class="nav-item">
                                    <button class="nav-link" :class="{ 'active': activeTab === 'friday' }"
                                        @click="activeTab = 'friday'">
                                        Friday
                                    </button>
                                </li>
                            </ul>
                        </div>

                        <!-- Inbound -->
                        <div class="mt-4">
                            <h6>{{ activeTab === 'monThu' ? 'Monday to Thursday' : 'Friday' }} Inbound Times</h6>
                            <table class="table align-items-center justify-content-center mb-0">
                                <thead>
                                    <tr>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Time</th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Driver</th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Bus</th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(slot, index) in filteredInbound" :key="'inbound-' + index">
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">{{ slot.time }}</p>
                                        </td>
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">{{ slot.driver ?
                                                getDriverName(slot.driver) : '-' }}</p>
                                        </td>
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">{{ slot.bus ?
                                                getBusNumber(slot.bus) : '-' }}</p>
                                        </td>
                                        <td class="align-middle">
                                            <button class="btn btn-link text-secondary mb-0 px-1"
                                                @click="openSlotModal('inbound', index)">
                                                <i class="fas fa-pencil-alt text-xs"></i>
                                            </button>
                                            <button class="btn btn-link text-danger mb-0 px-1"
                                                @click="confirmDeleteSlot('inbound', index)">
                                                <i class="fas fa-trash-alt text-xs"></i>
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                            <ArgonButton color="info" size="sm" @click="openSlotModal('inbound')">
                                Add Time Slot
                            </ArgonButton>
                        </div>

                        <!-- Outbound -->
                        <div class="mt-4">
                            <h6>{{ activeTab === 'monThu' ? 'Monday to Thursday' : 'Friday' }} Outbound Times</h6>
                            <table class="table align-items-center justify-content-center mb-0">
                                <thead>
                                    <tr>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Time</th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Driver</th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Bus</th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(slot, index) in filteredOutbound" :key="'inbound-' + index">
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">{{ slot.time }}</p>
                                        </td>
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">{{ slot.driver ?
                                                getDriverName(slot.driver) : '-' }}</p>
                                        </td>
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">{{ slot.bus ?
                                                getBusNumber(slot.bus) : '-' }}</p>
                                        </td>
                                        <td class="align-middle">
                                            <button class="btn btn-link text-secondary mb-0 px-1"
                                                @click="openSlotModal('inbound', index)">
                                                <i class="fas fa-pencil-alt text-xs"></i>
                                            </button>
                                            <button class="btn btn-link text-danger mb-0 px-1"
                                                @click="confirmDeleteSlot('inbound', index)">
                                                <i class="fas fa-trash-alt text-xs"></i>
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                            <ArgonButton color="info" size="sm" @click="openSlotModal('outbound')">
                                Add Time Slot
                            </ArgonButton>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Slot Modal -->
        <div class="modal fade" :class="{ 'show d-block': showSlotModal }" tabindex="-1" role="dialog"
            v-if="showSlotModal">
            <div class="modal-dialog modal-dialog-centered" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            {{ currentSlot.index === -1 ? 'Add' : 'Edit' }} Time Slot
                        </h5>
                        <button type="button" class="btn-close" @click="showSlotModal = false"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label>Time</label>
                            <input type="time" v-model="currentSlot.time" class="form-control" required>
                            <div v-if="slotErrors.time" class="text-danger text-sm mt-1">
                                {{ slotErrors.time }}
                            </div>
                        </div>
                        <div class="mb-3">
                            <label>Driver</label>
                            <select v-model="currentSlot.driver" class="form-select">
                                <option value="">Select Driver (optional)</option>
                                <option v-for="driver in drivers" :value="driver.id" :key="driver.id">
                                    {{ driver.name }}
                                </option>
                            </select>
                        </div>
                        <div class="mb-3">
                            <label>Bus</label>
                            <select v-model="currentSlot.bus" class="form-select">
                                <option value="">Select Bus (optional)</option>
                                <option v-for="bus in buses" :value="bus.id" :key="bus.id">
                                    {{ bus.licensePlate }}
                                </option>
                            </select>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <div v-if="slotErrors.general" class="alert alert-danger text-sm mt-2">
                            {{ slotErrors.general }}
                        </div>
                        <ArgonButton color="secondary" @click="showSlotModal = false">Cancel</ArgonButton>
                        <ArgonButton color="success" @click="saveSlot">Save</ArgonButton>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-backdrop fade show" v-if="showSlotModal"></div>

        <!-- Delete Confirmation Modal -->
        <div class="modal fade" :class="{ 'show d-block': showDeleteSlotModal }" tabindex="-1" role="dialog"
            v-if="showDeleteSlotModal">
            <div class="modal-dialog modal-dialog-centered" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Confirm Delete</h5>
                        <button type="button" class="btn-close" @click="showDeleteSlotModal = false"></button>
                    </div>
                    <div class="modal-body">
                        <p>Are you sure you want to delete this time slot?</p>
                    </div>
                    <div class="modal-footer">
                        <ArgonButton color="danger" @click="deleteSlot">Delete</ArgonButton>
                        <ArgonButton color="secondary" @click="showDeleteSlotModal = false">Cancel</ArgonButton>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-backdrop fade show" v-if="showDeleteSlotModal"></div>
    </div>
</template>



<style scoped>
.tabs-container.justify-content-center {
    max-width: 1140px;
    margin: 0 auto;
    margin-bottom: 1.5rem;
}
.equal-width-tabs-centered {
    display: flex;
}
.equal-width-tabs-centered .nav-item {
    flex: 1;
}
.nav-pills .nav-link {
    color: #495057;
    border-radius: 0.375rem;
    transition: all 0.3s ease;
}
.nav-pills .nav-link:hover {
    background-color: rgba(0, 0, 0, 0.05);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}
.nav-pills .nav-link.active {
    background-color: #344767;
    color: white;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
}
</style>
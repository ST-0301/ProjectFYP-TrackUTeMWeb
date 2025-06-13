<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import { scheduleCollection, routeCollection, rPointCollection, driverCollection, busCollection } from '@/firebase';
import { query, where, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import ArgonButton from "@/components/ArgonButton.vue";
import ArgonCheckbox from "@/components/ArgonCheckbox.vue";
import ArgonInput from "@/components/ArgonInput.vue";


// Reactive state
const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const route = useRoute();
const currentRoute = ref({});
const rPoints = ref([]);
const schedule = ref({});
const drivers = ref([]);
const buses = ref([]);
const activeTab = ref('incampus');
const showSlotModal = ref(false);
const showDeleteModal = ref(false);
const currentSlot = ref({ days: [], index: -1, time: '', assignments: [{ driver: '', bus: '' }], originalDays: [] });
const slotErrors = ref({ time: '', days: '', general: '' });


// Lifecycle hooks
onMounted(async () => {
    const routeId = route.params.id;
    const routeRef = doc(routeCollection, routeId);
    const routeSnap = await getDoc(routeRef);
    if (routeSnap.exists()) currentRoute.value = routeSnap.data();
    const q = query(scheduleCollection, where('routeId', '==', routeId));
    const querySnapshot = await getDocs(q);
    days.forEach(day => {
        schedule.value[day.toLowerCase()] = { incampus: [], outcampus: [] };
    });
    querySnapshot.forEach((doc) => {
        const sched = doc.data();
        const day = sched.day.toLowerCase();
        const type = sched.type.toLowerCase();
        if (schedule.value[day] && schedule.value[day][type]) {
            schedule.value[day][type].push({
                id: doc.id,
                time: sched.time,
                assignments: sched.assignments,
                status: sched.status,
                busId: sched.busId,
                driverId: sched.driverId
            });
        }
    });
    onSnapshot(rPointCollection, snapshot => rPoints.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    const [driversSnap, busesSnap] = await Promise.all([
        getDocs(driverCollection),
        getDocs(busCollection)
    ]);
    drivers.value = driversSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    buses.value = busesSnap.docs.map(b => ({ id: b.id, ...b.data() }));
});


// Helper functions
const getRPointNames = (rPointIds) => {
    if (!Array.isArray(rPointIds) || rPoints.value.length === 0) {
        return '-';
    }
    const rPointMap = rPoints.value.reduce((acc, rPoint) => {
        acc[rPoint.id] = rPoint.name;
        return acc;
    }, {});
    return rPointIds.map(rPointId => rPointMap[rPointId] || 'Unknown Route Point').join(' → ') || '→';
};
const getAllTimes = () => {
    const allTimes = new Set();
    days.forEach(day => {
        const daySchedule = schedule.value[day] || {};
        const directionSlots = daySchedule[activeTab.value] || [];
        directionSlots.forEach(slot => {
            if (slot?.time) allTimes.add(slot.time);
        });
    });
    return Array.from(allTimes).sort();
};
const getSlotIndex = (day, time) => {
    const daySchedule = schedule.value[day] || {};
    const slots = daySchedule[activeTab.value] || [];
    return slots.findIndex(s => s.time === time);
};
const getCounts = (day, time) => {
    const type = activeTab.value;
    const entries = schedule.value[day]?.[type]?.filter(s => s.time === time) || [];
    return {
        drivers: entries.length,
        buses: entries.length
    };
};
const checkExistingTimes = () => {
    const conflicts = [];
    currentSlot.value.days.forEach(day => {
        const lowerDay = day.toLowerCase();
        const directionSlots = schedule.value[lowerDay]?.[activeTab.value] || [];
        if (directionSlots.some(slot => slot.time === currentSlot.value.time)) {
            conflicts.push(day);
        }
    });
    return conflicts;
};
const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);


// Validation function
const validateSlot = () => {
    slotErrors.value = { time: '', days: '', general: '' };
    let valid = true;
    if (!currentSlot.value.time) {
        slotErrors.value.time = 'Time is required';
        valid = false;
    }
    if (currentSlot.value.index === -1) {
        if (currentSlot.value.days.length === 0) {
            slotErrors.value.days = 'Select at least one day';
            valid = false;
        } else {
            const conflicts = checkExistingTimes();
            if (conflicts.length > 0) {
                slotErrors.value.general = `Time already exists in: ${conflicts.join(', ')}`;
                valid = false;
            }
        }
    }
    if (currentSlot.value.assignments.some(a => (a.driver && !a.bus) || (!a.driver && a.bus))) {
        slotErrors.value.general = 'Select both driver and bus for each assignment or leave both empty';
        valid = false;
    }
    return valid;
};


// CRUD operations
const saveSlot = async () => {
    try {
        if (!validateSlot()) return;
        const { days: selectedDays, time, assignments, isEditing, originalTime } = currentSlot.value;
        const routeId = route.params.id;
        const type = activeTab.value;

        // Get current route details
        const routeRef = doc(routeCollection, routeId);
        const routeSnap = await getDoc(routeRef);
        const currentRouteRPoints = routeSnap.exists() ? routeSnap.data().rPoints : [];
        const rPointsArray = currentRouteRPoints.map(rPointId => ({
            rPointId,
            expDepTime: 0,
            expArrTime: 0,
            status: 'scheduled'
        }));

        const validAssignments = assignments
            .filter(a => a.driver && a.bus);
        if (isEditing) {
            const originalDay = currentSlot.value.days[0].toLowerCase();
            const q = query(
                scheduleCollection,
                where('routeId', '==', routeId),
                where('type', '==', type),
                where('day', '==', originalDay),
                where('time', '==', originalTime)
            );
            const querySnapshot = await getDocs(q);
            const existingDocs = new Map();
            querySnapshot.forEach(doc => {
                existingDocs.set(doc.id, doc.ref);
            });
            const updatePromises = [];
            const deletePromises = [];
            assignments.forEach(assignment => {
                if (assignment.id) {
                    if (existingDocs.has(assignment.id)) {
                        // Update existing document
                        updatePromises.push(
                            updateDoc(existingDocs.get(assignment.id), {
                                time: time,
                                driverId: assignment.driver,
                                busId: assignment.bus,
                                rPoints: rPointsArray // new field
                            }));
                        existingDocs.delete(assignment.id);
                    }
                } else {
                    // Create new document
                    updatePromises.push(
                        addDoc(scheduleCollection, {
                            day: originalDay,
                            type,
                            routeId,
                            time,
                            driverId: assignment.driver,
                            busId: assignment.bus,
                            status: 'scheduled',
                            created: new Date(),
                            rPoints: rPointsArray // new field
                        })
                    );
                }
            });
            existingDocs.forEach(ref => {
                deletePromises.push(deleteDoc(ref));
            });

            await Promise.all([...updatePromises, ...deletePromises]);
        } else {
            // Create new documents for each selected day and each assignment
            const promises = [];
            for (const day of selectedDays) {
                const lowerDay = day.toLowerCase();
                for (const assignment of validAssignments) {
                    promises.push(
                        addDoc(scheduleCollection, {
                            day: lowerDay,
                            type,
                            routeId,
                            time,
                            driverId: assignment.driver,
                            busId: assignment.bus,
                            status: 'scheduled',
                            created: new Date(),
                            rPoints: rPointsArray // new field
                        })
                    );
                }
            }
            await Promise.all(promises);
        }
        const refreshQ = query(scheduleCollection, where('routeId', '==', routeId));
        const refreshSnapshot = await getDocs(refreshQ);
        days.forEach(day => {
            schedule.value[day] = { incampus: [], outcampus: [] };
        });
        refreshSnapshot.forEach(doc => {
            const sched = doc.data();
            const day = sched.day.toLowerCase();
            const type = sched.type.toLowerCase();
            schedule.value[day][type].push({ ...sched, id: doc.id });
        });
        closeModal();
    } catch (error) {
        console.error("Save error:", error);
        slotErrors.value.general = "Failed to save. Please check your data.";
    }
};
const deleteSlot = async () => {
    try {
        const routeId = route.params.id;
        const type = activeTab.value;
        const day = currentSlot.value.days[0].toLowerCase();
        const time = currentSlot.value.originalTime;

        // Query all matching documents
        const q = query(
            scheduleCollection,
            where('routeId', '==', routeId),
            where('type', '==', type),
            where('day', '==', day),
            where('time', '==', time)
        );
        const querySnapshot = await getDocs(q);
        const deletePromises = [];
        querySnapshot.forEach(doc => {
            deletePromises.push(deleteDoc(doc.ref));
        });
        await Promise.all(deletePromises);
        schedule.value[day][type] = schedule.value[day][type].filter(s => s.time !== time);

        closeModal();
        showDeleteModal.value = false;
    } catch (error) {
        console.error("Delete error:", error);
        slotErrors.value.general = "Failed to delete. Please try again.";
    }
};


// UI handlers
const openModal = async (initialDay, time = '') => {
    const lowerDay = initialDay.toLowerCase();
    const routeId = route.params.id;
    const type = activeTab.value;
    if (time) {
        // Query all documents for this time slot
        const q = query(
            scheduleCollection,
            where('routeId', '==', routeId),
            where('type', '==', type),
            where('day', '==', lowerDay),
            where('time', '==', time)
        );
        const querySnapshot = await getDocs(q);
        currentSlot.value = {
            days: [initialDay],
            originalDays: [initialDay],
            originalTime: time,
            time: time,
            initialDay: initialDay,
            assignments: querySnapshot.docs.map(doc => ({
                id: doc.id,
                driver: doc.data().driverId,
                bus: doc.data().busId
            })),
            isEditing: true
        };
    } else {
        currentSlot.value = {
            days: [initialDay],
            originalDays: [],
            index: -1,
            time: '',
            assignments: [{ driver: '', bus: '' }],
            initialDay,
            isEditing: false
        };
    }
    showSlotModal.value = true;
};
const closeModal = () => {
    showSlotModal.value = false;
    currentSlot.value = {
        days: [],
        originalDays: [],
        index: -1,
        time: '',
        assignments: [{ driver: '', bus: '' }],
        initialDay: null
    };
    slotErrors.value = { time: '', days: '', general: '' };
};
const addAssignment = () =>
    currentSlot.value.assignments.push({ driver: '', bus: '' });
const updateAssignment = (index, field, value) => {
    currentSlot.value.assignments[index][field] = value;
};
const removeAssignment = (index) => {
    if (currentSlot.value.assignments.length > 1) {
        currentSlot.value.assignments.splice(index, 1);
    }
};


// Computed properties
const usedDrivers = computed(() => {
    return new Set(currentSlot.value.assignments.map(a => a.driver).filter(Boolean));
});
const usedBuses = computed(() => {
    return new Set(currentSlot.value.assignments.map(a => a.bus).filter(Boolean));
});
const availableDrivers = (currentAssignment) => {
    return drivers.value.filter(driver =>
        !usedDrivers.value.has(driver.id) || driver.id === currentAssignment.driver
    );
};
const availableBuses = (currentAssignment) => {
    return buses.value.filter(bus =>
        !usedBuses.value.has(bus.id) || bus.id === currentAssignment.bus
    );
};


// Watchers
watch(() => currentSlot.value.time, () => slotErrors.value.time = '');
watch(() => currentSlot.value.assignments, () => {
    const duplicates = new Set();
    const allDrivers = currentSlot.value.assignments.map(a => a.driver).filter(Boolean);
    const allBuses = currentSlot.value.assignments.map(a => a.bus).filter(Boolean);
    slotErrors.value.general = '';
    if (new Set(allDrivers).size !== allDrivers.length) {
        duplicates.add('drivers');
    }
    if (new Set(allBuses).size !== allBuses.length) {
        duplicates.add('buses');
    }
    if (duplicates.size > 0) {
        slotErrors.value.general = `Duplicate ${[...duplicates].join(' and ')} detected`;
    }
}, { deep: true });
</script>



<template>
    <div class="container-fluid py-4">
        <div class="card">
            <div class="card-header pb-0">
                <h4>Schedule for {{ currentRoute.name }}</h4>
                <p class="text-sm mb-0">Route Points: {{ getRPointNames(currentRoute.rPoints) }}</p>
            </div>

            <!-- Tab Buttons -->
            <div class="card-body">
                <div class="tabs-container justify-content-center mb-4">
                    <ul class="nav nav-pills nav-fill equal-width-tabs-centered">
                        <li class="nav-item">
                            <button class="nav-link" :class="{ 'active': activeTab === 'incampus' }"
                                @click="activeTab = 'incampus'">
                                In Campus
                            </button>
                        </li>
                        <li class="nav-item">
                            <button class="nav-link" :class="{ 'active': activeTab === 'outcampus' }"
                                @click="activeTab = 'outcampus'">
                                Out Campus
                            </button>
                        </li>
                    </ul>
                </div>

                <!-- Schedule Table -->
                <div class="table-responsive">
                    <table class="table table-bordered text-center" style="table-layout: fixed">
                        <colgroup>
                            <col style="width: 90px">
                            <col v-for="day in days" :key="day">
                        </colgroup>
                        <thead>
                            <tr>
                                <th class="text-sm text-center bg-light" style="width: 90px">Time</th>
                                <th v-for="day in days" :key="day" class="text-sm text-center bg-light px-3 py-3">
                                    <div class="d-flex align-items-center justify-content-center gap-2">
                                        <span class="text-truncate">{{ capitalize(day) }}</span>
                                        <button class="btn btn-link mb-0 p-0" @click="openModal(day)"
                                            title="Add time slot">
                                            <i class="fas fa-plus-circle fs-6"></i>
                                        </button>
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="time in getAllTimes()" :key="time">
                                <td class="text-sm">{{ time }}</td>
                                <td v-for="day in days" :key="day" class="text-truncate">
                                    <template v-if="getSlotIndex(day, time) !== -1">
                                        <button class="btn btn-light mb-0 px-3 py-2" @click="openModal(day, time)">
                                            <span class="badge text-dark me-2">
                                                <i class="fas fa-user me-1"></i>
                                                {{ getCounts(day, time).drivers }}
                                            </span>
                                            <span class="badge text-dark">
                                                <i class="fas fa-bus me-1"></i>
                                                {{ getCounts(day, time).buses }}
                                            </span>
                                        </button>
                                    </template>
                                    <template v-else>
                                        &nbsp;
                                    </template>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Slot Modal -->
        <div v-if="showSlotModal" class="modal fade show d-block">
            <div class="modal-dialog modal-dialog-centered modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            {{ currentSlot.index === -1 ? 'Add Time Slot' : 'Edit Time Slot' }}
                            <span v-if="currentSlot.index !== -1" class="text-muted text-sm">
                                ({{ capitalize(currentSlot.initialDay) }} - {{ activeTab === 'incampus' ? 'In Campus' :
                                'Out Campus'
                                }})
                            </span>
                        </h5>
                        <button type="button" class="btn-close" @click="closeModal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label class="form-label">Time</label>
                            <argon-input type="time" v-model="currentSlot.time" required />
                            <div v-if="slotErrors.time" class="text-danger text-sm mt-1">{{ slotErrors.time }}</div>
                        </div>

                        <div class="mb-3">
                            <div v-if="currentSlot.index === -1">
                                <label class="form-label">Day</label>
                                <div class="d-flex flex-wrap gap-3">
                                    <div v-for="day in days" :key="day" class="form-check d-flex align-items-center">
                                        <argon-checkbox :id="`day-${day}`" v-model="currentSlot.days" :value="day" />
                                        <label :for="`day-${day}`" class="form-check-label ms-2 mb-0">
                                            {{ capitalize(day) }}
                                        </label>
                                    </div>
                                    <div v-if="slotErrors.days" class="text-danger text-sm mt-1">
                                        {{ slotErrors.days }}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="mb-3">
                            <label class="form-label">Assignment</label>
                            <div v-for="(assignment, idx) in currentSlot.assignments" :key="idx"
                                class="d-flex mb-3 align-items-center gap-2">

                                <select class="form-select" v-model="assignment.driver"
                                    @change="updateAssignment(idx, 'driver', $event.target.value)" :class="{
                                        'is-invalid': (assignment.driver && !assignment.bus) ||
                                            (!assignment.driver && assignment.bus)
                                    }">
                                    <option value="">Select Driver</option>
                                    <option v-for="d in availableDrivers(assignment)" :key="d.id" :value="d.id"
                                        :disabled="usedDrivers.has(d.id) && d.id !== assignment.driver">{{ d.name }}
                                    </option>
                                </select>

                                <select class="form-select" v-model="assignment.bus"
                                    @change="updateAssignment(idx, 'bus', $event.target.value)" :class="{
                                        'is-invalid': (assignment.bus && !assignment.driver) ||
                                            (!assignment.bus && assignment.driver)
                                    }">
                                    <option value="">Select Bus</option>
                                    <option v-for="b in availableBuses(assignment)" :key="b.id" :value="b.id"
                                        :disabled="usedBuses.has(b.id) && b.id !== assignment.bus">{{ b.licensePlate }}
                                    </option>
                                </select>

                                <argon-button color="danger" @click="removeAssignment(idx)"
                                    :disabled="currentSlot.assignments.length <= 1">
                                    <i class="fas fa-trash"></i>
                                </argon-button>
                            </div>
                        </div>
                        <argon-button color="primary" class="btn-sm" @click="addAssignment">
                            <i class="fas fa-plus me-1"></i> Add Assignment
                        </argon-button>

                        <div v-if="slotErrors.general" class="text-danger text-sm text-sm mt-3">
                            {{ slotErrors.general }}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <argon-button color="danger" v-if="currentSlot.isEditing" @click="showDeleteModal = true">
                            Delete Slot
                        </argon-button>
                        <argon-button color="secondary" @click="closeModal">Cancel</argon-button>
                        <argon-button color="primary" @click="saveSlot">Save</argon-button>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-backdrop fade show" v-if="showSlotModal"></div>

        <!-- Delete confirmation modal -->
        <div class="modal fade" :class="{ 'show d-block': showDeleteModal }" tabindex="-1" role="dialog"
            v-if="showDeleteModal">
            <div class="modal-dialog modal-dialog-centered" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Confirm Delete</h5>
                        <button type="button" class="btn-close" @click="showDeleteModal = false"></button>
                    </div>
                    <div class="modal-body">
                        <p>Are you sure you want to delete this time slot?</p>
                    </div>
                    <div class="modal-footer">
                        <argon-button color="danger" @click="deleteSlot">Delete</argon-button>
                        <argon-button color="secondary" @click="showDeleteModal = false">Cancel</argon-button>
                    </div>
                </div>
            </div>
        </div>
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

.table {
    table-layout: fixed;
    border-collapse: collapse !important;
}
.table-responsive {
    overflow-x: auto;
}
th,
td {
    width: calc((100% - 90px) / 7);
    min-width: 120px;
    max-width: none !important;
    text-align: center;
    vertical-align: middle;
    border: 1px solid #e9ecef !important;
}
.text-truncate {
    max-width: 80px;
}
.badge {
    font-size: 1em;
    padding: 0.5em;
    display: inline-flex;
    align-items: center;
}
.btn-light {
    border: 1px solid #dee2e6 !important;
}
.btn-light:hover {
    background: #f8f9fa !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}
.btn-sm {
    padding: 10px 20px;
}
</style>
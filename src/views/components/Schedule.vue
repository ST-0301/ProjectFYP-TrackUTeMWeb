<script setup>
import { ref, onMounted, watch, computed } from 'vue';
// import Datepicker from 'vue3-datepicker';
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
const rpoints = ref([]);
const schedule = ref({});
const drivers = ref([]);
const buses = ref([]);
const activeTab = ref('incampus');
const showSlotModal = ref(false);
const showDeleteModal = ref(false);
const currentSlot = ref({ days: [], index: -1, time: '', assignments: [{ driver: '', bus: '' }], originalDays: [], rPointsTimes: [] });
const slotErrors = ref({ time: '', days: '', general: '' });
const currentStep = ref(1);
// const components = { Datepicker };


// Lifecycle hooks
onMounted(async () => {
    const routeId = route.params.id;
    const routeRef = doc(routeCollection, routeId);
    const routeSnap = await getDoc(routeRef);
    if (routeSnap.exists()) currentRoute.value = routeSnap.data();

    onSnapshot(
        query(scheduleCollection, where('routeId', '==', routeId)),
        (querySnapshot) => {
            const newSchedule = {};
            days.forEach(day => {
                newSchedule[day.toLowerCase()] = { incampus: [], outcampus: [], event: [] };
            });
            querySnapshot.forEach((doc) => {
                const sched = doc.data();
                const day = sched.day.toLowerCase();
                const type = sched.type.toLowerCase();

                if (type === 'event') {
                    if (newSchedule[day] && newSchedule[day].event) {
                        newSchedule[day].event.push({
                            id: doc.id,
                            time: sched.time,
                            date: sched.date,
                            assignments: sched.assignments,
                            status: sched.status,
                            busId: sched.busId,
                            driverId: sched.driverId,
                            rpoints: sched.rpoints || []
                        });
                    }
                } else if (newSchedule[day] && newSchedule[day][type]) {
                    newSchedule[day][type].push({
                        id: doc.id,
                        time: sched.time,
                        assignments: sched.assignments,
                        status: sched.status,
                        busId: sched.busId,
                        driverId: sched.driverId,
                        rpoints: sched.rpoints || []
                    });
                }
            });
            schedule.value = newSchedule;
        },
        (error) => {
            console.error("Error fetching schedules:", error);
        }
    );
    onSnapshot(rPointCollection, snapshot => rpoints.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    const [driversSnap, busesSnap] = await Promise.all([getDocs(driverCollection), getDocs(busCollection)]);
    drivers.value = driversSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    buses.value = busesSnap.docs.map(b => ({ id: b.id, ...b.data() }));
});


// Helper functions
const getRPointNames = (rPointIds) => {
    if (!Array.isArray(rPointIds) || rpoints.value.length === 0) {
        return '-';
    }
    const rPointMap = rpoints.value.reduce((acc, rPoint) => {
        acc[rPoint.id] = rPoint.name;
        return acc;
    }, {});
    return rPointIds.map(rpointId => rPointMap[rpointId] || 'Unknown Location').join(' → ') || '→';
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
    const driverCount = entries.filter(entry => entry.driverId !== null).length;
    const busCount = entries.filter(entry => entry.busId !== null).length;

    return { drivers: driverCount, buses: busCount };
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
const capitalize = (str) => {
    if (!str || typeof str !== 'string') return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
};


// Validation function
const validateStep1 = () => {
    slotErrors.value = { time: '', days: '', general: '', rPointsTimes: '' };
    let valid = true;
    if (!currentSlot.value.time) {
        slotErrors.value.time = 'Time is required';
        valid = false;
    }
    if (currentRoute.value.type === 'event') {
        if (!currentSlot.value.date) {
            slotErrors.value.dates = 'Select a date';
            valid = false;
        }
    } else if (currentSlot.value.index === -1) { 
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
    return valid;
};
const validateStep2 = () => {
    slotErrors.value = { time: '', days: '', general: '', rPointsTimes: '' };
    let valid = true;
    currentSlot.value.rPointsTimes.forEach(rp => {
        if (!rp.expDepTime || !rp.expArrTime) {
            slotErrors.value.rPointsTimes = 'Please provide both Expected Departure and Expected Arrival times for all locations.';
            valid = false;
        }
    });
    return valid;
};
const validateStep3 = () => {
    slotErrors.value = { time: '', days: '', general: '', rPointsTimes: '' };
    let valid = true;
    if (currentSlot.value.assignments.some(a => (a.driver && !a.bus) || (!a.driver && a.bus))) {
        slotErrors.value.general = 'Select both driver and bus for each assignment or leave both empty';
        valid = false;
    }

    const duplicates = new Set();
    const allDrivers = currentSlot.value.assignments.map(a => a.driver).filter(Boolean);
    const allBuses = currentSlot.value.assignments.map(a => a.bus).filter(Boolean);
    if (new Set(allDrivers).size !== allDrivers.length) {
        duplicates.add('drivers');
    }
    if (new Set(allBuses).size !== allBuses.length) {
        duplicates.add('buses');
    }
    if (duplicates.size > 0) {
        slotErrors.value.general = `Duplicate ${[...duplicates].join(' and ')} detected`;
        valid = false;
    }
    return valid;
};


// CRUD operations
const saveSlot = async () => {
    try {
        const routeId = route.params.id;
        const assignments = currentSlot.value.assignments || [];
        const validAssignments = assignments.filter(a => a.driver && a.bus);
        validateStep3();

        // Event
        if (currentRoute.value.type === 'event') {
            const date = currentSlot.value.date;

            if (!date) {
                slotErrors.value.general = "Please select a date for the event.";
                return;
            }
            const jsDate = new Date(date);
            const day = jsDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

            if (currentSlot.value.isEditing && currentSlot.value.scheduleId) {
                await updateDoc(doc(scheduleCollection, currentSlot.value.scheduleId), {
                    date: date,
                    time: currentSlot.value.time,
                    driverId: validAssignments[0]?.driver || null,
                    busId: validAssignments[0]?.bus || null,
                });
            } else {
                const newDocRef = await addDoc(scheduleCollection, {
                    date,
                    day,
                    type: 'event',
                    routeId,
                    time: currentSlot.value.time,
                    driverId: validAssignments[0]?.driver || null,
                    busId: validAssignments[0]?.bus || null,
                    status: 'scheduled',
                    created: new Date(),
                    rpoints: currentSlot.value.rPointsTimes.map(rp => ({
                        rpointId: rp.rpointId,
                    })),
                });
                await updateDoc(newDocRef, { scheduleId: newDocRef.id });
            }
            closeModal();
            return;
        }
        // Regular
        const { days: selectedDays, time, isEditing, originalTime } = currentSlot.value;
        const type = activeTab.value;

        const rPointsToSave = currentSlot.value.rPointsTimes.map(rp => ({
            rpointId: rp.rpointId,
            expDepTime: rp.expDepTime,
            expArrTime: rp.expArrTime,
            status: 'scheduled',
            ...(currentSlot.value.isEditing
                ? {}
                : {
                    actDepTime: null,
                    actArrTime: null,
                    latenessMinutes: 0
                }
            )
        }));

        if (isEditing) {
            const originalDay = currentSlot.value.days[0].toLowerCase();
            const q = query(scheduleCollection,
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

            if (validAssignments.length === 0) {
                existingDocs.forEach(ref => {
                    deletePromises.push(deleteDoc(ref));
                });
                const newDocRef = await addDoc(scheduleCollection, {
                    day: originalDay,
                    type,
                    routeId,
                    time,
                    driverId: null,
                    busId: null,
                    status: 'scheduled',
                    created: new Date(),
                    rpoints: currentSlot.value.rPointsTimes.map(rp => ({
                        rpointId: rp.rpointId,
                        expDepTime: rp.expDepTime,
                        expArrTime: rp.expArrTime,
                        status: 'scheduled',
                        actDepTime: null,
                        actArrTime: null,
                        latenessMinutes: 0
                    })),
                });
                updatePromises.push(updateDoc(newDocRef, { scheduleId: newDocRef.id }));
            } else {
                for (const assignment of validAssignments) {
                    if (assignment.id) {
                        if (existingDocs.has(assignment.id)) {
                            const docSnap = await getDoc(existingDocs.get(assignment.id));
                            const existingData = docSnap.exists() ? docSnap.data() : {};
                            const existingRPoints = Array.isArray(existingData.rpoints) ? existingData.rpoints : [];

                            const mergedRPoints = currentSlot.value.rPointsTimes.map(rp => {
                                const existing = existingRPoints.find(er => er.rpointId === rp.rpointId) || {};
                                return {
                                    rpointId: rp.rpointId,
                                    expDepTime: rp.expDepTime,
                                    expArrTime: rp.expArrTime,
                                    status: 'scheduled',
                                    actDepTime: existing.actDepTime ?? null,
                                    actArrTime: existing.actArrTime ?? null,
                                    latenessMinutes: existing.latenessMinutes ?? 0
                                };
                            });

                            updatePromises.push(
                                updateDoc(existingDocs.get(assignment.id), {
                                    time: time,
                                    driverId: assignment.driver,
                                    busId: assignment.bus,
                                    rpoints: mergedRPoints,
                                })
                            );
                            existingDocs.delete(assignment.id);
                        }
                    } else {
                        const newDocRef = await addDoc(scheduleCollection, {
                            day: originalDay,
                            type,
                            routeId,
                            time,
                            driverId: assignment.driver,
                            busId: assignment.bus,
                            status: 'scheduled',
                            created: new Date(),
                            rpoints: currentSlot.value.rPointsTimes.map(rp => ({
                                rpointId: rp.rpointId,
                                expDepTime: rp.expDepTime,
                                expArrTime: rp.expArrTime,
                                status: 'scheduled',
                                actDepTime: null,
                                actArrTime: null,
                                latenessMinutes: 0
                            })),
                        });
                        updatePromises.push(updateDoc(newDocRef, { scheduleId: newDocRef.id }));
                    }
                }
                existingDocs.forEach(ref => {
                    deletePromises.push(deleteDoc(ref));
                });
            }
            await Promise.all([...updatePromises, ...deletePromises]);
        } else {
            const promises = [];
            for (const day of selectedDays) {
                const lowerDay = day.toLowerCase();
                if (validAssignments.length === 0) {
                    const newDocRef = await addDoc(scheduleCollection, {
                        day: lowerDay,
                        type,
                        routeId,
                        time,
                        driverId: null,
                        busId: null,
                        status: 'scheduled',
                        created: new Date(),
                        rpoints: rPointsToSave,
                    });
                    promises.push(updateDoc(newDocRef, { scheduleId: newDocRef.id }));
                } else {
                    for (const assignment of validAssignments) {
                        const newDocRef = await addDoc(scheduleCollection, {
                            day: lowerDay,
                            type,
                            routeId,
                            time,
                            driverId: assignment.driver,
                            busId: assignment.bus,
                            status: 'scheduled',
                            created: new Date(),
                            rpoints: rPointsToSave,
                        });
                        promises.push(updateDoc(newDocRef, { scheduleId: newDocRef.id }));
                    }
                }
            }
            await Promise.all(promises);
        }

        const refreshQ = query(scheduleCollection, where('routeId', '==', routeId));
        const refreshSnapshot = await getDocs(refreshQ);
        days.forEach(day => {
            schedule.value[day.toLowerCase()] = { incampus: [], outcampus: [] };
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

        const q = query(scheduleCollection,
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
    if (!currentRoute.value.rpoints || rpoints.value.length === 0) {
        console.warn("Locations not loaded yet.");
        return;
    }
    const lowerDay = initialDay.toLowerCase();
    const routeId = route.params.id;
    const type = activeTab.value;

    if (time) {
        const q = query(
            scheduleCollection,
            where('routeId', '==', routeId),
            where('type', '==', type),
            where('day', '==', lowerDay),
            where('time', '==', time)
        );
        const querySnapshot = await getDocs(q);

        let assignmentsData = [];
        let rPointsTimesData = [];

        if (!querySnapshot.empty) {
            const firstDocData = querySnapshot.docs[0].data();
            assignmentsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                driver: doc.data().driverId,
                bus: doc.data().busId
            }));

            if (firstDocData.rpoints && firstDocData.rpoints.length > 0) {
                rPointsTimesData = firstDocData.rpoints.map(rp => {
                    const rPoint = rpoints.value.find(globalRp => globalRp.id === rp.rpointId);
                    return {
                        rpointId: rp.rpointId,
                        name: rPoint ? rPoint.name : 'Unknown',
                        expDepTime: rp.expDepTime || '',
                        expArrTime: rp.expArrTime || ''
                    };
                });
            } else {
                rPointsTimesData = currentRoute.value.rpoints.map(rpointId => {
                    const rPoint = rpoints.value.find(rp => rp.id === rpointId);
                    return {
                        rpointId,
                        name: rPoint ? rPoint.name : 'Unknown',
                        expDepTime: '',
                        expArrTime: ''
                    };
                });
            }
        } else {
            assignmentsData = [{ driver: '', bus: '' }];
            rPointsTimesData = currentRoute.value.rpoints.map(rpointId => {
                const rPoint = rpoints.value.find(rp => rp.id === rpointId);
                return {
                    rpointId,
                    name: rPoint ? rPoint.name : 'Unknown',
                    expDepTime: '',
                    expArrTime: ''
                };
            });
        }

        if (currentRoute.value.type === 'event') {
            const slotData = eventScheduleRows.value
                .find(row => row.time === time)
                ?.byDay[initialDay.toLowerCase()];

            currentSlot.value = {
                date: slotData?.date || '',
                time: time,
                assignments: [{ driver: '', bus: '' }],
                isEditing: !!slotData,
                rPointsTimes: [],
                scheduleId: slotData?.id || ''
            };
        } else {
            currentSlot.value = {
                days: [initialDay],
                originalDays: [initialDay],
                originalTime: time,
                time: time,
                initialDay: initialDay,
                assignments: assignmentsData,
                isEditing: true,
                rPointsTimes: rPointsTimesData
            };
        }
    } else {
        const routeRPointIds = currentRoute.value.rpoints || [];
        const initializedRPointsTimes = routeRPointIds.map(rpointId => {
            const rPoint = rpoints.value.find(rp => rp.id === rpointId);
            return {
                rpointId,
                name: rPoint ? rPoint.name : 'Unknown',
                expDepTime: '',
                expArrTime: ''
            };
        });

        currentSlot.value = {
            days: [initialDay],
            originalDays: [],
            index: -1,
            time: '',
            assignments: [{ driver: '', bus: '' }],
            initialDay,
            isEditing: false,
            rPointsTimes: initializedRPointsTimes
        };
    }
    currentStep.value = 1;
    showSlotModal.value = true;
};
const openModalForEvent = () => {
    const routeRPointIds = currentRoute.value.rpoints || [];
    const initializedRPointsTimes = routeRPointIds.map(rpointId => {
        const rPoint = rpoints.value.find(rp => rp.id === rpointId);
        return {
            rpointId,
            name: rPoint ? rPoint.name : 'Unknown',
            expDepTime: '',
            expArrTime: ''
        };
    });

    currentSlot.value = {
        date: '',
        time: '',
        assignments: [{ driver: '', bus: '' }],
        isEditing: false,
        rPointsTimes: initializedRPointsTimes,
        days: [],
        originalDays: [],
        index: -1,
        initialDay: null
    };

    currentStep.value = 1;
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
        initialDay: null,
        rPointsTimes: [] 
    };
    slotErrors.value = { time: '', days: '', general: '', rPointsTimes: '' }; 
    currentStep.value = 1;
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
const nextStep = () => {
    if (currentStep.value === 1) {
        if (!validateStep1()) return;
        if (currentRoute.value.type === 'event') {
            currentStep.value = 3;
            return;
        }
    } else if (currentStep.value === 2) {
        if (!validateStep2()) return;
    }
    currentStep.value++;
};
const prevStep = () => {
    if (currentStep.value === 3 && currentRoute.value.type === 'event') {
        currentStep.value = 1;
    } else {
        currentStep.value--;
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
const eventScheduleRows = computed(() => {
    if (currentRoute.value.type !== 'event') return [];
    const allEventSlots = [];
    days.forEach(day => {
        const dayKey = day.toLowerCase();
        const eventSlots = schedule.value[dayKey]?.event || [];
        eventSlots.forEach(slot => {
            allEventSlots.push({
                time: slot.time,
                day: dayKey,
                date: slot.date,
                drivers: slot.driverId ? 1 : 0,
                buses: slot.busId ? 1 : 0,
                id: slot.id 
            });
        });
    });
    // Group by time
    const timeMap = {};
    allEventSlots.forEach(slot => {
        if (!timeMap[slot.time]) {
            timeMap[slot.time] = { time: slot.time, byDay: {} };
        }
        timeMap[slot.time].byDay[slot.day] = {
            date: slot.date,
            drivers: slot.drivers,
            buses: slot.buses,
            id: slot.id
        };
    });
    return Object.values(timeMap).sort((a, b) => a.time.localeCompare(b.time));
});


// Watchers
watch(() => currentSlot.value.time, () => slotErrors.value.time = '');
watch(() => currentSlot.value.days, () => slotErrors.value.days = '', { deep: true });
</script>

<template>
    <div class="container-fluid py-4">
        <div class="card">
            <div class="card-header pb-0">
                <h4>Schedule for {{ currentRoute.name }}</h4>
                <p class="text-sm mb-0">Locations: {{ getRPointNames(currentRoute.rpoints) }}</p>
            </div>

            <!-- Tab Buttons -->
            <div class="card-body">
                <div v-if="currentRoute.type !== 'event'" class="tabs-container justify-content-center mb-4">
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

                <div v-if="currentRoute.type === 'event'" class="d-flex justify-content-end mb-3">
                    <argon-button color="primary" @click="openModalForEvent">
                        <i class="fas fa-plus me-1"></i> Add Schedule
                    </argon-button>
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
                                        <button v-if="currentRoute.type !== 'event'" class="btn btn-link mb-0 p-0"
                                            @click="openModal(day)" title="Add time slot">
                                            <i class="fas fa-plus-circle fs-6"></i>
                                        </button>
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <!-- <tbody>
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
                        </tbody> -->
                        <tbody v-if="currentRoute.type !== 'event'">
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


                        <tbody v-else>
                            <tr v-for="(slots, idx) in eventScheduleRows" :key="idx">
                                <td class="text-sm">{{ slots.time }}</td>
                                <td v-for="day in days" :key="day" class="text-truncate">
                                    <template v-if="slots.byDay[day.toLowerCase()]">
                                        <div>
                                            <div class="small text-muted mb-1">
                                                {{ slots.byDay[day.toLowerCase()].date }}
                                            </div>
                                            <button class="btn btn-light mb-0 px-3 py-2"
                                                @click="openModal(day, slots.time)">
                                                <span class="badge text-dark me-2">
                                                    <i class="fas fa-user me-1"></i>
                                                    {{ slots.byDay[day.toLowerCase()].drivers }}
                                                </span>
                                                <span class="badge text-dark">
                                                    <i class="fas fa-bus me-1"></i>
                                                    {{ slots.byDay[day.toLowerCase()].buses }}
                                                </span>
                                            </button>
                                        </div>
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
                            {{ currentSlot.isEditing ? 'Edit Time Slot' : 'Add Time Slot' }}
                            <span v-if="currentSlot.isEditing" class="text-muted text-sm">
                                ({{ capitalize(currentSlot.initialDay) }} - {{ activeTab === 'incampus' ? 'In Campus' :
                                'Out Campus'
                                }})
                            </span>
                        </h5>
                        <button type="button" class="btn-close" @click="closeModal"></button>
                    </div>
                    <div class="modal-body">
                        <div v-if="currentStep === 1">
                            <div class="mb-3">
                                <label class="form-label">Slot Start Time</label>
                                <argon-input type="time" v-model="currentSlot.time" required />
                                <div v-if="slotErrors.time" class="text-danger text-sm mt-1">{{ slotErrors.time }}</div>
                            </div>

                            <div v-if="currentRoute.type === 'event'" class="mb-3">
                                <label class="form-label">Event Date(s)</label>
                                <!-- <Datepicker v-model="currentSlot.dates" :multi-dates="true" :min-date="new Date()" /> -->

                                <input type="date" class="form-control" v-model="currentSlot.date"
                                    :min="new Date().toISOString().split('T')[0]" />
                                <div v-if="slotErrors.dates" class="text-danger text-sm mt-1">{{ slotErrors.dates }}
                                </div>
                            </div>

                            <div v-if="!currentSlot.isEditing && currentRoute.type !== 'event'" class="mb-3">
                                <div v-if="!currentSlot.isEditing">
                                    <label class="form-label">Day (s)</label>
                                    <div class="d-flex flex-wrap gap-3">
                                        <div v-for="day in days" :key="day"
                                            class="form-check d-flex align-items-center">
                                            <argon-checkbox :id="`day-${day}`" v-model="currentSlot.days"
                                                :value="day" />
                                            <label :for="`day-${day}`" class="form-check-label ms-2 mb-0">
                                                {{ capitalize(day) }}
                                            </label>
                                        </div>
                                    </div>
                                    <div v-if="slotErrors.days" class="text-danger text-sm mt-1">
                                        {{ slotErrors.days }}
                                    </div>
                                </div>
                                <div v-if="slotErrors.general" class="text-danger text-sm mt-1">
                                    {{ slotErrors.general }}
                                </div>
                            </div>
                        </div>

                        <div v-if="currentStep === 2 && currentRoute.type !== 'event'">
                            <div class="mb-3">
                                <label class="form-label">Location Timings</label>
                                <div v-if="currentSlot.rPointsTimes && currentSlot.rPointsTimes.length">
                                    <div v-for="(rPoint, idx) in currentSlot.rPointsTimes" :key="rPoint.rpointId"
                                        class="card mb-2 p-3">
                                        <h6 class="mb-2">{{ rPoint.name }}</h6>
                                        <div class="row gx-2">
                                            <div class="col-md-6 mb-2">
                                                <label :for="`expDepTime-${rPoint.rpointId}`"
                                                    class="form-label text-sm">Expected
                                                    Departure Time</label>
                                                <ArgonInput :id="`expDepTime-${rPoint.rpointId}`"
                                                    v-model="currentSlot.rPointsTimes[idx].expDepTime" type="time"
                                                    placeholder="Departure Time" />
                                            </div>
                                            <div class="col-md-6 mb-2">
                                                <label :for="`expArrTime-${rPoint.rpointId}`"
                                                    class="form-label text-sm">Expected
                                                    Arrival Time</label>
                                                <ArgonInput :id="`expArrTime-${rPoint.rpointId}`"
                                                    v-model="currentSlot.rPointsTimes[idx].expArrTime" type="time"
                                                    placeholder="Arrival Time" />
                                            </div>
                                        </div>
                                    </div>
                                    <div v-if="slotErrors.rPointsTimes" class="text-danger text-sm mt-1">
                                        {{ slotErrors.rPointsTimes }}
                                    </div>
                                </div>
                                <p v-else class="text-muted text-sm">No route points defined for this route.</p>
                            </div>
                        </div>

                        <div v-if="currentStep === 3">
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
                                            :disabled="usedBuses.has(b.id) && b.id !== assignment.bus">{{ b.licensePlate
                                            }}
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
                    </div>
                    <div class="modal-footer">
                        <argon-button color="danger" v-if="currentSlot.isEditing && currentStep === 1"
                            @click="showDeleteModal = true">
                            Delete Slot
                        </argon-button>
                        <argon-button color="secondary" @click="closeModal">Cancel</argon-button>
                        <argon-button color="secondary" @click="prevStep" v-if="currentStep > 1">Back</argon-button>
                        <argon-button color="primary" @click="nextStep" v-if="currentStep < 3">Next</argon-button>
                        <argon-button color="primary" @click="saveSlot" v-if="currentStep === 3">Save</argon-button>
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
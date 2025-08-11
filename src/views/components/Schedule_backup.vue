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
const rpoints = ref([]);
const schedule = ref({});
const drivers = ref([]);
const buses = ref([]);
const activeTab = ref('incampus');
const showSlotModal = ref(false);
const showDeleteModal = ref(false);
const currentSlot = ref({
    days: [], index: -1, time: '', tripEndTime: '', assignments: [{ driver: '', bus: '' }], originalDays: [], rPointsTimes: [], queueOpenValue: 1, queueOpenUnit: 'day', queueCloseValue: 15, queueCloseUnit: 'minute', queueOpenOffset: 0, queueCloseOffset: 0 });
const slotErrors = ref({ time: '', days: '', general: '' });
const currentStep = ref(1);
const unitOptions = ['minute', 'hour', 'day'];


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
                        rpoints: sched.rpoints || [],
                        queueOpenOffset: sched.queueOpenOffset ?? 0,
                        queueCloseOffset: sched.queueCloseOffset ?? 0
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

    let orderedRPointIds = [...rPointIds];
    if (activeTab.value === 'outcampus') {
        orderedRPointIds.reverse();
    }
    return orderedRPointIds.map(rpointId => rPointMap[rpointId] || 'Unknown Location').join(' → ') || '→';
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
const syncExpArrTimes = () => {
    for (let i = 1; i < currentSlot.value.rPointsTimes.length; i++) {
        currentSlot.value.rPointsTimes[i - 1].expArrTime = currentSlot.value.rPointsTimes[i].expDepTime;
    }
};
const convertToMinutes = (value, unit) => {
    switch (unit) {
        case 'minute':
            return value;
        case 'hour':
            return value * 60;
        case 'day':
            return value * 24 * 60;
        default:
            return 0;
    }
};
const convertFromMinutes = (minutes, targetUnit) => {
    if (minutes === null || minutes === undefined) return { value: '', unit: targetUnit }; // Handle null/undefined offsets
    switch (targetUnit) {
        case 'minute':
            return { value: minutes, unit: 'minute' };
        case 'hour':
            if (minutes % 60 === 0) {
                return { value: minutes / 60, unit: 'hour' };
            }
            return { value: minutes, unit: 'minute' };
        case 'day':
            if (minutes % (24 * 60) === 0) {
                return { value: minutes / (24 * 60), unit: 'day' };
            }
            if (minutes % 60 === 0) {
                return { value: minutes / 60, unit: 'hour' };
            }
            return { value: minutes, unit: 'minute' };
        default:
            return { value: minutes, unit: 'minute' };
    }
};


// Validation function
const validateStep1 = () => {
    slotErrors.value = { time: '', days: '', general: '', rPointsTimes: '', queue: '' };
    let valid = true;
    if (currentRoute.value.type === 'event') {
        if (!currentSlot.value.datetime) {
            slotErrors.value.dates = 'Please select a date and time.';
            valid = false;
        } else {
            const { date, time } = parseDateTimeLocal(currentSlot.value.datetime);
            if (!date || !time) {
                slotErrors.value.dates = 'Invalid date or time.';
                valid = false;
            }
        }
    } else {
        if (!currentSlot.value.time || !currentSlot.value.tripEndTime) {
            slotErrors.value.time = 'Departure and end times are required.';
            valid = false;
        } else {
            const departureTime = currentSlot.value.time;
            const endTime = currentSlot.value.tripEndTime;
            if (departureTime >= endTime) {
                slotErrors.value.time = 'Start time must be before end time.';
                valid = false;
            }
        }
        if (currentSlot.value.index === -1) {
            if (currentSlot.value.days.length === 0) {
                slotErrors.value.days = 'Please select at least one day.';
                valid = false;
            } else {
                const conflicts = checkExistingTimes();
                if (conflicts.length > 0) {
                    slotErrors.value.general = `Time already exists on: ${conflicts.join(', ')}`;
                    valid = false;
                }
            }
        }
    }
    return valid;
};
const validateStep2 = () => {
    slotErrors.value = { time: '', days: '', general: '', rPointsTimes: '', queue: '' };
    let valid = true;
    currentSlot.value.rPointsTimes.forEach(rp => {
        if (!rp.expDepTime) {
            slotErrors.value.rPointsTimes = 'Please provide expected departure times for all locations.';
            valid = false;
        }
    });
    return valid;
};
const validateStep3 = () => {
    slotErrors.value = { time: '', days: '', general: '', rPointsTimes: '', queue: '' };
    let valid = true;

    // Validate queue settings only for regular schedules
    if (currentRoute.value.type !== 'event') {
        if (currentSlot.value.queueOpenValue < 0 || currentSlot.value.queueCloseValue < 0) {
            slotErrors.value.queue = 'Queue values cannot be negative.';
            valid = false;
        }
    }
    return valid;
};
const validateStep4 = () => {
    slotErrors.value = { time: '', days: '', general: '', rPointsTimes: '', queue: '' };
    let valid = true;
    if (currentSlot.value.assignments.some(a => (a.driver && !a.bus) || (!a.driver && a.bus))) {
        slotErrors.value.general = 'For each assignment, select both driver and bus or leave both empty.';
        valid = false;
    }

    const allDrivers = currentSlot.value.assignments.map(a => a.driver).filter(Boolean);
    if (new Set(allDrivers).size !== allDrivers.length) {
        slotErrors.value.general = 'Duplicate drivers detected.';
        valid = false;
    }
    return valid;
};


// CRUD operations
const saveSlot = async () => {
    try {
        syncExpArrTimes();

        if (currentRoute.value.type === 'event') {
            if (!validateStep4()) return;
        } else {
            if (!validateStep4()) return;
        }
        // validateStep3();

        const routeId = route.params.id;
        const assignments = currentSlot.value.assignments || [];
        const validAssignments = assignments.filter(a => a.driver && a.bus);

        let queueOpenOffset = 0;
        let queueCloseOffset = 0;
        if (currentRoute.value.type !== 'event') {
            queueOpenOffset = convertToMinutes(currentSlot.value.queueOpenValue, currentSlot.value.queueOpenUnit);
            queueCloseOffset = convertToMinutes(currentSlot.value.queueCloseValue, currentSlot.value.queueCloseUnit);
        }

        // Event
        if (currentRoute.value.type === 'event') {
            const dt = currentSlot.value.datetime;
            if (!dt) {
                slotErrors.value.general = "Please select date and time for the event.";
                return;
            }
            const { date, time } = parseDateTimeLocal(dt);
            if (!date || !time) {
                slotErrors.value.general = "Invalid date or time.";
                return;
            }
            const jsDate = new Date(date);
            const day = jsDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

            const assignments = currentSlot.value.assignments || [];
            const validAssignments = assignments.filter(a => a.driver && a.bus);
            if (currentSlot.value.isEditing && currentSlot.value.scheduleId) {
                const { date: origDate, time: origTime } = parseDateTimeLocal(currentSlot.value.originalDatetime || '');
                const origDay = origDate
                    ? new Date(origDate).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
                    : '';
                const q = query(scheduleCollection,
                    where('routeId', '==', routeId),
                    where('type', '==', 'event'),
                    where('day', '==', origDay),
                    where('time', '==', origTime),
                    where('date', '==', origDate)
                );
                const querySnapshot = await getDocs(q);
                const existingDocs = new Map();
                querySnapshot.forEach(docSnap => {
                    existingDocs.set(docSnap.id, docSnap.ref);
                });

                const updatePromises = [];
                const deletePromises = [];
                for (const assignment of validAssignments) {
                    let foundDocId = null;
                    querySnapshot.forEach(docSnap => {
                        const data = docSnap.data();
                        if (data.driverId === assignment.driver && data.busId === assignment.bus) {
                            foundDocId = docSnap.id;
                        }
                    });

                    if (foundDocId) {
                        updatePromises.push(
                            updateDoc(existingDocs.get(foundDocId), {
                                date,
                                day,
                                time,
                                driverId: assignment.driver,
                                busId: assignment.bus,
                            })
                        );
                        existingDocs.delete(foundDocId);
                    } else {
                        const newDocRef = await addDoc(scheduleCollection, {
                            date,
                            day,
                            type: 'event',
                            routeId,
                            time,
                            driverId: assignment.driver,
                            busId: assignment.bus,
                            status: 'scheduled',
                            created: new Date(),
                            rpoints: currentSlot.value.rPointsTimes.map(rp => ({
                                rpointId: rp.rpointId,
                            })),
                        });
                        updatePromises.push(updateDoc(newDocRef, { scheduleId: newDocRef.id }));
                    }
                }
                existingDocs.forEach(ref => {
                    deletePromises.push(deleteDoc(ref));
                });
                await Promise.all([...updatePromises, ...deletePromises]);
            } else {
                const promises = [];
                for (const assignment of validAssignments) {
                    const newDocRef = await addDoc(scheduleCollection, {
                        date,
                        day,
                        type: 'event',
                        routeId,
                        time,
                        driverId: assignment.driver,
                        busId: assignment.bus,
                        status: 'scheduled',
                        created: new Date(),
                        rpoints: currentSlot.value.rPointsTimes.map(rp => ({
                            rpointId: rp.rpointId,
                        })),
                    });
                    promises.push(updateDoc(newDocRef, { scheduleId: newDocRef.id }));
                }
                await Promise.all(promises);
            }
            closeModal();
            return;
        }
        // Regular
        const { days: selectedDays, time, isEditing, originalTime, tripEndTime } = currentSlot.value;
        const type = activeTab.value;
        let rPointsTimesArr = [...currentSlot.value.rPointsTimes];
        if (rPointsTimesArr.length > 0) {
            rPointsTimesArr[rPointsTimesArr.length - 1].expArrTime = tripEndTime;
        }
        const rPointsToSave = rPointsTimesArr.map(rp => ({
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
                    queueOpenOffset: queueOpenOffset,
                    queueCloseOffset: queueCloseOffset,
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
                                    // status: 'scheduled',
                                    status: existing.status ?? 'scheduled',
                                    actDepTime: existing.actDepTime ?? null,
                                    actArrTime: existing.actArrTime ?? null,
                                    latenessMinutes: existing.latenessMinutes ?? 0
                                };
                            });
                            if (mergedRPoints.length > 0) {
                                mergedRPoints[mergedRPoints.length - 1].expArrTime = tripEndTime;
                            }
                            updatePromises.push(
                                updateDoc(existingDocs.get(assignment.id), {
                                    time: time,
                                    driverId: assignment.driver,
                                    busId: assignment.bus,
                                    rpoints: mergedRPoints,
                                    queueOpenOffset: queueOpenOffset,
                                    queueCloseOffset: queueCloseOffset,
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
                            queueOpenOffset: queueOpenOffset, 
                            queueCloseOffset: queueCloseOffset,
                        });
                        if (currentSlot.value.rPointsTimes.length > 0) {
                            currentSlot.value.rPointsTimes[currentSlot.value.rPointsTimes.length - 1].expArrTime = tripEndTime;
                        }
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
                        queueOpenOffset: queueOpenOffset,
                        queueCloseOffset: queueCloseOffset,
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
                            queueOpenOffset: queueOpenOffset,
                            queueCloseOffset: queueCloseOffset,
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
        slotErrors.value.general = "Failed to save schedule. Try again.";
    }
};
const deleteSlot = async () => {
    try {
        const routeId = route.params.id;
        const type = currentRoute.value.type === 'event' ? 'event' : activeTab.value;
        let day, time, date;

        if (currentRoute.value.type === 'event') {
            const dt = currentSlot.value.datetime;
            if (!dt) {
                slotErrors.value.general = "No date/time selected for event.";
                return;
            }
            ({ date, time } = parseDateTimeLocal(dt));
            if (!date || !time) {
                slotErrors.value.general = "Invalid date or time.";
                return;
            }
            const jsDate = new Date(date);
            day = jsDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        } else {
            day = currentSlot.value.days[0]?.toLowerCase();
            time = currentSlot.value.originalTime || currentSlot.value.time;
        }
        const q = query(
            scheduleCollection,
            where('routeId', '==', routeId),
            where('type', '==', type),
            where('day', '==', day),
            where('time', '==', time),
            ...(currentRoute.value.type === 'event' && date ? [where('date', '==', date)] : [])
        );
        const querySnapshot = await getDocs(q);
        const deletePromises = [];
        querySnapshot.forEach(doc => {
            deletePromises.push(deleteDoc(doc.ref));
        });
        await Promise.all(deletePromises);
        if (schedule.value[day] && schedule.value[day][type]) {
            schedule.value[day][type] = schedule.value[day][type].filter(s => s.time !== time);
        }
        closeModal();
        showDeleteModal.value = false;
    } catch (error) {
        console.error("Delete error:", error);
        slotErrors.value.general = "Failed to delete schedule. Try again.";
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
        let tripEndTimeData = '';
        let queueOpenOffsetData = 0; 
        let queueCloseOffsetData = 0;
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
                if (rPointsTimesData.length > 0) {
                    tripEndTimeData = rPointsTimesData[rPointsTimesData.length - 1].expArrTime || '';
                }
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
            if (currentRoute.value.type !== 'event') {
                queueOpenOffsetData = firstDocData.queueOpenOffset ?? convertToMinutes(1, 'day'); // Default if not found
                queueCloseOffsetData = firstDocData.queueCloseOffset ?? convertToMinutes(15, 'minute'); // Default if not found
            }
        } else {
            assignmentsData = [{ driver: '', bus: '' }];
            let routeRPointIds = currentRoute.value.rpoints || [];
            if (type === 'outcampus') {
                routeRPointIds = [...routeRPointIds].reverse();
            }
            rPointsTimesData = routeRPointIds.map(rpointId => {
                const rPoint = rpoints.value.find(rp => rp.id === rpointId);
                return {
                    rpointId,
                    name: rPoint ? rPoint.name : 'Unknown',
                    expDepTime: '',
                    expArrTime: ''
                };
            });
            queueOpenOffsetData = convertToMinutes(1, 'day');
            queueCloseOffsetData = convertToMinutes(15, 'minute');
        }
        // Event
        if (currentRoute.value.type === 'event') {
            const q = query(
                scheduleCollection,
                where('routeId', '==', routeId),
                where('type', '==', 'event'),
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
            currentSlot.value = {
                datetime: toDateTimeLocal(querySnapshot.docs[0]?.data().date, querySnapshot.docs[0]?.data().time) || '',
                originalDatetime: toDateTimeLocal(querySnapshot.docs[0]?.data().date, querySnapshot.docs[0]?.data().time) || '',
                assignments: assignmentsData,
                isEditing: !querySnapshot.empty,
                rPointsTimes: rPointsTimesData,
                scheduleId: querySnapshot.docs[0]?.id || ''
            };
        } else {
            const { value: openValue, unit: openUnit } = convertFromMinutes(queueOpenOffsetData, 'day');
            const { value: closeValue, unit: closeUnit } = convertFromMinutes(queueCloseOffsetData, 'minute');

            currentSlot.value = {
                days: [initialDay],
                originalDays: [initialDay],
                originalTime: time,
                time: time,
                initialDay: initialDay,
                assignments: assignmentsData,
                isEditing: !!time,
                rPointsTimes: rPointsTimesData,
                tripEndTime: tripEndTimeData,
                queueOpenValue: openValue,
                queueOpenUnit: openUnit,
                queueCloseValue: closeValue,
                queueCloseUnit: closeUnit,
                queueOpenOffset: queueOpenOffsetData,
                queueCloseOffset: queueCloseOffsetData,
            };
        }
    } else {
        let routeRPointIds = currentRoute.value.rpoints || [];
        if (type === 'outcampus') {
            routeRPointIds = [...routeRPointIds].reverse();
        }
        let initializedRPointsTimes = routeRPointIds.map(rpointId => {
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
            tripEndTime: '',
            assignments: [{ driver: '', bus: '' }],
            initialDay,
            isEditing: false,
            rPointsTimes: initializedRPointsTimes,
            queueOpenValue: 1,
            queueOpenUnit: 'day',
            queueCloseValue: 15,
            queueCloseUnit: 'minute',
            queueOpenOffset: convertToMinutes(1, 'day'),
            queueCloseOffset: convertToMinutes(15, 'minute'),
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
        datetime: '',
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
        tripEndTime: '',
        assignments: [{ driver: '', bus: '' }],
        initialDay: null,
        rPointsTimes: [],
        queueOpenValue: 1,
        queueOpenUnit: 'day',
        queueCloseValue: 15,
        queueCloseUnit: 'minute',
        queueOpenOffset: 0,
        queueCloseOffset: 0,
    };
    slotErrors.value = { time: '', days: '', general: '', rPointsTimes: '', queue: '' }; 
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
            currentStep.value = 4;
            return;
        }
    } else if (currentStep.value === 2) {
        if (!validateStep2()) return;
    } else if (currentStep.value === 3 && currentRoute.value.type !== 'event') {
        if (!validateStep3()) return;
    }
    currentStep.value++;
};
const prevStep = () => {
    if (currentStep.value === 4 && currentRoute.value.type === 'event') {
        currentStep.value = 1;
    } else {
        currentStep.value--;
    }
};
const onExpDepTimeInput = (idx) => {
    if (idx > 0) {
        currentSlot.value.rPointsTimes[idx - 1].expArrTime = currentSlot.value.rPointsTimes[idx].expDepTime;
    }
};


// Computed properties
const usedDrivers = computed(() => {
    return new Set(currentSlot.value.assignments.map(a => a.driver).filter(Boolean));
});
const availableDrivers = (currentAssignment) => {
    return drivers.value.filter(driver =>
        !usedDrivers.value.has(driver.id) || driver.id === currentAssignment.driver
    );
};
const availableBuses = () => {
    return buses.value;
};
const eventScheduleRows = computed(() => {
    if (currentRoute.value.type !== 'event') return [];
    const allEventSlots = [];
    days.forEach(day => {
        const dayKey = day.toLowerCase();
        const eventSlots = schedule.value[dayKey]?.event || [];
        const grouped = {};
        eventSlots.forEach(slot => {
            const key = `${slot.time}|${slot.date}`;
            if (!grouped[key]) {
                grouped[key] = {
                    time: slot.time,
                    day: dayKey,
                    date: slot.date,
                    drivers: 0,
                    buses: 0,
                    id: slot.id,
                    count: 0
                };
            }
            grouped[key].drivers += slot.driverId ? 1 : 0;
            grouped[key].buses += slot.busId ? 1 : 0;
            grouped[key].count += 1;
        });
        Object.values(grouped).forEach(slot => {
            allEventSlots.push(slot);
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
function parseDateTimeLocal(dtStr) {
    // dtStr: "2025-06-19T22:57"
    if (!dtStr) return { date: '', time: '' };
    const [date, time] = dtStr.split('T');
    return { date, time };
}
function toDateTimeLocal(date, time) {
    // date: "2025-06-19", time: "22:57"
    if (!date || !time) return '';
    return `${date}T${time}`;
}


// Watchers
watch(() => currentSlot.value.time, () => slotErrors.value.time = '');
watch(() => currentSlot.value.days, () => slotErrors.value.days = '', { deep: true });
watch(() => currentSlot.value.queueOpenValue, () => slotErrors.value.queue = '');
watch(() => currentSlot.value.queueCloseValue, () => slotErrors.value.queue = '');
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
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            {{ currentSlot.isEditing ? 'Edit Time Slot' : 'Add Time Slot' }}
                            <span v-if="currentSlot.isEditing" class="text-muted text-sm">
                                <template v-if="currentRoute.type === 'event'">
                                    (Event)
                                </template>
                                <template v-else>
                                    ({{ capitalize(currentSlot.initialDay) }} - {{ activeTab === 'incampus' ? 'In Campus' : 'Out Campus' }})
                                </template>
                            </span>
                        </h5>
                        <button type="button" class="btn-close" @click="closeModal"></button>
                    </div>
                    <div class="modal-body">
                        <div v-if="currentStep === 1">
                            <div v-if="currentRoute.type === 'event'" class="mb-3">
                                <label class="form-label">Event Date(s)</label>
                                <input type="datetime-local" class="form-control" v-model="currentSlot.datetime"
                                    :min="new Date().toISOString().slice(0, 16)" />
                                <div v-if="slotErrors.dates" class="text-danger text-sm mt-1">{{ slotErrors.dates }}
                                </div>
                            </div>

                            <div v-else>
                                <div v-if="!currentSlot.isEditing" class="mb-3">
                                    <label class="form-label">Day (s)</label>
                                    <div class="row">
                                        <div v-for="day in days" :key="day"
                                            class="form-check d-flex align-items-center mb-2">
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
                                    <div v-if="slotErrors.general" class="text-danger text-sm mt-1">
                                        {{ slotErrors.general }}
                                    </div>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label">Trip Departure Time</label>
                                    <argon-input type="time" v-model="currentSlot.time" required />

                                    <label class="form-label">Trip End Time</label>
                                    <argon-input type="time" v-model="currentSlot.tripEndTime" required />
                                    <div v-if="slotErrors.time" class="text-danger text-sm mt-1">{{ slotErrors.time }}
                                    </div>
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
                                                    placeholder="Departure Time" @input="onExpDepTimeInput(idx)" />
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

                        <div v-if="currentStep === 3 && currentRoute.type !== 'event'">
                            <div class="mb-3">
                                <label class="form-label">Queue Open</label>
                                <div class="d-flex align-items-center gap-2">
                                    <div class="col-3">
                                        <argon-input type="number" v-model.number="currentSlot.queueOpenValue" min="0"
                                            class="mb-0" />
                                    </div>
                                    <div class="col-4">
                                        <select class="form-select" v-model="currentSlot.queueOpenUnit">
                                            <option v-for="unit in unitOptions" :key="unit" :value="unit">{{
                                                capitalize(unit) }} (s)</option>
                                        </select>
                                    </div>
                                    <div class="col-5">
                                        <span class="text-muted text-sm">before trip departure</span>
                                    </div>
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Queue Close</label>
                                <div class="d-flex align-items-center gap-2">
                                    <div class="col-3">
                                        <argon-input type="number" v-model.number="currentSlot.queueCloseValue" min="0"
                                            class="mb-0" />
                                    </div>
                                    <div class="col-4">
                                        <select class="form-select" v-model="currentSlot.queueCloseUnit">
                                            <option v-for="unit in unitOptions" :key="unit" :value="unit">{{
                                                capitalize(unit) }} (s)</option>
                                        </select>
                                    </div>
                                    <div class="col-5">
                                        <span class="text-muted text-sm">before trip departure</span>
                                    </div>
                                </div>
                            </div>
                            <div v-if="slotErrors.queue" class="text-danger text-sm mt-1">
                                {{ slotErrors.queue }}
                            </div>
                        </div>

                        <div v-if="currentStep === 4 || (currentStep === 3 && currentRoute.type === 'event')">
                            <div class="mb-3">
                                <label class="form-label">Assignments</label>
                                <div v-for="(assignment, idx) in currentSlot.assignments" :key="idx"
                                    class="d-flex mb-3 align-items-center gap-2">

                                    <select class="form-select" v-model="assignment.driver"
                                        @change="updateAssignment(idx, 'driver', $event.target.value)" :class="{
                                            'is-invalid': (assignment.driver && !assignment.bus) ||
                                                (!assignment.driver && assignment.bus)
                                        }">
                                        <option value="">Select Driver</option>
                                        <option v-for="d in availableDrivers(assignment)" :key="d.id" :value="d.id"
                                            :disabled="usedDrivers.has(d.id) && d.id !== assignment.driver">{{
                                            d.name }}
                                        </option>
                                    </select>

                                    <select class="form-select" v-model="assignment.bus"
                                        @change="updateAssignment(idx, 'bus', $event.target.value)" :class="{
                                            'is-invalid': (assignment.bus && !assignment.driver) ||
                                                (!assignment.bus && assignment.driver)
                                        }">
                                        <option value="">Select Bus</option>

                                        <option v-for="b in availableBuses()" :key="b.id" :value="b.id">{{
                                            b.plateNumber
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
                            <div v-if="slotErrors.general" class="text-danger text-sm mt-3">
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
                        <argon-button color="primary" @click="nextStep"
                            v-if="(currentRoute.type === 'event' && currentStep < 4) || (currentRoute.type !== 'event' && currentStep < 4)">Next</argon-button>
                        <argon-button color="primary" @click="saveSlot"
                            v-if="(currentRoute.type === 'event' && currentStep === 4) || (currentRoute.type !== 'event' && currentStep === 4)">Save</argon-button>
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
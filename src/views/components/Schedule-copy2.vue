<script setup>
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { scheduleCollection, routeCollection, rPointCollection, busDriverPairingCollection, driverCollection, busCollection } from '@/firebase';
import { query, where, doc, getDoc, getDocs, onSnapshot, addDoc, Timestamp, updateDoc, deleteDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { sendPushNotification } from "@/utils/firebaseNotifications";
import BusDriverPairingTable from '@/views/components/BusDriverPairingTable.vue';
import ArgonButton from "@/components/ArgonButton.vue";
import ArgonInput from "@/components/ArgonInput.vue";


const route = useRoute();
// Constants
const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
// Reactive state
// Date/Time related
const currentWeekStart = ref(new Date());
const datePicker = ref(null);
const selectedDate = ref(new Date().toISOString().split('T')[0]);
// UI state
const activeTab = ref('incampus');
const showCreateScheduleModal = ref(false);
const showUpdateScheduleModal = ref(false);
const showPairingModal = ref(false);
const showDeleteConfirmModal = ref(false);
const showCancelledScheduleModal = ref(false);
const currentStep = ref(1);
const currentSelectedDay = ref('');
const currentSelectedFullDate = ref('');
// Data
const currentRoute = ref({});
const rpoints = ref([]);
const schedules = ref({});
const drivers = ref([]);
const buses = ref([]);
const busDriverPairings = ref([]);
const selectedScheduleGroup = ref([]);
const selectedScheduleForUpdate = ref(null);
const fullyCancelledSchedule = ref(null);
const modalAssignments = ref([]);
const newPairBusId = ref('');
const newPairDriverId = ref('');
const createScheduleForm = ref({
    days: [],
    time: '',
    tripEndTime: '',
    type: '',
    routeId: '',
    rpoints: [],
    queueEnabled: false,
    queueOpenDays: 1,
    queueOpenHours: 0,
    queueOpenMinutes: 0,
    queueCloseDays: 0,
    queueCloseHours: 0,
    queueCloseMinutes: 15,
    isRepeating: false,
    repeatUntilDate: null,
    eventScheduledDateTime: null,
    busDriverPairId: null,
});
// Action state
const assignmentToDelete = ref(null);
const assignmentIndexToDelete = ref(null);
const scheduleToActOn = ref(null);
const actionType = ref(null);
const cancelReason = ref("");
// Loading/Error state
const isLoading = ref(false);
const message = ref('');
const errors = ref({
    days: '',
    repeatUntilDate: '',
    time: '',
    eventScheduledDateTime: '',
    rpoints: '',
    queueOpenMinutes: '',
    queueCloseMinutes: '',
    assignments: '',
    general: '',
});
const unsubscribeSchedules = ref(null);


// Lifecycle hooks
onMounted(async () => {
    const routeId = route.params.id;
    if (!routeId) {
        console.error("Route ID is missing from URL parameters.");
        errors.value.general = "Error: Route information is not fully loaded. Please wait a moment and try again.";
        return;
    }
    if (!route.query.openModal) {
        currentWeekStart.value = getStartOfWeek();
        selectedDate.value = getTodayLocalDate();
    }

    const routeRef = doc(routeCollection, routeId);
    const routeSnap = await getDoc(routeRef);
    if (routeSnap.exists()) {
        currentRoute.value = { id: routeSnap.id, ...routeSnap.data() };
        if (currentRoute.value.type === 'event') {
            activeTab.value = 'event';
        }
        createScheduleForm.value.routeId = routeId;
        const rpointsSnapshot = await getDocs(rPointCollection);
        rpoints.value = rpointsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        createScheduleForm.value.rpoints = currentRoute.value.rpoints.map(rPointId => {
            const rPoint = rpoints.value.find(rp => rp.id === rPointId);
            return {
                rpointId: rPointId,
                name: rPoint ? rPoint.name : 'Unknown Location',
                expDepTime: '',
                expArrTime: '',
            };
        });
    } else {
        console.error("Route not found with ID:", routeId);
        errors.value.general = "Error: Could not find the selected route. Please make sure the route is valid and try again.";
        return;
    }
    if (!route.query.openModal) {
        await fetchDriversAndBuses();
        await fetchPairings();
        setupSchedulesListener();
    }
});
onUnmounted(() => {
    if (unsubscribeSchedules.value) {
        unsubscribeSchedules.value();
    }
});


// Computed properties
const weekDates = computed(() => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(currentWeekStart.value);
        date.setDate(date.getDate() + i);
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');

        dates.push({
            day: days[i],
            formattedDate: date.toLocaleDateString("en-GB", {
                day: "numeric"
            }),
            fullDate: `${year}-${month}-${day}`,
            rawDate: date
        });
    }
    return dates;
});
const maxRepeatUntilDate = computed(() => {
    if (!currentSelectedFullDate.value) {
        const today = new Date();
        const maxDate = new Date(today);
        maxDate.setMonth(maxDate.getMonth() + 3);
        return maxDate.toISOString().split('T')[0];
    }
    const startDate = new Date(currentSelectedFullDate.value);
    const maxDate = new Date(startDate);
    maxDate.setMonth(maxDate.getMonth() + 3);
    return maxDate.toISOString().split('T')[0];
});
const allUniqueTimes = computed(() => {
    const times = new Set();
    Object.values(schedules.value).forEach(daySchedule => {
        const typeSchedule = daySchedule[activeTab.value];
        if (typeSchedule) {
            Object.keys(typeSchedule).forEach(time => {
                times.add(time);
            });
        }
    });
    const sortedTimes = Array.from(times).sort((a, b) => {
        const [aHour, aMinute] = a.split(':').map(Number);
        const [bHour, bMinute] = b.split(':').map(Number);
        if (aHour !== bHour) {
            return aHour - bHour;
        }
        return aMinute - bMinute;
    });
    return sortedTimes;
});
const formattedMonthYear = computed(() => {
    const date = new Date(selectedDate.value);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
});
const activebusDriverPairs = computed(() => {
    return busDriverPairings.value.filter(pair => pair.isActive);
});
const filteredSchedules = computed(() => {
    return selectedScheduleGroup.value.filter(schedule => schedule.busDriverPairId);
});


// Helper functions
const formatDateTime = (timestamp) => {
    if (!timestamp) return '';
    return format(timestamp.toDate(), 'MMM d, yyyy h:mm a');
};
const formatQueueTime = (totalMinutes) => {
    const { days, hours, minutes } = convertFromMinutes(totalMinutes);
    const parts = [];
    if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
    if (parts.length === 0) return '0 minutes';
    return parts.join(' ');
};
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
const capitalize = (str) => {
    if (!str || typeof str !== 'string') return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
};
const convertToMinutes = (days, hours, minutes) => {
    const d = Number(days) || 0;
    const h = Number(hours) || 0;
    const m = Number(minutes) || 0;
    return (d * 24 * 60) + (h * 60) + m;
};
const convertFromMinutes = (totalMinutes) => {
    if (totalMinutes === null || totalMinutes === undefined || isNaN(totalMinutes)) {
        return { days: 0, hours: 0, minutes: 0 };
    }
    let remainingMinutes = totalMinutes;

    const days = Math.floor(remainingMinutes / (24 * 60));
    remainingMinutes %= (24 * 60);

    const hours = Math.floor(remainingMinutes / 60);
    remainingMinutes %= 60;

    const minutes = remainingMinutes;

    return { days, hours, minutes };
};
const clearErrors = () => {
    errors.value = {
        days: '',
        repeatUntilDate: '',
        time: '',
        eventScheduledDateTime: '',
        rpoints: '',
        queueOpenMinutes: '',
        queueCloseMinutes: '',
        assignments: '',
        general: '',
    };
};
const getScheduleStatusColor = (status) => {
    switch (status) {
        case 'scheduled': return '#007bff';
        case 'completed': return '#28a745';
        case 'cancelled': return '#6c757d';
        case 'in_progress': return '#fd7e14';
        case 'cancelled_fully': return '#f1f1f1';
        default: return '#dc3545';
    }
};
const getScheduleStatusClass = (status) => {
    switch (status) {
        case 'scheduled':
            return 'bg-primary';
        case 'completed':
            return 'bg-success';
        case 'cancelled':
            return 'bg-secondary';
        case 'in_progress':
            return 'badge-in-progress';
        case 'cancelled_fully':
            return 'cell-fully-cancelled';
        default:
            return 'bg-danger';
    }
};
const getScheduleStatusText = (status) => {
    switch (status) {
        case 'scheduled':
            return 'Scheduled';
        case 'completed':
            return 'Completed';
        case 'cancelled':
            return 'Cancelled';
        case 'in_progress':
            return 'In Progress';
        case 'cancelled_fully':
            return 'Cancelled Fully';
        default:
            return 'Unknown';
    }
};
const getCounts = (schedules) => {
    if (!schedules || schedules.length === 0) {
        return { busDriverPairs: 0 };
    }
    const uniquebusDriverPairs = new Set();
    schedules.forEach(schedule => {
        if (schedule.busDriverPairId) {
            uniquebusDriverPairs.add(schedule.busDriverPairId);
        }
    });
    return { busDriverPairs: uniquebusDriverPairs.size };
};
const getPairDriverId = (pairId) => {
    const pair = busDriverPairings.value.find(p => p.id === pairId);
    return pair ? pair.driverId : null;
};
const getPairBusId = (pairId) => {
    const pair = busDriverPairings.value.find(p => p.id === pairId);
    return pair ? pair.busId : null;
};
const getDriverDisplay = (driverId) => {
    const driver = drivers.value.find(d => d.id === driverId);
    if (!driver) return 'Unknown Driver';
    const isActivePaired = activebusDriverPairs.value.some(pair => pair.driverId === driverId);
    return isActivePaired ? `${driver.name}` : `${driver.name} (Not Active Pairing)`;
};
const getBusDisplay = (busId) => {
    const bus = buses.value.find(b => b.id === busId);
    if (!bus) return 'Unknown Bus';
    const isActivePaired = activebusDriverPairs.value.some(pair => pair.busId === busId);
    return isActivePaired ? bus.plateNumber : `${bus.plateNumber} (Not Active Pairing)`;
};
const getTotalQueuedStudents = (schedules) => {
    let totalStudents = 0;
    if (!schedules || schedules.length === 0) {
        return 0;
    }
    schedules.forEach(schedule => {
        if (schedule.rpoints && Array.isArray(schedule.rpoints)) {
            schedule.rpoints.forEach(rpoint => {
                if (rpoint.queuedStudents && Array.isArray(rpoint.queuedStudents)) {
                    totalStudents += rpoint.queuedStudents.length;
                }
            });
        }
    });
    return totalStudents;
};
const validateTimeUnit = (value, name, min, max) => {
    const numValue = Number(value) || 0;
    if ((value !== null && value !== '') && (isNaN(numValue) || !Number.isInteger(numValue) || numValue < min || (max !== undefined && numValue > max))) {
        return `The value you entered for ${name} must be a whole number between ${min} and ${max}${min === 0 && max === 0 ? '' : '.'}`;
    }
    return '';
};
const isAssignmentLocked = (assignment) => {
    if (!assignment || !assignment.status) return false;
    return ['in_progress', 'completed'].includes(assignment.status);
};
const isFullyCancelled = (schedules) => {
    return schedules?.find(s =>
        s.status === 'cancelled_fully' && s.cancelReason?.trim()
    );
};
const getSchedulesForCell = (fullDate, tab, time) => {
    const schedulesForDate = schedules.value[fullDate];
    if (!schedulesForDate) {
        return [];
    }
    const schedulesForType = schedulesForDate[tab];
    if (!schedulesForType) {
        return [];
    }
    const schedulesForTimeSlot = schedulesForType[time];
    if (!schedulesForTimeSlot) {
        return [];
    }
    return Array.isArray(schedulesForTimeSlot) ? schedulesForTimeSlot : [];
};
const getGroupedStatus = (schedules) => {
    if (!schedules || schedules.length === 0) {
        return 'scheduled';
    }
    if (isFullyCancelled(schedules)) {
        return 'cancelled_fully';
    }
    let hasInProgress = false;
    let hasScheduled = false;
    let hasCompleted = false;
    let allCancelled = true;
    for (const schedule of schedules) {
        if (schedule.status === 'in_progress') {
            hasInProgress = true;
            break;
        }
        if (schedule.status === 'completed') {
            hasCompleted = true;
        }
        if (schedule.status === 'scheduled') {
            hasScheduled = true;
        }
        if (schedule.status !== 'cancelled') {
            allCancelled = false;
        }
    }
    if (hasInProgress) {
        return 'in_progress';
    } else if (hasCompleted) {
        return 'completed';
    } else if (allCancelled) {
        return 'cancelled';
    } else if (hasScheduled) {
        return 'scheduled';
    }
    return 'unknown';
};


// Date navigation functions
const getStartOfWeek = () => {
    const date = new Date();
    const dayOfWeek = (date.getDay() + 6) % 7;
    const monday = new Date(date);
    monday.setDate(date.getDate() - dayOfWeek);
    monday.setHours(0, 0, 0, 0);
    return monday;
};
const getTodayLocalDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
const openDatePicker = () => {
    if (datePicker.value) {
        datePicker.value.showPicker();
    }
};
const navigateToToday = () => {
    currentWeekStart.value = getStartOfWeek();
    selectedDate.value = getTodayLocalDate();
    setupSchedulesListener();
};
const navigateToPreviousWeek = () => {
    const d = new Date(selectedDate.value + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    selectedDate.value = d.toISOString().split('T')[0];
    getCurrentWeekDates();
};
const navigateToNextWeek = () => {
    const d = new Date(selectedDate.value + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    selectedDate.value = d.toISOString().split('T')[0];
    getCurrentWeekDates();
};
const handleDatePickerChange = (event) => {
    const selected = new Date(event.target.value);
    const dayOfWeek = (selected.getDay() + 6) % 7;
    currentWeekStart.value = new Date(selected.setDate(selected.getDate() - dayOfWeek));
    currentWeekStart.value.setHours(0, 0, 0, 0);
    selectedDate.value = event.target.value;
    setupSchedulesListener();
};
const getCurrentWeekDates = () => {
    const date = new Date(selectedDate.value + 'T00:00:00');
    const dayOfWeek = (date.getDay() + 6) % 7;
    const monday = new Date(date);
    monday.setDate(date.getDate() - dayOfWeek);
    monday.setHours(0, 0, 0, 0);
    currentWeekStart.value = monday;
    setupSchedulesListener();
};


// Validation functions
const validateStep1 = () => {
    clearErrors();
    let isValid = true;

    if (createScheduleForm.value.isRepeating) {
        if (createScheduleForm.value.days.length === 0) {
            errors.value.days = "Please select at least one day of the week for a repeating schedule.";
            isValid = false;
        }
        if (!createScheduleForm.value.repeatUntilDate) {
            errors.value.repeatUntilDate = "Please select a final date for this repeating schedule.";
            isValid = false;
        } else {
            const fromDate = new Date(currentSelectedFullDate.value);
            fromDate.setHours(0, 0, 0, 0);

            const repeatEnd = new Date(createScheduleForm.value.repeatUntilDate);
            repeatEnd.setHours(0, 0, 0, 0);
            if (repeatEnd < fromDate) {
                errors.value.repeatUntilDate = "The end date for the repeating schedule must be after the start date.";
                isValid = false;
            }
            const threeMonthsLater = new Date(fromDate);
            threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
            if (repeatEnd > threeMonthsLater) {
                errors.value.repeatUntilDate = (errors.value.repeatUntilDate ? errors.value.repeatUntilDate + '\n' : '') + "The end date cannot be more than 3 months from the start date.";
                isValid = false;
            }
        }
    }
    return isValid;
};
const validateStep2 = () => {
    clearErrors();

    if (createScheduleForm.value.type === 'event') {
        return validateEventScheduleForm();
    }
    const departureTime = createScheduleForm.value.time;
    const endTime = createScheduleForm.value.tripEndTime;
    const rpoints = createScheduleForm.value.rpoints;
    if (!departureTime || !endTime) {
        errors.value.time = 'Please enter both a departure time and an end time for the trip.';
        return false;
    }

    const [depHour, depMinute] = departureTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    const totalTripDepMinutes = depHour * 60 + depMinute;
    const totalTripEndMinutes = endHour * 60 + endMinute;
    if (totalTripDepMinutes >= totalTripEndMinutes) {
        errors.value.time = 'The trip departure time must be earlier than the trip end time.';
        return false;
    }
    if (rpoints.length === 0) {
        errors.value.rpoints = 'This route has no defined stops.';
        return false;
    }
    for (let i = 0; i < rpoints.length; i++) {
        if (!rpoints[i].expDepTime) {
            errors.value.rpoints = `Please enter a departure time for all stops. Missing for ${rpoints[i].name}.`;
            return false;
        }
        const [currentRPointDepHour, currentRPointDepMinute] = rpoints[i].expDepTime.split(':').map(Number);
        const totalCurrentRPointDepMinutes = currentRPointDepHour * 60 + currentRPointDepMinute;
        if (i === 0 && totalTripDepMinutes > totalCurrentRPointDepMinutes) {
            errors.value.rpoints = `The first stop's departure time (${rpoints[i].expDepTime}) cannot be earlier than the trip departure time (${departureTime}).`;
            return false;
        }

        if (i < rpoints.length - 1) {
            if (!rpoints[i + 1] || !rpoints[i + 1].expDepTime) {
                errors.value.rpoints = `Please enter a departure time for all stops. Missing for ${rpoints[i + 1].name}.`;
                return false;
            }
            const [nextRPointDepHour, nextRPointDepMinute] = rpoints[i + 1].expDepTime.split(':').map(Number);
            const totalNextRPointDepMinutes = nextRPointDepHour * 60 + nextRPointDepMinute;
            if (totalCurrentRPointDepMinutes >= totalNextRPointDepMinutes) {
                errors.value.rpoints = `The departure time for ${rpoints[i].name} (${rpoints[i].expDepTime}) must be earlier than the next stop's departure time (${rpoints[i + 1].expDepTime}).`;
                return false;
            }
            rpoints[i].expArrTime = rpoints[i + 1].expDepTime;
        } else {
            rpoints[i].expArrTime = createScheduleForm.value.tripEndTime;
            if (totalCurrentRPointDepMinutes >= totalTripEndMinutes) {
                errors.value.rpoints = `The departure time for ${rpoints[i].name} (${rpoints[i].expDepTime}) must be earlier than the trip end time (${endTime}).`;
                return false;
            }
        }
    }
    return true;
};
const validateStep3 = () => {
    clearErrors();
    let isValid = true;
    const openDays = createScheduleForm.value.queueOpenDays;
    const openHours = createScheduleForm.value.queueOpenHours;
    const openMinutes = createScheduleForm.value.queueOpenMinutes;
    const totalOpenMinutes = (Number(openDays) || 0) * 24 * 60 +
        (Number(openHours) || 0) * 60 +
        (Number(openMinutes) || 0);
    let openErrors = [];
    let dayError = validateTimeUnit(openDays, 'Queue Open Days', 0, Infinity);
    if (dayError) openErrors.push(dayError);
    let hourError = validateTimeUnit(openHours, 'Queue Open Hours', 0, 23);
    if (hourError) openErrors.push(hourError);
    let minuteError = validateTimeUnit(openMinutes, 'Queue Open Minutes', 0, 59);
    if (minuteError) openErrors.push(minuteError);
    if (totalOpenMinutes === 0) {
        openErrors.push('Please specify a time for when the queue opens (days, hours, or minutes). It cannot be zero.');
    }
    if (openErrors.length > 0) {
        errors.value.queueOpenMinutes = openErrors.join('\n');
        isValid = false;
    }

    const closeDays = createScheduleForm.value.queueCloseDays;
    const closeHours = createScheduleForm.value.queueCloseHours;
    const closeMinutes = createScheduleForm.value.queueCloseMinutes;
    const totalCloseMinutes = (Number(closeDays) || 0) * 24 * 60 +
        (Number(closeHours) || 0) * 60 +
        (Number(closeMinutes) || 0);
    let closeErrors = [];
    let closeDayError = validateTimeUnit(closeDays, 'Queue Close Days', 0, Infinity);
    if (closeDayError) closeErrors.push(closeDayError);
    let closeHourError = validateTimeUnit(closeHours, 'Queue Close Hours', 0, 23);
    if (closeHourError) closeErrors.push(closeHourError);
    let closeMinuteError = validateTimeUnit(closeMinutes, 'Queue Close Minutes', 0, 59);
    if (closeMinuteError) closeErrors.push(closeMinuteError);
    if (totalCloseMinutes === 0) {
        closeErrors.push('Please specify a time for when the queue closes (days, hours, or minutes). It cannot be zero.');
    }
    if (closeErrors.length > 0) {
        errors.value.queueCloseMinutes = closeErrors.join('\n');
        isValid = false;
    }
    return isValid;
};
const validateEventScheduleForm = () => {
    clearErrors();

    if (!createScheduleForm.value.eventScheduledDateTime) {
        errors.value.eventScheduledDateTime = 'Please select a date and time for this event.';
        return false;
    }
    return true;
};
const validateAssignments = () => {
    clearErrors();
    let isValid = true;
    const errorMessages = [];
    
    for (const assignment of modalAssignments.value) {
        if (assignment.driverId && assignment.busId) {
            const foundPair = busDriverPairings.value.find(
                pair => pair.driverId === assignment.driverId &&
                    pair.busId === assignment.busId &&
                    pair.isActive
            );
            if (!foundPair) {
                errors.value.assignments = "The driver and bus you selected are not an active team. Please choose an existing team or create a new one.";
                isValid = false;
            }
            else {
                assignment.pairId = foundPair.id;
            }
        } else if (assignment.driverId || assignment.busId) {
            if (assignment.driverId && !assignment.busId) {
                const driverHasActivePairs = busDriverPairings.value.some(
                    pair => pair.driverId === assignment.driverId && pair.isActive
                );

                if (!driverHasActivePairs) {
                    errorMessages.push(`The selected driver "${getDriverDisplay(assignment.driverId)}" is not actively paired with any bus. Please create a pairing first.`);
                    isValid = false;
                }
            }
            if (assignment.busId && !assignment.driverId) {
                const busHasActivePairs = busDriverPairings.value.some(
                    pair => pair.busId === assignment.busId && pair.isActive
                );

                if (!busHasActivePairs) {
                    errorMessages.push(`The selected bus "${getBusDisplay(assignment.busId)}" is not actively paired with any driver. Please create a pairing first.`);
                    isValid = false;
                }
            }
        }
    }
    if (errorMessages.length > 0) {
        errors.value.assignments = errorMessages.join('\n');
    }
    return isValid;
};


// CRUD operations
const fetchDriversAndBuses = async () => {
    const [driversSnap, busesSnap] = await Promise.all([
        getDocs(driverCollection),
        getDocs(busCollection)
    ]);
    drivers.value = driversSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    buses.value = busesSnap.docs.map(b => ({ id: b.id, ...b.data() }));
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
const setupSchedulesListener = () => {
    if (unsubscribeSchedules.value) {
        unsubscribeSchedules.value();
    }
    const routeId = route.params.id;
    if (!routeId) return;

    const weekStart = new Date(currentWeekStart.value);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const startTimestamp = Timestamp.fromDate(weekStart);
    const endTimestamp = Timestamp.fromDate(weekEnd);
    const q = query(
        scheduleCollection,
        where('routeId', '==', routeId),
        where('scheduledDatetime', '>=', startTimestamp),
        where('scheduledDatetime', '<', endTimestamp),
        where('type', 'in', ['incampus', 'outcampus', 'event'])
    );

    unsubscribeSchedules.value = onSnapshot(q, (querySnapshot) => {
        const newSchedule = {};
        weekDates.value.forEach(entry => {
            newSchedule[entry.fullDate] = { incampus: {}, outcampus: {}, event: {} };
        });
        querySnapshot.forEach((doc) => {
            const schedItem = doc.data();
            if (!schedItem.scheduledDatetime?.toDate) return;
            const scheduledDate = schedItem.scheduledDatetime.toDate();
            if (scheduledDate < weekStart || scheduledDate >= weekEnd) return;
            const d = schedItem.scheduledDatetime.toDate();
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const scheduledFullDate = `${yyyy}-${mm}-${dd}`;
            const type = schedItem.type.toLowerCase();
            const timeKey = scheduledDate.toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit', hour12: false
            });
            if (!newSchedule[scheduledFullDate]) {
                newSchedule[scheduledFullDate] = { incampus: {}, outcampus: {}, event: {} };
            }
            if (!newSchedule[scheduledFullDate][type]) {
                newSchedule[scheduledFullDate][type] = {};
            }
            if (!newSchedule[scheduledFullDate][type][timeKey]) {
                newSchedule[scheduledFullDate][type][timeKey] = [];
            }
            newSchedule[scheduledFullDate][type][timeKey].push({
                id: doc.id,
                type: type,
                time: timeKey,
                routeId: schedItem.routeId,
                scheduledDatetime: schedItem.scheduledDatetime,
                status: schedItem.status,
                busDriverPairId: schedItem.busDriverPairId || null,
                rpoints: schedItem.rpoints || [],
                queueOpenMinutes: schedItem.queueOpenMinutes ?? 0,
                queueCloseMinutes: schedItem.queueCloseMinutes ?? 0,
                queueEnabled: schedItem.queueEnabled ?? false,
                cancelReason: schedItem.cancelReason || null,
            });
        });
        Object.values(newSchedule).forEach(dayObj => {
            Object.values(dayObj).forEach(typeObj =>
                Object.values(typeObj).forEach(arr => arr.sort((a, b) => a.time.localeCompare(b.time)))
            );
        });
        schedules.value = newSchedule;
    }, (error) => {
        console.error("Error fetching schedules:", error);
    });
};
const createSchedule = async () => {
    if (createScheduleForm.value.type === 'event') {
        if (!validateEventScheduleForm()) {
            isLoading.value = false;
            return;
        }
    } else {
        if (currentStep.value === 2 && !validateStep2()) {
            isLoading.value = false;
            return;
        }
        if (!validateStep1() || !validateStep3()) {
            isLoading.value = false;
            return;
        }
    }
    try {
        const baseScheduleData = {
            type: createScheduleForm.value.type,
            routeId: createScheduleForm.value.routeId,
            busDriverPairId: createScheduleForm.value.busDriverPairId || null,
            actTripStartTime: null,
            status: 'scheduled',
            ...(createScheduleForm.value.type !== 'event' && {
                queueOpenMinutes: convertToMinutes(
                    createScheduleForm.value.queueOpenDays,
                    createScheduleForm.value.queueOpenHours,
                    createScheduleForm.value.queueOpenMinutes
                ),
                queueCloseMinutes: convertToMinutes(
                    createScheduleForm.value.queueCloseDays,
                    createScheduleForm.value.queueCloseHours,
                    createScheduleForm.value.queueCloseMinutes
                ),
                queueEnabled: false,
            }),
        };
        if (createScheduleForm.value.type === 'event') {
            baseScheduleData.rpoints = createScheduleForm.value.rpoints;
        } else {
            baseScheduleData.rpoints = createScheduleForm.value.rpoints.map(rp => ({
                rpointId: rp.rpointId,
                expDepTime: rp.expDepTime,
                expArrTime: rp.expArrTime,
                actDepTime: null,
                actArrTime: null,
                latenessMinutes: 0,
                status: 'scheduled',
                queuedStudents: [],
            }));
        }

        const schedulesToModify = [];
        if (createScheduleForm.value.type !== 'event' && createScheduleForm.value.isRepeating) {
            const startDate = new Date(currentSelectedFullDate.value);
            const repeatUntil = new Date(createScheduleForm.value.repeatUntilDate);
            repeatUntil.setHours(23, 59, 59, 999);

            for (let d = new Date(startDate); d <= repeatUntil; d.setDate(d.getDate() + 1)) {
                const dayName = days[(d.getDay() + 6) % 7];
                if (createScheduleForm.value.days.includes(dayName)) {
                    const [hours, minutes] = createScheduleForm.value.time.split(':').map(Number);
                    const scheduledDateTime = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hours, minutes);

                    schedulesToModify.push({
                        ...baseScheduleData,
                        scheduledDatetime: Timestamp.fromDate(scheduledDateTime),
                    });
                }
            }
        } else {
            let scheduledDateTime;
            if (createScheduleForm.value.type === 'event') {
                scheduledDateTime = new Date(createScheduleForm.value.eventScheduledDateTime);
            } else {
                const [year, month, day] = currentSelectedFullDate.value.split('-').map(Number);
                const [hours, minutes] = createScheduleForm.value.time.split(':').map(Number);
                scheduledDateTime = new Date(year, month - 1, day, hours, minutes);
            }
            schedulesToModify.push({
                ...baseScheduleData,
                scheduledDatetime: Timestamp.fromDate(scheduledDateTime),
            });
        }
        message.value = 'Validating schedule...';
        for (const newSchedule of schedulesToModify) {
            const existingScheduleQuery = query(
                scheduleCollection,
                where('routeId', '==', newSchedule.routeId),
                where('type', '==', newSchedule.type),
                where('scheduledDatetime', '==', newSchedule.scheduledDatetime)
            );
            const existingScheduleSnap = await getDocs(existingScheduleQuery);
            if (!existingScheduleSnap.empty) {
                const duplicateDate = newSchedule.scheduledDatetime.toDate().toLocaleString('en-GB', {
                    year: 'numeric', month: 'numeric', day: 'numeric',
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                    hour12: false
                });
                errors.value.general = `Error: A schedule already exists for this route, type "${capitalize(newSchedule.type)}", and exact date and time: ${duplicateDate}. Please choose a different time.`;
                isLoading.value = false;
                return;
            }
        }
        message.value = `Saving ${schedulesToModify.length} schedule...`;
        const batchPromises = [];
        for (const scheduleData of schedulesToModify) {
            batchPromises.push(addDoc(scheduleCollection, scheduleData));
        }
        await Promise.all(batchPromises);
        closeModal();
    } catch (error) {
        console.error("Error saving schedule:", error);
        errors.value.general = `Error: ${error.message}`;
    } finally {
        isLoading.value = false;
    }
};
const updateSchedule = async () => {
    const isGroupUpdate = selectedScheduleForUpdate.value && selectedScheduleGroup.value.length > 0;
    if (createScheduleForm.value.type === 'event') {
        if (!validateEventScheduleForm()) {
            return;
        }
    } else if (currentStep.value === 2 && !validateStep2()) {
        return;
    } else if (!isGroupUpdate && (!validateStep1() || !validateStep3())) {
        return;
    }
    try {
        const baseScheduleData = {
            type: createScheduleForm.value.type,
            routeId: createScheduleForm.value.routeId,
            actTripStartTime: null,
            status: 'scheduled',
            ...(createScheduleForm.value.type !== 'event' && {
                queueOpenMinutes: convertToMinutes(
                    createScheduleForm.value.queueOpenDays,
                    createScheduleForm.value.queueOpenHours,
                    createScheduleForm.value.queueOpenMinutes
                ),
                queueCloseMinutes: convertToMinutes(
                    createScheduleForm.value.queueCloseDays,
                    createScheduleForm.value.queueCloseHours,
                    createScheduleForm.value.queueCloseMinutes
                ),
                queueEnabled: false,
            }),
        };
        if (createScheduleForm.value.type === 'event') {
            baseScheduleData.rpoints = createScheduleForm.value.rpoints;
        } else {
            baseScheduleData.rpoints = createScheduleForm.value.rpoints.map(rp => ({
                rpointId: rp.rpointId,
                expDepTime: rp.expDepTime,
                expArrTime: rp.expArrTime,
                actDepTime: null,
                actArrTime: null,
                latenessMinutes: 0,
                status: 'scheduled',
                queuedStudents: [],
            }));
        }
        if (isGroupUpdate) {
            message.value = 'Applying updates to schedule...';
            const schedulesToUpdate = selectedScheduleGroup.value.filter(
                (schedule) => schedule.status === 'scheduled'
            );
            const batchPromises = schedulesToUpdate.map(schedule => {
                const scheduleData = { ...baseScheduleData };
                return updateDoc(doc(scheduleCollection, schedule.id), scheduleData);
            });
            await Promise.all(batchPromises);
        } else {
            let scheduledDateTime;
            if (createScheduleForm.value.type === 'event') {
                scheduledDateTime = new Date(createScheduleForm.value.eventScheduledDateTime);
            } else {
                const [year, month, day] = currentSelectedFullDate.value.split('-').map(Number);
                const [hours, minutes] = createScheduleForm.value.time.split(':').map(Number);
                scheduledDateTime = new Date(year, month - 1, day, hours, minutes);
            }
            const scheduleToUpdate = {
                id: selectedScheduleForUpdate.value.id,
                ...baseScheduleData,
                scheduledDatetime: Timestamp.fromDate(scheduledDateTime),
            };

            message.value = 'Applying updates to schedule...';
            await updateDoc(doc(scheduleCollection, scheduleToUpdate.id), scheduleToUpdate);
        }
        closeModal();
    } catch (error) {
        console.error("Error updating schedule:", error);
        errors.value.general = `Error: ${error.message}`;
    }
};
const categorizeSchedulesForUpdate = (groupSchedules, modalAssignments) => {
    const schedulesToUpdate = [];
    let schedulesToDelete = [];
    const newPairsToCreateDocs = [];
    const pairsToAssign = modalAssignments
        .filter(a => a.driverId && a.busId && a.pairId)
        .map(a => a.pairId);
    const mutableGroupSchedules = [...groupSchedules];
    for (const schedule of mutableGroupSchedules) {
        if (schedule.busDriverPairId) {
            const pairIndexInModal = pairsToAssign.indexOf(schedule.busDriverPairId);
            if (pairIndexInModal !== -1) {
                pairsToAssign.splice(pairIndexInModal, 1);
            } else {
                schedulesToDelete.push(schedule.id);
            }
        }
    }
    if (schedulesToDelete.length > 0 && schedulesToDelete.length === groupSchedules.length) {
        const lastScheduleToPreserveId = schedulesToDelete[0];
        schedulesToUpdate.push({ id: lastScheduleToPreserveId, busDriverPairId: null });
        schedulesToDelete = [];
    }
    const emptySchedules = mutableGroupSchedules.filter(s => s.busDriverPairId === null);
    let emptyScheduleIndex = 0;
    for (const pairId of pairsToAssign) {
        if (emptyScheduleIndex < emptySchedules.length) {
            const scheduleToFill = emptySchedules[emptyScheduleIndex];
            schedulesToUpdate.push({ id: scheduleToFill.id, busDriverPairId: pairId });
            emptyScheduleIndex++;
        } else {
            newPairsToCreateDocs.push(pairId);
        }
    }
    if (modalAssignments.length === 0 && groupSchedules.length > 0) {
        let docToKeep = groupSchedules.find(s => s.busDriverPairId === null);
        if (!docToKeep) {
            docToKeep = groupSchedules[0];
        }
        const indexToDelete = schedulesToDelete.indexOf(docToKeep.id);
        if (indexToDelete > -1) {
            schedulesToDelete.splice(indexToDelete, 1);
        }
        const existingUpdateIndex = schedulesToUpdate.findIndex(u => u.id === docToKeep.id);
        if (existingUpdateIndex > -1) {
            schedulesToUpdate[existingUpdateIndex].busDriverPairId = null;
            schedulesToUpdate[existingUpdateIndex].status = 'scheduled';
        } else {
            schedulesToUpdate.push({ id: docToKeep.id, busDriverPairId: null, status: 'scheduled' });
        }
    }
    return { schedulesToUpdate, schedulesToDelete, newPairsToCreateDocs };
};
const executeScheduleUpdates = async (schedulesToDelete, schedulesToUpdate, newPairsToCreateDocs, groupSchedules) => {
    const notifications = [];
    for (const scheduleId of schedulesToDelete) {
        try {
            const scheduleRef = doc(scheduleCollection, scheduleId);
            const scheduleSnap = await getDoc(scheduleRef);
            if (scheduleSnap.exists()) {
                const data = scheduleSnap.data();
                if (data.busDriverPairId) {
                    const pair = busDriverPairings.value.find(p => p.id === data.busDriverPairId);
                    if (pair && pair.driverId) {
                        notifications.push({
                            driverId: pair.driverId,
                            type: 'cancel',
                            routeName: currentRoute.value.name,
                            routeType: activeTab.value,
                            scheduledTime: data.scheduledDatetime
                        });
                    }
                }
            }
            await deleteDoc(scheduleRef);
        } catch (error) {
            console.error("Error deleting schedule:", error);
        }
    }
    for (const updateInfo of schedulesToUpdate) {
        try {
            const scheduleRef = doc(scheduleCollection, updateInfo.id);
            const scheduleSnap = await getDoc(scheduleRef);
            if (scheduleSnap.exists()) {
                const oldData = scheduleSnap.data();
                const newPairId = updateInfo.busDriverPairId;
                const hasChanged = oldData.busDriverPairId !== newPairId;
                if (hasChanged) {
                    if (oldData.busDriverPairId) {
                        const oldDriverId = getPairDriverId(oldData.busDriverPairId);
                        if (oldDriverId) {
                            notifications.push({
                                driverId: oldDriverId,
                                type: 'cancel',
                                routeName: currentRoute.value.name,
                                routeType: activeTab.value,
                                scheduledTime: oldData.scheduledDatetime
                            });
                        }
                    }
                    if (newPairId) {
                        const newDriverId = getPairDriverId(newPairId);
                        if (newDriverId) {
                            notifications.push({
                                driverId: newDriverId,
                                type: 'assign',
                                routeName: currentRoute.value.name,
                                routeType: activeTab.value,
                                scheduledTime: oldData.scheduledDatetime
                            });
                        }
                    }
                    await updateDoc(scheduleRef, { busDriverPairId: newPairId });
                }
            }
        } catch (error) {
            console.error("Error updating schedule:", error);
        }
    }
    const baseScheduleData = groupSchedules.length > 0 ? { ...groupSchedules[0] } : null;
    if (!baseScheduleData && newPairsToCreateDocs.length > 0) {
        errors.value.assignments = "Could not create new assignment as some information is missing.";
        return false;
    }
    for (const pairId of newPairsToCreateDocs) {
        if (baseScheduleData) {
            const newPair = busDriverPairings.value.find(p => p.id === pairId);
            const newSchedule = {
                ...baseScheduleData,
                busDriverPairId: pairId,
                status: 'scheduled',
                actTripStartTime: null,
            };
            delete newSchedule.id;
            await addDoc(scheduleCollection, newSchedule);

            if (newPair && newPair.driverId) {
                notifications.push({
                    driverId: newPair.driverId,
                    type: 'assign',
                    routeName: currentRoute.value.name,
                    routeType: activeTab.value,
                    scheduledTime: baseScheduleData.scheduledDatetime
                });
            }
        }
    }

    for (const n of notifications) {
        try {
            await sendPushNotification(
                n.driverId,
                n.type,
                n.routeName,
                n.routeType,
                n.scheduledTime,
                n.type === 'cancel' ? 'Assignment Cancelled' : 'New Assignment',
                n.type === 'cancel'
                    ? `Your assignment for ${n.routeName} at ${formatDateTime(n.scheduledTime)} has been cancelled`
                    : `You've been assigned to ${n.routeName} at ${formatDateTime(n.scheduledTime)}`,
            );
        } catch (error) {
            console.error(`Failed to send '${n.type}' notification to driver: ${n.driverId}`, error);
        }
    }
    return true;
};
const saveAssignment = async () => {
    if (!selectedScheduleForUpdate.value) return true;
    errors.value.assignments = '';

    try {
        if (!validateAssignments()) {
            return false;
        }
        message.value = "Saving assignment changes...";
        const { schedulesToUpdate, schedulesToDelete, newPairsToCreateDocs } =
            categorizeSchedulesForUpdate(selectedScheduleGroup.value, modalAssignments.value);
        const success = await executeScheduleUpdates(
            schedulesToDelete,
            schedulesToUpdate,
            newPairsToCreateDocs,
            selectedScheduleGroup.value
        );
        if (success) {
            message.value = 'Assignments saved!';
            return true;
        }
        return false;
    } catch (error) {
        console.error("Error updating assignment:", error);
        errors.value.assignments = "Failed to update the assignment. Please try again.";
        return false;
    }
};
const deleteOrCancelSchedule = async () => {
    const group = scheduleToActOn.value;
    if (!group || group.length === 0) return;
    isLoading.value = true;
    errors.value.general = "";
    try {
        if (actionType.value === 'delete') {
            const deletePromises = group.map(sched =>
                deleteDoc(doc(scheduleCollection, sched.id))
            );
            await Promise.all(deletePromises);
        } else if (actionType.value === 'cancel') {
            const notificationPromises = group
                .filter(schedule => schedule.busDriverPairId)
                .map(schedule => {
                    const driverId = getPairDriverId(schedule.busDriverPairId);
                    if (driverId) {
                        return sendPushNotification(
                            driverId,
                            'cancel',
                            currentRoute.value.name,
                            schedule.type,
                            schedule.scheduledDatetime,
                            'Assignment Cancelled',
                            `Your assignment for ${currentRoute.value.name} at ${formatDateTime(schedule.scheduledDatetime)} has been cancelled.`
                        );
                    }
                    return null;
                })
                .filter(promise => promise !== null);

            if (notificationPromises.length > 0) {
                await Promise.all(notificationPromises);
            } else {
                console.log("No assigned drivers were found to notify.");
            }
            const updatePromises = group.map(sched => {
                updateDoc(doc(scheduleCollection, sched.id), {
                    status: 'cancelled_fully',
                    cancelReason: cancelReason.value || "Cancelled by administrator"
                });
            });
            await Promise.all(updatePromises);
        }
        closeModal();
        setupSchedulesListener();
    } catch (error) {
        console.error("Error in deleteOrCancelSchedule:", error);
        errors.value.general = `Failed to ${actionType.value} the schedule. Please try again.`;
    }
};
const deleteAssignment = async () => {
    const assignment = assignmentToDelete.value;
    const index = assignmentIndexToDelete.value;
    if (!assignment) return;
    if (isAssignmentLocked(assignment)) {
        isLoading.value = true;
        errors.value.assignments = '';
        message.value = 'Cancelling schedule...';
        try {
            await updateDoc(doc(scheduleCollection, assignment.scheduleId), { status: 'cancelled' });
            assignment.status = 'cancelled';
            if (modalAssignments.value[index]) {
                modalAssignments.value[index].status = 'cancelled';
            }
            setupSchedulesListener();
        } catch (error) {
            console.error("Error cancelling schedule:", error);
            errors.value.assignments = "Failed to cancel the schedule. Please try again.";
        } finally {
            isLoading.value = false;
            showDeleteConfirmModal.value = false;
        }
        return;
    }

    isLoading.value = true;
    errors.value.assignments = '';
    message.value = 'Removing assignment...';
    try {
        const assignedAssignmentsInModal = modalAssignments.value.filter(a => a.driverId && a.busId);
        const scheduleIdToDelete = assignment.scheduleId;
        if (!scheduleIdToDelete) {
            modalAssignments.value.splice(index, 1);
            if (modalAssignments.value.length === 0) {
                modalAssignments.value.push({ driverId: '', busId: '', pairId: null, scheduleId: null, status: '' });
            }
        } else if (assignedAssignmentsInModal.length === 1) {
            await updateDoc(doc(scheduleCollection, scheduleIdToDelete), { busDriverPairId: null });
            const otherSchedules = selectedScheduleGroup.value.filter(s => s.id !== scheduleIdToDelete);
            for (const sched of otherSchedules) {
                await deleteDoc(doc(scheduleCollection, sched.id));
            }
        } else {
            await deleteDoc(doc(scheduleCollection, scheduleIdToDelete));
        }
        modalAssignments.value.splice(index, 1);
        const groupQuery = query(scheduleCollection, where('routeId', '==', route.params.id), where('type', '==', selectedScheduleForUpdate.value.type), where('scheduledDatetime', '==', selectedScheduleForUpdate.value.scheduledDatetime));
        const querySnapshot = await getDocs(groupQuery);
        selectedScheduleGroup.value = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        if (modalAssignments.value.length === 0) {
            modalAssignments.value.push({ driverId: '', busId: '', pairId: null, scheduleId: null, status: '' });
        }
        setupSchedulesListener();
    } catch (error) {
        console.error("Error deleting assignment:", error);
        errors.value.assignments = "Failed to remove the assignment. Please try again.";
    } finally {
        isLoading.value = false;
        showDeleteConfirmModal.value = false;
    }
};


// UI handlers
const openCreateModal = (day) => {
    clearErrors();
    message.value = '';

    if (!currentRoute.value.id) {
        errors.value.general = "Error: Route information is not fully loaded. Please wait a moment and try again.";
        return;
    }
    currentStep.value = 1;
    currentSelectedDay.value = day;
    currentSelectedFullDate.value = weekDates.value.find(d => d.day === day).fullDate;
    createScheduleForm.value = {
        days: [day],
        time: '',
        tripEndTime: '',
        type: activeTab.value,
        routeId: currentRoute.value.id,
        rpoints: currentRoute.value.rpoints.map(rPointId => {
            const rPoint = rpoints.value.find(rp => rp.id === rPointId);
            return {
                rpointId: rPointId,
                name: rPoint ? rPoint.name : 'Unknown Location',
                expDepTime: '',
                expArrTime: '',
            };
        }),
        queueEnabled: false,
        queueOpenDays: 1,
        queueOpenHours: 0,
        queueOpenMinutes: 0,
        queueCloseDays: 0,
        queueCloseHours: 0,
        queueCloseMinutes: 15,
        isRepeating: true,
        repeatUntilDate: null,
        eventScheduledDateTime: null,
    };
    showCreateScheduleModal.value = true;
};
const openModalForEvent = () => {
    clearErrors();
    message.value = 'Creating a one-time schedule item for this event route.';

    if (!currentRoute.value.id) {
        errors.value.general = "Error: Route information is not fully loaded. Please wait a moment and try again.";
        return;
    }
    currentStep.value = 1;
    createScheduleForm.value = {
        type: 'event',
        routeId: currentRoute.value.id,
        rpoints: currentRoute.value.rpoints.map(rpointId => ({
            rpointId: rpointId,
            expArrTime: null,
            expDepTime: null,
            status: 'scheduled',
        })),
        eventScheduledDateTime: null,
    };
    showCreateScheduleModal.value = true;
};
const openUpdateModal = async (group) => {
    const cancelledSchedule = isFullyCancelled(group);
    if (cancelledSchedule) {
        fullyCancelledSchedule.value = cancelledSchedule;
        selectedScheduleGroup.value = group;
        showCancelledScheduleModal.value = true;
        return;
    }
    const routeId = route.params.id;
    if (!group || group.length === 0 || !routeId) {
        errors.value.general = "Schedule data or route ID is missing.";
        showUpdateScheduleModal.value = false;
        return;
    }
    isLoading.value = true;
    try {
        await fetchDriversAndBuses();
        await fetchPairings();

        selectedScheduleForUpdate.value = group[0];
        modalAssignments.value = [];
        let q = query(scheduleCollection,
            where('routeId', '==', routeId),
            where('type', '==', selectedScheduleForUpdate.value.type),
            where('scheduledDatetime', '==', selectedScheduleForUpdate.value.scheduledDatetime)
        );
        const querySnapshot = await getDocs(q);
        const groupSchedules = [];
        querySnapshot.forEach(docSnap => {
            groupSchedules.push({ id: docSnap.id, ...docSnap.data() });
        });
        groupSchedules.forEach(sched => {
            if (sched.busDriverPairId) {
                const driverId = getPairDriverId(sched.busDriverPairId);
                const busId = getPairBusId(sched.busDriverPairId);
                if (driverId && busId) {
                    modalAssignments.value.push({
                        driverId: driverId,
                        busId: busId,
                        pairId: sched.busDriverPairId,
                        scheduleId: sched.id,
                        status: sched.status,
                    });
                }
            }
        });
        if (modalAssignments.value.length === 0) {
            modalAssignments.value.push({ driverId: '', busId: '', pairId: null, scheduleId: null, status: '' });
        }
        selectedScheduleGroup.value = groupSchedules;
        showUpdateScheduleModal.value = true;

        const scheduledDate = selectedScheduleForUpdate.value.scheduledDatetime.toDate();
        currentSelectedDay.value = days[(scheduledDate.getDay() + 6) % 7];
        createScheduleForm.value.time = `${scheduledDate.getHours().toString().padStart(2, '0')}:${scheduledDate.getMinutes().toString().padStart(2, '0')}`;
        const yyyy = scheduledDate.getFullYear();
        const mm = String(scheduledDate.getMonth() + 1).padStart(2, '0');
        const dd = String(scheduledDate.getDate()).padStart(2, '0');
        currentSelectedFullDate.value = `${yyyy}-${mm}-${dd}`;
    } catch (error) {
        console.error("Error opening update modal:", error);
        errors.value.general = "Failed to load schedule data. Please try again.";
    } finally {
        isLoading.value = false;
    }
};
const toggleDaySelection = (day) => {
    const index = createScheduleForm.value.days.indexOf(day);
    if (index === -1) {
        createScheduleForm.value.days.push(day);
    } else {
        createScheduleForm.value.days.splice(index, 1);
    }
};
const getFilteredDrivers = (selectedBusId, currentIndex) => {
    const assignedPairIdsInGroup = new Set(
        selectedScheduleGroup.value
            .map(s => s.busDriverPairId)
            .filter(id => id)
    );
    const currentlySelectedDriverIdsInModal = new Set();
    modalAssignments.value.forEach((assignment, index) => {
        if (index !== currentIndex && assignment.driverId) {
            currentlySelectedDriverIdsInModal.add(assignment.driverId);
        }
    });
    const allActivePairs = busDriverPairings.value.filter(pair => pair.isActive);
    return drivers.value.filter(driver => {
        const currentDriverId = modalAssignments.value[currentIndex]?.driverId;
        if (driver.id !== currentDriverId && currentlySelectedDriverIdsInModal.has(driver.id)) {
            return false;
        }
        const driverIsAssignedInGroup = allActivePairs.some(pair =>
            pair.driverId === driver.id && assignedPairIdsInGroup.has(pair.id)
        );
        if (driver.id !== currentDriverId && driverIsAssignedInGroup) {
            return false;
        }
        if (selectedBusId) {
            return allActivePairs.some(pair =>
                pair.driverId === driver.id && pair.busId === selectedBusId
            );
        }
        return true;
    });
};
const getFilteredBuses = (selectedDriverId, currentIndex) => {
    const assignedPairIdsInGroup = new Set(
        selectedScheduleGroup.value
            .map(s => s.busDriverPairId)
            .filter(id => id)
    );
    const currentlySelectedBusIdsInModal = new Set();
    modalAssignments.value.forEach((assignment, index) => {
        if (index !== currentIndex && assignment.busId) {
            currentlySelectedBusIdsInModal.add(assignment.busId);
        }
    });
    const allActivePairs = busDriverPairings.value.filter(pair => pair.isActive);
    return buses.value.filter(bus => {
        const currentBusId = modalAssignments.value[currentIndex]?.busId;
        if (bus.id !== currentBusId && currentlySelectedBusIdsInModal.has(bus.id)) {
            return false;
        }
        const busIsAssignedInGroup = allActivePairs.some(pair =>
            pair.busId === bus.id && assignedPairIdsInGroup.has(pair.id)
        );
        if (bus.id !== currentBusId && busIsAssignedInGroup) {
            return false;
        }
        if (selectedDriverId) {
            return allActivePairs.some(pair =>
                pair.busId === bus.id && pair.driverId === selectedDriverId
            );
        }
        return true;
    });
};
const autoFillBus = (assignment) => {
    const selectedDriverId = assignment.driverId;
    if (selectedDriverId) {
        const pair = busDriverPairings.value.find(p => p.driverId === selectedDriverId && p.isActive);
        if (pair) {
            assignment.busId = pair.busId;
        } else {
            assignment.busId = '';
        }
    } else {
        assignment.busId = '';
    }
};
const autoFillDriver = (assignment) => {
    const selectedBusId = assignment.busId;
    if (selectedBusId) {
        const pair = busDriverPairings.value.find(p => p.busId === selectedBusId && p.isActive);
        if (pair) {
            assignment.driverId = pair.driverId;
        } else {
            assignment.driverId = '';
        }
    } else {
        assignment.driverId = '';
    }
};
const addAssignmentRow = () => {
    const hasEmptyRow = modalAssignments.value.some(a => !a.driverId && !a.busId);
    if (hasEmptyRow) {
        errors.value.assignments = "Please fill the current empty assignment row before adding a new one.";
        return;
    }
    errors.value.assignments = "";
    modalAssignments.value.push({ driverId: '', busId: '', pairId: null, scheduleId: null, status: '' });
};
const goToNextStep = () => {
    clearErrors();

    isLoading.value = true;
    if (createScheduleForm.value.type === 'event') {
        isLoading.value = false;
        return;
    }
    let isValid = true;
    if (currentStep.value === 1) {
        isValid = validateStep1();
    } else if (currentStep.value === 2) {
        isValid = validateStep2();
    } else if (currentStep.value === 3) {
        isValid = validateStep3();
    }
    if (isValid) {
        currentStep.value++;
    }
    isLoading.value = false;
};
const goToDetailsStep = async () => {
    if (!validateAssignments()) {
        return;
    }
    const scheduleDataForUpdate = selectedScheduleGroup.value.find(s => s.status === 'scheduled');
    if (!scheduleDataForUpdate) {
        console.error("Error: No schedule data available for update. Please select a schedule.");
        errors.value.assignments = "No schedule selected for update details. Please try again.";
        return;
    }
    const timeKey = scheduleDataForUpdate.scheduledDatetime.toDate().toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: false
    });
    const queueOpen = convertFromMinutes(scheduleDataForUpdate.queueOpenMinutes);
    const queueClose = convertFromMinutes(scheduleDataForUpdate.queueCloseMinutes);

    createScheduleForm.value = {
        days: [],
        time: timeKey,
        tripEndTime: scheduleDataForUpdate.rpoints[scheduleDataForUpdate.rpoints.length - 1]?.expArrTime || '',
        type: scheduleDataForUpdate.type,
        routeId: scheduleDataForUpdate.routeId,
        rpoints: scheduleDataForUpdate.rpoints.map(rp => ({
            rpointId: rp.rpointId,
            name: rpoints.value.find(g => g.id === rp.rpointId)?.name || 'Unknown Location',
            expDepTime: rp.expDepTime,
            expArrTime: rp.expArrTime,
        })),
        queueEnabled: scheduleDataForUpdate.queueEnabled,
        queueOpenDays: queueOpen.days,
        queueOpenHours: queueOpen.hours,
        queueOpenMinutes: queueOpen.minutes,
        queueCloseDays: queueClose.days,
        queueCloseHours: queueClose.hours,
        queueCloseMinutes: queueClose.minutes,
        isRepeating: false,
        repeatUntilDate: null,
        eventScheduledDateTime: scheduleDataForUpdate.type === 'event' ? scheduleDataForUpdate.scheduledDatetime.toDate().toISOString().slice(0, 16) : null,
    };
    const scheduledDate = scheduleDataForUpdate.scheduledDatetime?.toDate();
    if (scheduledDate) {
        const yyyy = scheduledDate.getFullYear();
        const mm = String(scheduledDate.getMonth() + 1).padStart(2, '0');
        const dd = String(scheduledDate.getDate()).padStart(2, '0');
        currentSelectedFullDate.value = `${yyyy}-${mm}-${dd}`;
    } else {
        currentSelectedFullDate.value = '';
    }
    currentStep.value = 2;
    showUpdateScheduleModal.value = false;
    showCreateScheduleModal.value = true;
};
const closeModal = () => {
    showCreateScheduleModal.value = false;
    showUpdateScheduleModal.value = false;
    showPairingModal.value = false;
    showDeleteConfirmModal.value = false;
    showCancelledScheduleModal.value = false;
    createScheduleForm.value = {
        days: [],
        time: '',
        tripEndTime: '',
        type: '',
        routeId: currentRoute.value.id,
        rpoints: currentRoute.value.rpoints.map(rPointId => {
            const rPoint = rpoints.value.find(rp => rp.id === rPointId);
            return {
                rpointId: rPointId,
                name: rPoint ? rPoint.name : 'Unknown Location',
                expDepTime: '',
                expArrTime: '',
            };
        }),
        queueEnabled: false,
        queueOpenDays: 1,
        queueOpenHours: 0,
        queueOpenMinutes: 0,
        queueCloseDays: 0,
        queueCloseHours: 0,
        queueCloseMinutes: 15,
        isRepeating: false,
        repeatUntilDate: null,
        eventScheduledDateTime: null,
    };
    currentStep.value = 1;
    isLoading.value = false;
    selectedScheduleForUpdate.value = null;
    modalAssignments.value = [];
    newPairBusId.value = '';
    newPairDriverId.value = '';
    scheduleToActOn.value = null;
    actionType.value = null;
    message.value = '';
    clearErrors();
};
const goBackToAssignmentStep = () => {
    showCreateScheduleModal.value = false;
    showUpdateScheduleModal.value = true;
    currentStep.value = 1;
};
const confirmDeleteAssignment = (assignment, index) => {
    assignmentToDelete.value = { ...assignment };
    assignmentIndexToDelete.value = index;
    showDeleteConfirmModal.value = true;
};
const confirmDeleteSchedule = () => {
    const allScheduled = selectedScheduleGroup.value.every(s => s.status === 'scheduled'); scheduleToActOn.value = [...selectedScheduleGroup.value];
    scheduleToActOn.value = selectedScheduleGroup.value;
    if (allScheduled) {
        actionType.value = 'delete';
    } else {
        actionType.value = 'cancel';
    }
    showDeleteConfirmModal.value = true;
};
const handleSaveAssignmentClick = async () => {
    clearErrors();
    isLoading.value = true;
    const assignmentSuccess = await saveAssignment();
    if (assignmentSuccess) {
        message.value = 'Assignments have been updated successfully!';
        closeModal();
    }
    isLoading.value = false;
};
const handleSaveScheduleClick = async () => {
    clearErrors();
    message.value = '';
    isLoading.value = true;
    if (!currentRoute.value.id) {
        errors.value.general = "Error: Route information is not fully loaded. Please wait a moment and try again.";
        isLoading.value = false;
        return;
    }
    if (selectedScheduleForUpdate.value) {
        const assignmentSuccess = await saveAssignment();
        if (assignmentSuccess) {
            message.value = "Finalizing updates...";
            try {
                const groupQuery = query(
                    scheduleCollection,
                    where('routeId', '==', route.params.id),
                    where('type', '==', selectedScheduleForUpdate.value.type),
                    where('scheduledDatetime', '==', selectedScheduleForUpdate.value.scheduledDatetime)
                );
                const querySnapshot = await getDocs(groupQuery);
                selectedScheduleGroup.value = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
                await updateSchedule();
            } catch (error) {
                console.error("Error re-fetching schedules after assignment save:", error);
                errors.value.general = "Could not refresh schedules after saving assignments. Please close the modal and try again.";
                isLoading.value = false;
                return;
            }
        }
    } else {
        await createSchedule();
    }
    isLoading.value = false;
};


// Watchers
watch(() => route.query, async (newQuery) => {
    const { type, time, date, weekStart, openModal } = newQuery;
    if (!route.params.id || !weekStart) return;
    if (type && type !== 'event') {
        activeTab.value = type;
    }
    if (unsubscribeSchedules.value) {
        unsubscribeSchedules.value();
    }
    currentWeekStart.value = new Date(weekStart);
    selectedDate.value = date;
    await nextTick();
    setupSchedulesListener();

    if (openModal === 'true' && time) {
        const checkSchedulesLoaded = () => {
            if (Object.keys(schedules.value).length > 0) {
                const matchingSchedules = [];
                Object.entries(schedules.value).forEach(([fullDate, daySchedules]) => {
                    if (fullDate === date && daySchedules[activeTab.value]) {
                        Object.entries(daySchedules[activeTab.value]).forEach(([scheduleTime, scheduleGroup]) => {
                            if (scheduleTime.replace(/ /g, '') === time.replace(/ /g, '')) {
                                matchingSchedules.push(...scheduleGroup);
                            }
                        });
                    }
                });
                if (matchingSchedules.length > 0) {
                    openUpdateModal(matchingSchedules);
                }
            } else {
                setTimeout(checkSchedulesLoaded, 100);
            }
        };
        checkSchedulesLoaded();
    }
}, { immediate: true });
watch(activeTab, (newTab, oldTab) => {
    if (newTab !== oldTab) {
        setupSchedulesListener();
    }
});
watch(currentWeekStart, () => { }, { immediate: true, deep: true });
watch(selectedDate, (newDate) => {
    const date = new Date(newDate);
    const dayOfWeek = (date.getDay() + 6) % 7;
    currentWeekStart.value = new Date(date.setDate(date.getDate() - dayOfWeek));
    currentWeekStart.value.setHours(0, 0, 0, 0);
});
</script>


<template>
    <div class="container-fluid py-4">
        <div class="card">
            <div class="card-header pb-0">
                <div>
                    <h4>Schedule for {{ currentRoute.name }}</h4>
                    <p class="text-sm mb-4">Locations: {{ getRPointNames(currentRoute.rpoints) }}</p>
                </div>

                <div class="d-flex flex-row justify-content-between align-items-center">
                    <!-- Date & Navigation Controls -->
                    <div class="d-flex align-items-center">
                        <div class="date-picker-trigger me-2" @click="openDatePicker">
                            <span>{{ formattedMonthYear }}</span>
                            <i class="fas fa-chevron-down ms-2"></i>
                            <input type="date" ref="datePicker" v-model="selectedDate"
                                class="visually-hidden-date-input" @change="handleDatePickerChange">
                        </div>

                        <button class="arrow-nav-btn me-2" title="Previous week" @click="navigateToPreviousWeek">
                            <i class="fas fa-chevron-left"></i>
                        </button>
                        <button class="arrow-nav-btn me-2" title="Next week" @click="navigateToNextWeek">
                            <i class="fas fa-chevron-right"></i>
                        </button>

                        <button class="btn btn-outline-primary today-btn mb-0" @click="navigateToToday">Today</button>
                    </div>

                    <!-- Tabs for In/Out Campus -->
                    <div v-if="currentRoute.type !== 'event'" class="d-flex">
                        <ul class="nav nav-pills nav-fill">
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

                    <!-- Add Button for Event-Type Routes -->
                    <div v-else class="d-flex justify-content-end mb-3">
                        <argon-button color="primary" @click="openModalForEvent">
                            <i class="fas fa-plus me-1"></i> Add Schedule
                        </argon-button>
                    </div>
                </div>
            </div>

            <!-- Schedule Table -->
            <div class="card-body">
                <div class="table-responsive">
                    <table class="table table-bordered text-center" style="table-layout: fixed">
                        <colgroup>
                            <col style="width: 80px">
                        </colgroup>

                        <thead>
                            <tr>
                                <th class="text-sm text-center align-middle px-3 py-3 bg-light" style="width: 80px">
                                    <strong>Time</strong>
                                </th>
                                <th v-for="(entry, index) in weekDates" :key="'date-' + index" :class="[
                                    'text-sm text-center px-3 py-3',
                                    entry.fullDate === getTodayLocalDate()
                                        ? 'bg-primary text-white'
                                        : 'bg-light'
                                ]">
                                    <div class="d-flex flex-column align-items-center">
                                        <span class="text-capitalize text-truncate">{{ entry.day }}</span>
                                        <span class="fw-semibold">{{ entry.formattedDate }}</span>
                                        <button v-if="currentRoute.type !== 'event'" :class="[
                                            'btn', 'btn-link', 'mb-0', 'p-0', 'mt-1',
                                            entry.fullDate === getTodayLocalDate() ? 'text-white' : ''
                                        ]" @click="openCreateModal(entry.day)" title="Add time slot">
                                            <i class="fas fa-plus-circle fs-6"></i>
                                        </button>
                                    </div>
                                </th>
                            </tr>
                        </thead>

                        <tbody>
                            <tr v-for="timeSlot in allUniqueTimes" :key="timeSlot">
                                <td class="text-sm text-center align-middle" style="width: 90px">
                                    <strong>{{ timeSlot }}</strong>
                                </td>
                                <td v-for="(entry, dayIndex) in weekDates"
                                    :key="'schedule-cell-' + dayIndex + '-' + timeSlot"
                                    class="text-sm text-center align-middle">
                                    <div v-if="getSchedulesForCell(entry.fullDate, activeTab, timeSlot).length > 0">
                                        <div @click="openUpdateModal(getSchedulesForCell(entry.fullDate, activeTab, timeSlot))"
                                            :class="[
                                                'schedule-cell p-2 rounded-2 shadow-sm mb-1',
                                                isFullyCancelled(getSchedulesForCell(entry.fullDate, activeTab, timeSlot)) ? 'bg-fully-cancelled' : 'bg-white'
                                            ]" style="cursor: pointer; border-left: 5px solid"
                                            :style="{ borderColor: getScheduleStatusColor(getGroupedStatus(getSchedulesForCell(entry.fullDate, activeTab, timeSlot))) }">
                                            <template
                                                v-if="isFullyCancelled(getSchedulesForCell(entry.fullDate, activeTab, timeSlot))">
                                                <div class="cell-fully-cancelled">
                                                    <i class="fas fa-ban me-1"></i> Cancelled
                                                </div>
                                            </template>
                                            <template v-else>
                                                <div class="d-flex justify-content-between align-items-center mb-2">
                                                    <span class="badge px-2 py-1 text-white"
                                                        :class="getScheduleStatusClass(getGroupedStatus(getSchedulesForCell(entry.fullDate, activeTab, timeSlot)))">
                                                        {{ getGroupedStatus(getSchedulesForCell(entry.fullDate,
                                                        activeTab,
                                                        timeSlot)).replace('_', ' ') }}
                                                    </span>
                                                </div>
                                                <div class="d-flex justify-content-between text-dark mb-1">
                                                    <template
                                                        v-if="getCounts(getSchedulesForCell(entry.fullDate, activeTab, timeSlot)).busDriverPairs === 0">
                                                        <span class="fst-italic text-muted">
                                                            <i class="fas fa-user-times me-1"></i> Unassigned
                                                        </span>
                                                    </template>
                                                    <template v-else>
                                                        <span class="me-2">
                                                            {{ getCounts(getSchedulesForCell(entry.fullDate, activeTab,
                                                            timeSlot)).busDriverPairs }} Driver
                                                        </span>
                                                        <span>
                                                            {{ getCounts(getSchedulesForCell(entry.fullDate, activeTab,
                                                            timeSlot)).busDriverPairs }} Bus
                                                        </span>
                                                    </template>
                                                </div>
                                                <div class="d-flex justify-content-between align-items-center small">
                                                    <span :class="[
                                                        getSchedulesForCell(entry.fullDate, activeTab, timeSlot)[0].queueEnabled
                                                            ? 'text-warning fw-semibold'
                                                            : 'text-muted'
                                                    ]">👥 Queue: {{
                                                        getTotalQueuedStudents(getSchedulesForCell(entry.fullDate,
                                                        activeTab, timeSlot)) }}</span>
                                                </div>
                                            </template>
                                        </div>
                                    </div>
                                    <div v-else class="text-muted text-xs pt-4"></div>
                                </td>
                            </tr>
                            <tr v-if="allUniqueTimes.length === 0">
                                <td :colspan="weekDates.length + 1" class="text-center text-muted py-4">
                                    No schedules found for this week.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

    <!-- Add New Schedule Modal -->
    <div v-if="showCreateScheduleModal" class="modal fade show d-block">
        <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">
                        {{ selectedScheduleForUpdate ? 'Update Schedule' : 'Add New Schedule' }}
                        <span v-if="createScheduleForm.type !== 'event'"> (Step {{ currentStep
                            }} of 3)</span>
                    </h5>
                    <button type="button" class="btn-close" @click="closeModal"></button>
                </div>
                <div class="modal-body">
                    <p v-if="selectedScheduleForUpdate" class="text-sm text-muted">
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        Only schedules with 'Scheduled' status will be updated.
                    </p>
                    <div v-if="createScheduleForm.type === 'event'">
                        <div class="mb-3">
                            <label for="eventScheduleDateTime" class="form-label">Event Date and Time:</label>
                            <argon-input type="datetime-local" id="eventScheduleDateTime"
                                v-model="createScheduleForm.eventScheduledDateTime" required />
                            <div v-if="errors.eventScheduledDateTime" class="text-danger text-sm mt-1">
                                {{ errors.eventScheduledDateTime }}
                            </div>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Type:</label>
                            <argon-input type="text" :modelValue="capitalize(createScheduleForm.type)" disabled />
                        </div>
                    </div>

                    <div v-else>
                        <div v-if="currentStep === 1 && !selectedScheduleForUpdate">
                            <div class="mb-3 form-check">
                                <input class="form-check-input" type="checkbox" id="isRepeating"
                                    v-model="createScheduleForm.isRepeating">
                                <label class="form-check-label" for="isRepeating">
                                    Repeat this schedule (e.g., weekly)
                                </label>
                            </div>
                            <div v-if="createScheduleForm.isRepeating">
                                <div class="mb-3">
                                    <label for="fromDate" class="form-label">From:</label>
                                    <input type="date" id="fromDate" class="form-control"
                                        :value="currentSelectedFullDate" disabled>
                                </div>
                                <div class="mb-3">
                                    <label for="days" class="form-label">Repeat every:</label>
                                    <div class="d-flex justify-content-center gap-2 mb-2">
                                        <button v-for="day in days" :key="day" @click="toggleDaySelection(day)" :class="['btn', 'btn-sm', 'btn-icon-only', 'rounded-circle', 'text-capitalize', {
                                            'btn-primary': createScheduleForm.days.includes(day),
                                            'btn-outline-secondary': !createScheduleForm.days.includes(day)
                                        }]" :title="day">
                                            {{ day.charAt(0).toUpperCase() }}
                                        </button>
                                    </div>
                                    <div v-if="errors.days" class="text-danger text-sm mt-1">
                                        {{ errors.days }}
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label for="repeatUntilDate" class="form-label">Repeat
                                        until:</label>
                                    <argon-input type="date" id="repeatUntilDate"
                                        v-model="createScheduleForm.repeatUntilDate" :min="currentSelectedFullDate"
                                        :max="maxRepeatUntilDate" required />
                                    <p class="text-xs text-muted mt-1">
                                        Maximum 3 months from {{ currentSelectedFullDate ? new
                                        Date(currentSelectedFullDate).toLocaleDateString("en-GB")
                                        : 'the start date'
                                        }}.
                                    </p>
                                    <div v-if="errors.repeatUntilDate" class="text-danger text-sm mt-1">
                                        {{ errors.repeatUntilDate }}
                                    </div>
                                </div>
                            </div>
                            <div v-else>
                                <div class="mb-3">
                                    <label for="scheduleDate" class="form-label">Schedule Date:</label>
                                    <input type="date" id="scheduleDate" class="form-control"
                                        :value="currentSelectedFullDate" disabled>
                                </div>
                            </div>
                        </div>

                        <div v-if="currentStep === 2">
                            <div class="mb-3">
                                <label for="scheduleTime" class="form-label">Trip Departure
                                    Time:</label>
                                <argon-input type="time" id="scheduleTime" v-model="createScheduleForm.time" required
                                    :disabled="!!selectedScheduleForUpdate" />
                            </div>
                            <div class="mb-3">
                                <label for="tripEndTime" class="form-label">Trip End
                                    Time:</label>
                                <argon-input type="time" id="tripEndTime" v-model="createScheduleForm.tripEndTime"
                                    required />
                                <div v-if="errors.time" class="text-danger text-sm mt-1">
                                    {{ errors.time }}
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Type:</label>
                                <argon-input type="text" :modelValue="capitalize(createScheduleForm.type)" disabled />
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Stops & Departure Times:</label>
                                <div v-if="errors.rpoints" class="text-danger text-sm mt-1">
                                    {{ errors.rpoints }}
                                </div>
                                <div v-for="(rpoint, index) in createScheduleForm.rpoints" :key="rpoint.rpointId"
                                    class="mb-2 p-3 border rounded">
                                    <strong>{{ rpoint.name }}</strong>
                                    <div class="row g-2 mt-1">
                                        <div class="col-md-12">
                                            <label :for="'expDepTime-' + index" class="form-label text-sm">Expected
                                                Departure
                                                Time:</label>
                                            <argon-input type="time" :id="'expDepTime-' + index"
                                                v-model="rpoint.expDepTime" required />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div v-if="currentStep === 3">
                            <div class="mb-3 row">
                                <div class="col-md-6">
                                    <label class="form-label">Queue Open Before:</label>
                                    <div class="row g-2">
                                        <div class="col-4">
                                            <argon-input type="number" class="mb-0"
                                                v-model.number="createScheduleForm.queueOpenDays" min="0"
                                                :disabled="createScheduleForm.queueEnabled" />
                                            <small class="text-muted d-block text-center">Day(s)</small>
                                        </div>
                                        <div class="col-4">
                                            <argon-input type="number" class="mb-0"
                                                v-model.number="createScheduleForm.queueOpenHours" min="0" max="23"
                                                :disabled="createScheduleForm.queueEnabled" />
                                            <small class="text-muted d-block text-center">Hour(s)</small>
                                        </div>
                                        <div class="col-4">
                                            <argon-input type="number" class="mb-0"
                                                v-model.number="createScheduleForm.queueOpenMinutes" min="0" max="59"
                                                :disabled="createScheduleForm.queueEnabled" />
                                            <small class="text-muted d-block text-center">Minute(s)</small>
                                        </div>
                                    </div>
                                    <div v-if="errors.queueOpenMinutes" class="text-danger text-sm mt-1">
                                        {{ errors.queueOpenMinutes }}
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">Queue Close Before:</label>
                                    <div class="row g-2">
                                        <div class="col-4">
                                            <argon-input type="number" class="mb-0"
                                                v-model.number="createScheduleForm.queueCloseDays" min="0"
                                                :disabled="createScheduleForm.queueEnabled" />
                                            <small class="text-muted d-block text-center">Day(s)</small>
                                        </div>
                                        <div class="col-4">
                                            <argon-input type="number" class="mb-0"
                                                v-model.number="createScheduleForm.queueCloseHours" min="0" max="23"
                                                :disabled="createScheduleForm.queueEnabled" />
                                            <small class="text-muted d-block text-center">Hour(s)</small>
                                        </div>
                                        <div class="col-4">
                                            <argon-input type="number" class="mb-0"
                                                v-model.number="createScheduleForm.queueCloseMinutes" min="0" max="59"
                                                :disabled="createScheduleForm.queueEnabled" />
                                            <small class="text-muted d-block text-center">Minute(s)</small>
                                        </div>
                                    </div>
                                    <div v-if="errors.queueCloseMinutes" class="text-danger text-sm mt-1">
                                        {{ errors.queueCloseMinutes }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div v-if="isLoading" class="text-center my-3">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <p class="mt-2">{{ message }}</p>
                    </div>
                    <div v-if="errors.general" class="text-danger text-sm mt-3">
                        {{ errors.general }}
                    </div>

                    <div class="d-flex justify-content-end gap-2 mt-4">
                        <argon-button color="danger" v-if="showUpdateScheduleModal" @click="confirmDeleteSchedule()">
                            Delete Schedule
                        </argon-button>

                        <argon-button color="secondary" v-if="currentStep > 1 && createScheduleForm.type !== 'event'"
                            @click="selectedScheduleForUpdate && currentStep === 2 ? goBackToAssignmentStep() : currentStep--">Previous</argon-button>

                        <argon-button color="primary" v-if="currentStep < 3 && createScheduleForm.type !== 'event'"
                            @click="goToNextStep">Next</argon-button>

                        <div v-if="currentStep === 3 || createScheduleForm.type === 'event'">
                            <argon-button color="primary" :disabled="isLoading" @click="handleSaveScheduleClick"
                                v-if="(currentStep === 3 && createScheduleForm.type !== 'event') || createScheduleForm.type === 'event'">
                                {{ selectedScheduleForUpdate ? 'Update Schedule' : 'Create Schedule' }}
                            </argon-button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="modal-backdrop fade show" v-if="showCreateScheduleModal"></div>

    <!-- Update Schedule Modal -->
    <div v-if="showUpdateScheduleModal" class="modal fade show d-block">
        <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Assign Driver & Bus</h5>
                    <button type="button" class="btn-close" @click="closeModal"></button>
                </div>
                <div class="modal-body">
                    <p class="text-sm text-muted">
                        Assign a driver and bus to this schedule. If you need to create a new bus-driver
                        pair, please do so in the Pairings section.
                    </p>
                    <div v-if="selectedScheduleForUpdate">
                        <div v-for="(assignment, index) in modalAssignments" :key="index"
                            class="mb-3 p-2 border rounded">
                            <div class="mb-3 row">
                                <div class="col-md-5">
                                    <label :for="'bus-' + index" class="form-label">Bus</label>
                                    <select :id="'bus-' + index" class="form-select" v-model="assignment.busId"
                                        @change="autoFillDriver(assignment)" :disabled="isAssignmentLocked(assignment)">
                                        <option value="">Select Bus</option>
                                        <option v-for="bus in getFilteredBuses(assignment.driverId, index)"
                                            :key="bus.id" :value="bus.id">
                                            {{ getBusDisplay(bus.id) }}
                                        </option>
                                    </select>
                                </div>

                                <div class="col-md-5">
                                    <label :for="'driver-' + index" class="form-label">Driver</label>
                                    <select :id="'driver-' + index" class="form-select" v-model="assignment.driverId"
                                        @change="autoFillBus(assignment)" :disabled="isAssignmentLocked(assignment)">
                                        <option value="">Select Driver</option>
                                        <option v-for="driver in getFilteredDrivers(assignment.busId, index)"
                                            :key="driver.id" :value="driver.id">
                                            {{ getDriverDisplay(driver.id) }}
                                        </option>
                                    </select>
                                </div>

                                <div class="col-md-2 d-flex align-items-end">
                                    <argon-button color="danger" icon
                                        @click="confirmDeleteAssignment(assignment, index)"
                                        :disabled="assignment.status === 'cancelled'">
                                        <i class="fas fa-trash"></i>
                                    </argon-button>
                                </div>
                            </div>
                            <div class="row" v-if="assignment.status">
                                <small class="fst-italic" :style="{ color: getScheduleStatusColor(assignment.status) }">
                                    Status: {{ getScheduleStatusText(assignment.status).replace('_', ' ') }}
                                </small>
                            </div>
                        </div>
                        <div class="mb-3">
                            <argon-button color="primary" size="sm" variant="outline" @click="addAssignmentRow"><i
                                    class="ni ni-fat-add"></i> Add Assignment</argon-button>
                        </div>
                        <div class="mb-3">
                            <argon-button color="info" size="sm" variant="gradient" @click="showPairingModal = true"
                                class="me-2">
                                <i class="fas fa-link"></i> View Pairings
                            </argon-button>
                        </div>
                        <div v-if="isLoading" class="text-center my-3">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                            <p class="mt-2">{{ message }}</p>
                        </div>
                        <div v-if="errors.assignments" class="text-danger text-sm mt-1">
                            <div v-for="(error, index) in errors.assignments.split('\n')" :key="index">
                                <i class="fas fa-exclamation-circle me-1"></i> {{ error }}
                            </div>
                        </div>
                    </div>

                    <div class="d-flex justify-content-end gap-2 mt-4">
                        <argon-button color="danger" @click="confirmDeleteSchedule()">
                            Delete Schedule
                        </argon-button>

                        <argon-button color="secondary" v-if="currentRoute.type !== 'event'"
                            @click="goToDetailsStep">Update
                            Schedule Details</argon-button>

                        <div v-if="currentStep === 1 || currentStep === 4">
                            <argon-button color="primary" :disabled="isLoading" @click="handleSaveAssignmentClick">
                                <span v-if="isLoading">Processing...</span>
                                <span v-else>Save Assignment</span>
                            </argon-button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="modal-backdrop fade show" v-if="showUpdateScheduleModal"></div>

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
                    <BusDriverPairingTable :pairings="busDriverPairings" :buses="buses" :drivers="drivers"
                        @update-pairings="fetchPairings" />
                </div>
            </div>
        </div>
    </div>
    <div class="modal-backdrop fade show" v-if="showPairingModal"></div>

    <!-- Delete or Cancel Confirmation Modal -->
    <div v-if="showDeleteConfirmModal" class="modal fade delete-confirm-modal"
        :class="{ 'show d-block': showDeleteConfirmModal }" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Confirm Action</h5>
                    <button type="button" class="btn-close" @click="showDeleteConfirmModal = false"></button>
                </div>
                <div class="modal-body">
                    <div v-if="scheduleToActOn">
                        <div v-if="actionType === 'delete'">
                            <p>Are you sure? This will delete all assignments permanently.</p>
                        </div>
                        <div v-else-if="actionType === 'cancel'">
                            <p>This will cancel all assignments. Please provide a reason (optional):</p>
                            <argon-input id="cancelReason" v-model="cancelReason" />
                        </div>
                    </div>

                    <div v-else>
                        <p v-if="assignmentToDelete && isAssignmentLocked(assignmentToDelete)">
                            This schedule is already in progress or completed. Continuing will mark it as
                            <strong>cancelled</strong>.
                        </p>
                        <p v-else>
                            Are you sure you want to remove this assignment?
                        </p>
                    </div>

                    <div class="d-flex justify-content-end gap-2 mt-4">
                        <argon-button color="danger"
                            @click="scheduleToActOn ? deleteOrCancelSchedule() : deleteAssignment()">
                            {{
                            scheduleToActOn
                            ? (actionType === 'cancel' ? 'Confirm Cancel' : 'Confirm Delete')
                            : (isAssignmentLocked(assignmentToDelete) ? 'Confirm Cancel' : 'Confirm Delete')
                            }}
                        </argon-button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="modal-backdrop fade show delete-confirm-backdrop" v-if="showDeleteConfirmModal"></div>

    <!-- Cancelled Schedule Modal -->
    <div v-if="showCancelledScheduleModal" class="modal fade show d-block">
        <div class="modal-dialog modal-dialog-centered modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Cancelled Schedule Details</h5>
                    <button type="button" class="btn-close" @click="closeModal"></button>
                </div>
                <div class="modal-body" v-if="fullyCancelledSchedule">
                    <div class="alert alert-danger">
                        <strong>Reason for Cancellation:</strong>
                        <p class="mb-0 fst-italic">{{ fullyCancelledSchedule.cancelReason || 'No reason provided.'
                            }}
                        </p>
                    </div>
                    <hr>
                    <h5 class="mt-4">Original Schedule Information</h5>
                    <div class="row mt-3">
                        <div class="col-md-6">
                            <p><strong class="text-sm">Route:</strong><br> {{ currentRoute.name }}</p>
                            <p><strong class="text-sm">Type:</strong><br> <span class="text-capitalize">{{
                                    fullyCancelledSchedule.type
                                    }}</span></p>
                        </div>
                        <div class="col-md-6">
                            <p><strong class="text-sm">Originally Scheduled For:</strong><br> {{
                                formatDateTime(fullyCancelledSchedule.scheduledDatetime)
                                }}</p>
                        </div>
                    </div>
                    <div class="row mt-3" v-if="fullyCancelledSchedule.type !== 'event'">
                        <div class="col-md-6">
                            <p><strong class="text-sm">Queue Open Before:</strong><br>
                                {{ formatQueueTime(fullyCancelledSchedule.queueOpenMinutes) }}
                            </p>
                        </div>
                        <div class="col-md-6">
                            <p><strong class="text-sm">Queue Close Before:</strong><br>
                                {{ formatQueueTime(fullyCancelledSchedule.queueCloseMinutes) }}
                            </p>
                        </div>
                    </div>
                    <div v-if="filteredSchedules.length > 0" class="pb-3">
                        <p class="mt-3"><strong class="text-sm">Original Assignments</strong></p>
                        <ul class="list-group">
                            <li v-for="schedule in filteredSchedules" :key="schedule.id" class="list-group-item">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <i class="fas fa-user me-2"></i>
                                        {{ getDriverDisplay(getPairDriverId(schedule.busDriverPairId)) }}
                                    </div>
                                    <div>
                                        <i class="fas fa-bus me-2"></i>
                                        {{ getBusDisplay(getPairBusId(schedule.busDriverPairId)) }}
                                    </div>
                                </div>
                            </li>
                        </ul>
                    </div>
                    <p v-else class="mt-3 pb-3"><strong class="text-sm">Original Assignment:</strong>
                        <span class="text-muted"> -</span>
                    </p>
                    <p class="mt-3"><strong class="text-sm">Planned Stops</strong></p>
                    <ul class="list-group">
                        <li v-for="rpoint in fullyCancelledSchedule.rpoints" :key="rpoint.rpointId"
                            class="list-group-item">
                            {{rpoints.find(rp => rp.id === rpoint.rpointId)?.name || 'Unknown Stop'}}
                            <span v-if="rpoint.expDepTime" class="text-muted fst-italic ms-2">
                                (Exp. Departure: {{ rpoint.expDepTime }})
                            </span>
                        </li>
                    </ul>

                    <div class="d-flex justify-content-end gap-2 mt-4">
                        <argon-button color="secondary" @click="closeModal">
                            Cancel
                        </argon-button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="modal-backdrop fade show" v-if="showCancelledScheduleModal"></div>
</template>


<style>
.date-picker-trigger {
    position: relative;
    display: inline-flex;
    width: 160px;
    font-size: 0.875rem;
    align-items: center;
    padding: 0.375rem 0.75rem;
    color: #344767;
    background-color: transparent;
    border: 1px solid transparent;
    border-radius: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease-in-out;
    overflow: hidden;
}

.date-picker-trigger:hover {
    background-color: rgba(0, 0, 0, 0.05);
}

.date-picker-trigger i {
    font-size: 0.75rem;
}

.visually-hidden-date-input {
    position: absolute;
    top: 0;
    left: 0;
    opacity: 0;
    cursor: pointer;
    z-index: 1;
}

.arrow-nav-btn {
    background-color: transparent;
    border: none;
    color: #495057;
    font-size: 1rem;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 0.3s ease, color 0.3s ease;
    padding: 0;
}

.arrow-nav-btn:hover {
    background-color: rgba(0, 0, 0, 0.1);
    color: #344767;
}

.today-btn {
    border-radius: 1rem;
    padding: 0.5rem 2rem !important;
    transition: none !important;
}
</style>


<style scoped>
.nav-pills .nav-link {
    font-size: 0.875rem !important;
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
th,
td {
    width: calc((100% - 90px) / 7);
    min-width: 120px;
    max-width: none !important;
    text-align: center;
    vertical-align: middle;
    border: 1px solid #e9ecef !important;
}
th {
    border-bottom: 1px solid #344767 !important;
}
/* .badge {
    font-size: 1em;
    padding: 0.5em;
    display: inline-flex;
    align-items: center;
} */
.cell-fully-cancelled {
     background-color: #f1f1f1;
     font-style: italic;
     padding: 10px 0;
 }
.badge-in-progress {
    background-color: #fd7e14;
    color: white;
}
.bg-fully-cancelled {
    background-color: #f1f1f1;
    box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.12) !important;
}
.modal.delete-confirm-modal {
    z-index: 1060;
}
.modal-backdrop.delete-confirm-backdrop {
    z-index: 1050;
}
</style>
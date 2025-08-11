<script setup>
import { ref, onMounted, watch, onUnmounted, computed } from 'vue';
import { scheduleCollection, routeCollection, driverCollection, busCollection } from '@/firebase';
import { getDocs, query, where, Timestamp, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'vue-router';


// Reactive state
const router = useRouter();
const routes = ref([]);
const drivers = ref([]);
const buses = ref([]);
const datePicker = ref(null);
const selectedDate = ref(new Date().toISOString().split('T')[0]);
const schedules = ref([]); 
// const showScheduleModal = ref(false);
// const currentSchedule = ref(null);
let unsubscribeSchedules = null;


// Lifecycle hooks
onMounted(async () => {
    const [routesSnap, driversSnap, busesSnap] = await Promise.all([
        getDocs(routeCollection),
        getDocs(driverCollection),
        getDocs(busCollection)
    ]);
    routes.value = routesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    drivers.value = driversSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    buses.value = busesSnap.docs.map(b => ({ id: b.id, ...b.data() }));
    setupRealtimeListeners();
});
onUnmounted(() => {
    if (unsubscribeSchedules) unsubscribeSchedules();
});


// Computed properties
const formattedDate = computed(() => {
    const date = new Date(selectedDate.value);
    return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });
});


// Helper functions
const isFullyCancelled = (schedules) => {
    return schedules?.find(s =>
        s.status === 'cancelled_fully' && s.cancelReason?.trim()
    );
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
const groupAndSetSchedules = (rawSchedules) => {
    if (!rawSchedules || rawSchedules.length === 0) {
        schedules.value = [];
        return;
    }

    const groupedSchedules = new Map();
    for (const scheduleDoc of rawSchedules) {
        const scheduledDate = scheduleDoc.scheduledDatetime.toDate();
        const timeKey = scheduledDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        const groupKey = `${scheduleDoc.routeId}-${scheduleDoc.type}-${timeKey}`;

        if (!groupedSchedules.has(groupKey)) {
            groupedSchedules.set(groupKey, {
                id: groupKey,
                routeId: scheduleDoc.routeId,
                routeName: getRouteName(scheduleDoc.routeId),
                type: scheduleDoc.type,
                time: timeKey,
                scheduleCount: 0,
                // assignedDrivers: new Set(),
                // assignedBuses: new Set(),
                busDriverPairs: new Set(),
                totalQueuedStudents: 0,
                allSchedules: []
            });
        }
        const group = groupedSchedules.get(groupKey);
        group.scheduleCount++;
        if (scheduleDoc.busDriverPairId) {
            group.busDriverPairs.add(scheduleDoc.busDriverPairId);
        }

        // if (scheduleDoc.driverId) {
        //     group.assignedDrivers.add(scheduleDoc.driverId);
        // }
        // if (scheduleDoc.busId) {
        //     group.assignedBuses.add(scheduleDoc.busId);
        // }

        if (scheduleDoc.rpoints && Array.isArray(scheduleDoc.rpoints)) {
            group.totalQueuedStudents += scheduleDoc.rpoints.reduce((sum, rpoint) => {
                return sum + (rpoint.queuedStudents && Array.isArray(rpoint.queuedStudents) ? rpoint.queuedStudents.length : 0);
            }, 0);
        }
        group.allSchedules.push(scheduleDoc);
    }

    const groupedScheduleList = Array.from(groupedSchedules.values()).map(group => {
        return {
            ...group,
            busDriverPairCount: group.busDriverPairs.size,
            // assignedDriverCount: group.assignedDrivers.size,
            // assignedBusCount: group.assignedBuses.size,
            status: getGroupedStatus(group.allSchedules),
            time: formatTimeString(group.time),
            busDriverPairs: undefined
            // assignedDrivers: undefined,
            // assignedBuses: undefined
        };
    });
    groupedScheduleList.sort((a, b) => {
        const timeA = new Date(`2000/01/01 ${a.time}`);
        const timeB = new Date(`2000/01:01 ${b.time}`);
        return timeA.getTime() - timeB.getTime();
    });
    schedules.value = groupedScheduleList;
};
const setupRealtimeListeners = () => {
    if (unsubscribeSchedules) unsubscribeSchedules();

    const selectedDateObj = new Date(selectedDate.value);
    selectedDateObj.setHours(0, 0, 0, 0);
    const nextDayObj = new Date(selectedDate.value);
    nextDayObj.setDate(nextDayObj.getDate() + 1);
    nextDayObj.setHours(0, 0, 0, 0);

    const startOfDayTimestamp = Timestamp.fromDate(selectedDateObj);
    const endOfDayTimestamp = Timestamp.fromDate(nextDayObj);

    const schedulesQuery = query(
        scheduleCollection,
        where("scheduledDatetime", ">=", startOfDayTimestamp),
        where("scheduledDatetime", "<", endOfDayTimestamp)
    );

    unsubscribeSchedules = onSnapshot(schedulesQuery, (snapshot) => {
        const rawSchedules = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            scheduledDatetime: doc.data().scheduledDatetime instanceof Timestamp ? doc.data().scheduledDatetime : Timestamp.fromDate(new Date(doc.data().scheduledDatetime))
        }));
        groupAndSetSchedules(rawSchedules);
    }, (error) => {
        console.error("Error listening to schedules:", error);
    });
};
const getStartOfWeek = (date) => {
    const dayOfWeek = (date.getDay() + 6) % 7;
    const monday = new Date(date);
    monday.setDate(date.getDate() - dayOfWeek);
    monday.setHours(0, 0, 0, 0);
    return monday;
};


// Date navigation functions
const navigateToToday = () => {
    selectedDate.value = new Date().toISOString().split('T')[0];
};
const navigateToYesterday = () => {
    const d = new Date(selectedDate.value);
    d.setHours(12, 0, 0, 0); 
    d.setDate(d.getDate() - 1);
    selectedDate.value = d.toISOString().split('T')[0];
};
const navigateToNextday = () => {
    const d = new Date(selectedDate.value);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    selectedDate.value = d.toISOString().split('T')[0];
};
const handleDatePickerChange = (event) => {
    selectedDate.value = event.target.value;
};

const formatLocalDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
// UI handlers
const openScheduleModal = (schedule) => {
    const scheduledDate = new Date(selectedDate.value);
    router.push({
        name: 'RouteSchedule',
        params: { id: schedule.routeId },
        query: {
            openModal: 'true',
            type: schedule.type,
            time: schedule.time.replace(/ /g, ''),
            date: selectedDate.value,
            weekStart: formatLocalDate(getStartOfWeek(scheduledDate))
        }
    });
};
const viewRouteSchedule = (schedule) => {
    router.push({ name: 'RouteSchedule', params: { id: schedule.routeId } });
};
const openDatePicker = () => {
    if (datePicker.value) {
        datePicker.value.showPicker();
    }
};


// Formatters
const formatTimeString = (input) => {
    if (input instanceof Date) {
        return input.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
    return input;
};
const getRouteName = (routeId) => {
    const routeData = routes.value.find(r => r.id === routeId);
    return routeData ? routeData.name : '-';
};
const statusClass = (status) => {
    return {
        'scheduled': 'badge bg-primary',
        'in_progress': 'badge badge-in-progress',
        'completed': 'badge bg-success',
        'cancelled': 'badge bg-secondary',
        'cancelled_fully': 'badge bg-fully-cancelled',
        'unknown': 'badge bg-danger'
    }[status] || 'badge bg-danger';
};


// Watchers
watch(selectedDate, setupRealtimeListeners);
</script>



<template>
    <div class="container-fluid py-4">
        <div class="card">
            <div class="card-header pb-0">
                <div class="d-flex align-items-center">
                    <div class="date-picker-trigger me-2" @click="openDatePicker">
                        <span>{{ formattedDate }}</span>
                        <i class="fas fa-chevron-down ms-2"></i>
                        <input type="date" ref="datePicker" v-model="selectedDate" class="visually-hidden-date-input"
                            @change="handleDatePickerChange">
                    </div>

                    <button class="arrow-nav-btn me-2" title="Previous week" @click="navigateToYesterday">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <button class="arrow-nav-btn me-2" title="Next week" @click="navigateToNextday">
                        <i class="fas fa-chevron-right"></i>
                    </button>

                    <button class="btn btn-outline-primary today-btn mb-0" @click="navigateToToday">Today</button>
                </div>
            </div>

            <div class="card-body">
                <div class="table-responsive">
                    <table class="table table-bordered text-center" style="table-layout: fixed">
                        <thead>
                            <tr>
                                <th class="text-sm text-center bg-light">Time</th>
                                <th class="text-sm text-center bg-light">Type</th>
                                <th class="text-sm text-center bg-light">Route</th>
                                <th class="text-sm text-center bg-light">Assigned</th>
                                <th class="text-sm text-center bg-light">Status</th>
                                <th class="text-sm text-center bg-light">Queue</th>
                                <th class="text-sm text-center bg-light">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="sched in schedules" :key="sched.id">
                                <td class="text-sm">{{ sched.time }}</td>
                                <td class="text-sm">{{ sched.type === 'incampus' ? 'In Campus' : sched.type ===
                                    'outcampus' ? 'Out Campus' : sched.type === 'event' ? 'Event' : sched.type }}</td>
                                <td class="text-sm text-truncate">{{ getRouteName(sched.routeId) }}</td>

                                <td class="text-sm">
                                    <button class="btn btn-custom-outline mb-0 px-3 py-2"
                                        @click="openScheduleModal(sched)">
                                        <span class="badge text-primary me-2">
                                            <i class="fas fa-user me-1"></i>
                                            {{ sched.busDriverPairCount }}
                                        </span>
                                        <span class="badge text-primary">
                                            <i class="fas fa-bus me-1"></i>
                                            {{ sched.busDriverPairCount }}
                                        </span>
                                    </button>
                                </td>
                                <td class="text-sm">
                                    <span :class="statusClass(sched.status) + ' rounded-pill px-3 py-1'">
                                        {{ sched.status.replace('_', ' ') }}
                                    </span>
                                </td>
                                <td class="text-sm queue-highlight">
                                    <strong>{{ sched.totalQueuedStudents }}</strong> students
                                </td>
                                <td>
                                    <button class="btn btn-sm btn-secondary" @click="viewRouteSchedule(sched)">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                </td>
                            </tr>
                            <tr v-if="schedules.length === 0">
                                <td :colspan="7" class="text-muted py-4">No schedules for this date</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</template>



<style scoped>
.date-picker-trigger {
    width: 220px !important;
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
.btn-sm {
    padding: 10px 20px;
    box-shadow: none !important;
}
.btn-custom-outline {
    background-color: #fff !important;
    border: 1px solid #0000ff9f !important;
    color: #0000ff9f !important;
    box-shadow: none !important;
}
.btn-custom-outline:hover {
    background-color: #0000ff9f !important;
    border-color: #fff !important;
    color: #fff !important;
}
.btn-custom-outline:hover .text-primary {
    color: #fff !important;
}
.badge {
    font-size: 1em;
    padding: 0.5em;
    display: inline-flex;
    align-items: center;
}
.badge-in-progress {
    background-color: #fd7e14;
    color: white;
}
.queue-highlight {
    font-weight: bold;
    font-size: 1.1em;
    color: #dc3545;
    background-color: #fff3cd;
    border: 2px solid #fd7e14 !important;
}
.bg-fully-cancelled {
    background-color: #f1f1f1;
    /* color: black; */
    box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.12) !important;
}
</style>
<script setup>
import { ref, onMounted, watch, onUnmounted, computed } from "vue";
import { scheduleCollection, routeCollection, rPointCollection, driverCollection, busCollection } from "@/firebase";
import { getDocs, query, where, Timestamp, onSnapshot } from "firebase/firestore";
import { useRouter } from "vue-router";
import OnTimePerformanceCard from '@/views/components/OnTimePerformanceCard.vue';


const router = useRouter();
// Reactive state
// Data state
const routes = ref([]);
const rpoints = ref([]);
const drivers = ref([]);
const buses = ref([]);
const schedules = ref([]);
const selectedScheduleGroup = ref(null);
// UI state
const datePicker = ref(null);
const selectedDate = ref('');
const showPerformanceModal = ref(false);
// Table state
const sortColumn = ref("time");
const sortDirection = ref("asc");
const currentPage = ref(1);
const itemsPerPage = ref(20);9
// Subscription state
let unsubscribeSchedules = null;


// Computed properties
const formattedDate = computed(() => {
    const date = new Date(selectedDate.value);
    return date.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "numeric",
        year: "numeric",
    });
});
const sortedSchedules = computed(() => {
    if (!sortColumn.value) return schedules.value;
    const column = sortColumn.value || "time";
    const direction = sortDirection.value || "asc";

    return [...schedules.value].sort((a, b) => {
        let valA = a[column];
        let valB = b[column];
        if (column === "time") {
            valA = new Date(`2000/01/01 ${a.time}`).getTime();
            valB = new Date(`2000/01/01 ${b.time}`).getTime();
        }
        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();
        if (valA < valB) return direction === "asc" ? -1 : 1;
        if (valA > valB) return direction === "asc" ? 1 : -1;
        return 0;
    });
});
const paginatedSchedules = computed(() => {
    const start = (currentPage.value - 1) * itemsPerPage.value;
    const end = start + itemsPerPage.value;
    return sortedSchedules.value.slice(start, end);
});
const totalItems = computed(() => sortedSchedules.value.length);
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
onMounted(async () => {
    const [routesSnap, rpointsSnap, driversSnap, busesSnap] = await Promise.all([
        getDocs(routeCollection),
        getDocs(rPointCollection),
        getDocs(driverCollection),
        getDocs(busCollection),
    ]);
    routes.value = routesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    rpoints.value = rpointsSnap.docs.map(r => ({ id: r.id, ...r.data() }));
    drivers.value = driversSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    buses.value = busesSnap.docs.map((b) => ({ id: b.id, ...b.data() }));
    selectedDate.value = getTodayLocalDate();
    setupRealtimeListeners();
});
onUnmounted(() => {
    if (unsubscribeSchedules) unsubscribeSchedules();
});


// Helper functions
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
    unsubscribeSchedules = onSnapshot(
        schedulesQuery,
        (snapshot) => {
            const rawSchedules = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
                scheduledDatetime:
                    doc.data().scheduledDatetime instanceof Timestamp
                        ? doc.data().scheduledDatetime
                        : Timestamp.fromDate(new Date(doc.data().scheduledDatetime)),
            }));
            groupAndSetSchedules(rawSchedules);
        },
        (error) => {
            console.error("Error listening to schedules:", error);
        }
    );
};
const getGroupedStatus = (schedules) => {
    if (!schedules || schedules.length === 0) {
        return "scheduled";
    }
    let hasInProgress = false;
    let hasScheduled = false;
    let hasCompleted = false;
    let allCancelled = true;

    for (const schedule of schedules) {
        if (schedule.status === "in_progress") {
            hasInProgress = true;
            break;
        }
        if (schedule.status === "completed") {
            hasCompleted = true;
        }
        if (schedule.status === "scheduled") {
            hasScheduled = true;
        }
        if (
            schedule.status !== "cancelled" &&
            schedule.status !== "cancelled_fully"
        ) {
            allCancelled = false;
        }
    }
    if (hasInProgress) {
        return "in_progress";
    } else if (hasCompleted) {
        return "completed";
    } else if (allCancelled) {
        return "cancelled";
    } else if (hasScheduled) {
        return "scheduled";
    }
    return "unknown";
};
const groupAndSetSchedules = (rawSchedules) => {
    if (!rawSchedules || rawSchedules.length === 0) {
        schedules.value = [];
        return;
    }
    const groupedSchedules = new Map();
    for (const scheduleDoc of rawSchedules) {
        const scheduledDate = scheduleDoc.scheduledDatetime.toDate();
        const timeKey = scheduledDate.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
        const groupKey = `${scheduleDoc.routeId}-${scheduleDoc.type}-${timeKey}`;

        if (!groupedSchedules.has(groupKey)) {
            groupedSchedules.set(groupKey, {
                id: groupKey,
                routeId: scheduleDoc.routeId,
                routeName: getRouteName(scheduleDoc.routeId),
                type: scheduleDoc.type,
                time: timeKey,
                scheduleCount: 0,
                busDriverPairs: new Set(),
                totalQueuedStudents: 0,
                avgLateness: null,
                allSchedules: [],
            });
        }
        const group = groupedSchedules.get(groupKey);
        group.scheduleCount++;
        if (scheduleDoc.busDriverPairId) {
            group.busDriverPairs.add(scheduleDoc.busDriverPairId);
        }
        if (scheduleDoc.rpoints && Array.isArray(scheduleDoc.rpoints)) {
            group.totalQueuedStudents += scheduleDoc.rpoints.reduce((sum, rpoint) => {
                return (
                    sum +
                    (rpoint.queuedStudents && Array.isArray(rpoint.queuedStudents)
                        ? rpoint.queuedStudents.length
                        : 0)
                );
            }, 0);
        }
        group.allSchedules.push(scheduleDoc);
    }

    for (const group of groupedSchedules.values()) {
        const inProgressSchedules = group.allSchedules.filter(s => s.status === 'in_progress');

        if (inProgressSchedules.length > 0) {
            let totalLateness = 0;
            let totalCount = 0;

            for (const schedule of inProgressSchedules) {
                if (schedule.rpoints && schedule.rpoints.length > 0) {
                    const scheduleLateness = schedule.rpoints.reduce(
                        (sum, rpoint) => sum + (rpoint.latenessMinutes || 0),
                        0
                    ) / schedule.rpoints.length;

                    totalLateness += scheduleLateness;
                    totalCount++;
                }
            }

            if (totalCount > 0) {
                group.avgLateness = Math.round(totalLateness / totalCount);
            }
        }
    }

    const groupedScheduleList = Array.from(groupedSchedules.values()).map(
        (group) => {
            return {
                ...group,
                busDriverPairCount: group.busDriverPairs.size,
                status: getGroupedStatus(group.allSchedules),
                time: formatTimeString(group.time),
                busDriverPairs: undefined,
                avgLateness: group.avgLateness
            };
        }
    );
    groupedScheduleList.sort((a, b) => {
        const timeA = new Date(`2000/01/01 ${a.time}`);
        const timeB = new Date(`2000/01:01 ${b.time}`);
        return timeA.getTime() - timeB.getTime();
    });
    schedules.value = groupedScheduleList;
};
const getStartOfWeek = (date) => {
    const dayOfWeek = (date.getDay() + 6) % 7;
    const monday = new Date(date);
    monday.setDate(date.getDate() - dayOfWeek);
    monday.setHours(0, 0, 0, 0);
    return monday;
};


// UI handlers
const getTodayLocalDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
const navigateToToday = () => {
    selectedDate.value = getTodayLocalDate();
    setupRealtimeListeners();
};
const navigateToYesterday = () => {
    const d = new Date(selectedDate.value);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - 1);
    selectedDate.value = d.toISOString().split("T")[0];
};
const navigateToNextday = () => {
    const d = new Date(selectedDate.value);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    selectedDate.value = d.toISOString().split("T")[0];
};
const handleDatePickerChange = (event) => {
    selectedDate.value = event.target.value;
};
const openScheduleModal = (schedule) => {
    const scheduledDate = new Date(selectedDate.value);
    router.push({
        name: "RouteSchedule",
        params: { id: schedule.routeId },
        query: {
            openModal: "true",
            type: schedule.type,
            time: schedule.time.replace(/ /g, ""),
            date: selectedDate.value,
            weekStart: formatLocalDate(getStartOfWeek(scheduledDate)),
        },
    });
};
const openPerformanceModal = (allSchedules) => {
    if (!allSchedules || allSchedules.length === 0) {
        console.warn("No schedule data available to show performance");
        return;
    }
    selectedScheduleGroup.value = allSchedules;
    showPerformanceModal.value = true;
};
const viewRouteSchedule = (schedule) => {
    const scheduledDate = new Date(selectedDate.value);
    router.push({
        name: "RouteSchedule",
        params: { id: schedule.routeId },
        query: {
            openModal: "false",
            type: schedule.type,
            time: schedule.time.replace(/ /g, ""),
            date: selectedDate.value,
            weekStart: formatLocalDate(getStartOfWeek(scheduledDate)),
        },
    });
};
const openDatePicker = () => {
    if (datePicker.value) {
        datePicker.value.showPicker();
    }
};
const handleSort = (column) => {
    if (column === sortColumn.value) {
        sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
    } else {
        sortColumn.value = column;
        sortDirection.value = "asc";
    }
};
const goToPage = (page) => {
    if (page >= 1 && page <= totalPages.value) {
        currentPage.value = page;
    }
};


// Formatters
const formatLocalDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};
const formatTimeString = (input) => {
    if (input instanceof Date) {
        return input.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
        });
    }
    return input;
};
const getRouteName = (routeId) => {
    const routeData = routes.value.find((r) => r.id === routeId);
    return routeData ? routeData.name : "-";
};
const statusClass = (status) => {
    const displayStatus = status === "cancelled_fully" ? "cancelled" : status;
    return (
        {
            scheduled: "badge bg-primary",
            in_progress: "badge badge-in-progress",
            completed: "badge bg-success",
            cancelled: "badge bg-secondary",
            unknown: "badge bg-danger",
        }[displayStatus] || "badge bg-danger"
    );
};
const latenessBadgeClass = (lateness) => {
    if (lateness === null || lateness === undefined) return '';
    if (lateness <= 5) return 'lateness-badge good';
    if (lateness <= 15) return 'lateness-badge warning';
    return 'lateness-badge bad';
};


// Watchers
watch(selectedDate, setupRealtimeListeners);
watch([sortColumn, sortDirection, selectedDate], () => {
    currentPage.value = 1;
});
</script>



<template>
    <div class="container-fluid py-4">
        <div class="card">
            <div class="card-header pb-0">

                <!-- Date Controls -->
                <div class="d-flex align-items-center mb-3">
                    <button class="arrow-nav-btn me-2" title="Previous week" @click="navigateToYesterday">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <div class="date-picker-trigger me-2" @click="openDatePicker">
                        <span>{{ formattedDate }}</span>
                        <i class="fas fa-chevron-down ms-2"></i>
                        <input type="date" ref="datePicker" v-model="selectedDate" class="visually-hidden-date-input"
                            @change="handleDatePickerChange" />
                    </div>
                    <button class="arrow-nav-btn me-2" title="Next week" @click="navigateToNextday">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                    <button class="btn btn-outline-primary today-btn mb-0" @click="navigateToToday">
                        Today
                    </button>
                </div>
            </div>

            <div class="card-body">
                <div class="table-responsive p-0">
                    <table class="table table-hover align-items-center justify-content-center mb-0"
                        style="table-layout: fixed">
                        <thead>
                            <tr>
                                <th class="text-uppercase text-xxs font-weight-bolder ps-2 cursor-pointer"
                                    @click="handleSort('time')">
                                    Time
                                    <i v-if="!sortColumn || sortColumn === 'time'" class="fas ms-1" :class="sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down'
                                        "></i>
                                </th>
                                <th class="text-uppercase text-xxs font-weight-bolder ps-2 cursor-pointer"
                                    @click="handleSort('type')">
                                    Type
                                    <i v-if="sortColumn === 'type'" :class="[
                                        'fas',
                                        'ms-1',
                                        sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down',
                                    ]"></i>
                                </th>
                                <th class="text-uppercase text-xxs font-weight-bolder ps-2 cursor-pointer"
                                    @click="handleSort('routeName')">
                                    Route
                                    <i v-if="sortColumn === 'routeName'" :class="[
                                        'fas',
                                        'ms-1',
                                        sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down',
                                    ]"></i>
                                </th>
                                <th class="text-uppercase text-xxs font-weight-bolder ps-2 cursor-pointer"
                                    @click="handleSort('busDriverPairCount')">
                                    Assigned
                                    <i v-if="sortColumn === 'busDriverPairCount'" :class="[
                                        'fas',
                                        'ms-1',
                                        sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down',
                                    ]"></i>
                                </th>
                                <th class="text-uppercase text-xxs font-weight-bolder ps-2 cursor-pointer"
                                    @click="handleSort('status')">
                                    Status
                                    <i v-if="sortColumn === 'status'" :class="[
                                        'fas',
                                        'ms-1',
                                        sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down',
                                    ]"></i>
                                </th>
                                <th class="text-uppercase text-xxs font-weight-bolder ps-2 cursor-pointer"
                                    @click="handleSort('totalQueuedStudents')">
                                    Queue
                                    <i v-if="sortColumn === 'totalQueuedStudents'" :class="[
                                        'fas',
                                        'ms-1',
                                        sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down',
                                    ]"></i>
                                </th>
                                <th class="text-uppercase text-xxs font-weight-bolder ps-2">
                                    Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-if="paginatedSchedules.length === 0">
                                <td :colspan="7" class="text-center py-4">
                                    No schedule found for this date
                                </td>
                            </tr>

                            <tr v-for="sched in paginatedSchedules" :key="sched.id">
                                <td class="text-sm font-weight-bold mb-0">
                                    <span v-if="sched.avgLateness !== null"
                                        :class="latenessBadgeClass(sched.avgLateness)"
                                        :title="'Average lateness: ' + sched.avgLateness + ' minutes'">
                                    </span>
                                    {{ sched.time }}
                                    <span v-if="sched.avgLateness > 0" class="lateness-text"
                                        :title="'Average lateness: ' + sched.avgLateness + ' minutes'"
                                        @click="openPerformanceModal(sched.allSchedules)">
                                        (+{{ sched.avgLateness }}m)
                                    </span>
                                </td>
                                <td class="text-sm font-weight-bold mb-0">
                                    {{
                                    sched.type === "incampus"
                                    ? "In Campus"
                                    : sched.type === "outcampus"
                                    ? "Out Campus"
                                    : sched.type === "event"
                                    ? "Event"
                                    : sched.type
                                    }}
                                </td>
                                <td class="text-truncate text-sm font-weight-bold mb-0">
                                    {{ getRouteName(sched.routeId) }}
                                </td>
                                <td class="text-sm">
                                    <button class="btn btn-custom-outline mb-0 px-2 py-2"
                                        @click="openScheduleModal(sched)">
                                        <span class="badge text-primary">
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
                                    <span :class="statusClass(sched.status) + ' rounded-pill px-3'
                                        ">
                                        {{ sched.status.replace("_", " ") }}
                                    </span>
                                </td>
                                <td class="text-sm queue-highlight font-weight-bold mb-0">
                                    <strong>{{ sched.totalQueuedStudents }}</strong> students
                                </td>
                                <td>
                                    <button class="btn btn-link text-secondary mb-0 px-1"
                                        @click="viewRouteSchedule(sched)">
                                        <i class="fas fa-pencil-alt text-xs" aria-hidden="true"></i>
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
        </div>
    </div>

    <div v-if="showPerformanceModal" class="modal fade show d-block">
        <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">On-Time Performance</h5>
                    <button type="button" class="btn-close" @click="showPerformanceModal = false"></button>
                </div>
                <div class="modal-body">
                    <div v-if="!selectedScheduleGroup || selectedScheduleGroup.length === 0"
                        class="text-center text-muted p-4">
                        No performance data available
                    </div>
                    <OnTimePerformanceCard v-else :scheduleGroup="selectedScheduleGroup" :rpoints="rpoints" />
                </div>
            </div>
        </div>
    </div>
    <div class="modal-backdrop fade show" v-if="showPerformanceModal"></div>
</template>



<style>
.badge-in-progress {
    background-color: #fd7e14;
    color: white;
}
</style>

<style scoped>
.date-picker-trigger {
    width: 160px !important;
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
.btn-custom-outline .badge {
    padding: 2px 10px !important;
}
.btn .badge:not(:last-child) {
    margin-right: 0.3rem;
}
.btn .badge:not(:first-child) {
    margin-left: 0.3rem;
}
.badge {
    font-size: 0.9em;
    display: inline-flex;
}
.queue-highlight {
    color: #dc3545;
    background-color: #fff3cd;
    border: 2px solid #fd7e14 !important;
}
.lateness-badge {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    margin-right: 6px;
    vertical-align: middle;
}
.lateness-badge.good {
    background-color: #28a745;
}
.lateness-badge.warning {
    background-color: #ffc107;
}
.lateness-badge.bad {
    background-color: #dc3545;
}
.lateness-text {
    color: #dc3545;
    margin-left: 4px;
    font-size: 0.85em;
    cursor: pointer;
    text-decoration: underline;
    transition: color 0.2s ease;
}
.lateness-text:hover {
    color: #b02a37;
    text-decoration: none;
}
</style>
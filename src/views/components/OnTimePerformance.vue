<script setup>
import { ref, computed, onMounted } from 'vue';
import { busDriverPairingCollection, driverCollection, busCollection } from '@/firebase';
import { getDocs } from 'firebase/firestore';
import ArgonButton from "@/components/ArgonButton.vue";


// Props
const props = defineProps({
  scheduleGroup: {
    type: Array,
    required: true
  },
  rpoints: {
    type: Array,
    required: true
  }
});
// Reactive state
const expandedId = ref(null);
const viewMode = ref('timeline');
const busDriverPairings = ref([]);
const drivers = ref([]);
const buses = ref([]);


// Lifecycle hooks
onMounted(async () => {
  const [pairingsSnapshot, driversSnapshot, busesSnapshot] = await Promise.all([
    getDocs(busDriverPairingCollection),
    getDocs(driverCollection),
    getDocs(busCollection)
  ]);
  busDriverPairings.value = pairingsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  drivers.value = driversSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  buses.value = busesSnapshot.docs.map(b => ({ id: b.id, ...b.data() }));
});


// Computed properties
const busAssignments = computed(() => {
  return props.scheduleGroup
    .filter(schedule => ['in_progress', 'completed'].includes(schedule.status))
    .map(schedule => {
      let driverName = 'Unassigned';
      let busNumber = 'Unassigned';
      if (schedule.busDriverPairId) {
        const pairing = busDriverPairings.value.find(p => p.id === schedule.busDriverPairId);
        if (pairing) {
          driverName = getDriverName(pairing.driverId);
          busNumber = getBusPlateNumber(pairing.busId);
        }
      }

      const stops = schedule.rpoints.map(rpoint => {
        const rpointInfo = props.rpoints.find(rp => rp.id === rpoint.rpointId) || { name: 'Unknown Stop' };
        const lateness = rpoint.latenessMinutes || 0;
        return {
          name: rpointInfo.name,
          plannedTime: rpoint.expArrTime,
          actualTime: rpoint.actArrTime,
          lateness: lateness
        };
      });

      const latenessValues = stops.map(stop => stop.lateness);
      const avgLateness = latenessValues.length > 0
        ? Math.round(latenessValues.reduce((a, b) => a + b, 0)) / latenessValues.length
        : 0;
      const maxLateness = Math.max(...latenessValues, 0);

      const onTimeCount = stops.filter(stop => stop.lateness <= 0).length;
      const onTimePercentage = stops.length > 0
        ? Math.round((onTimeCount / stops.length) * 100)
        : 100;

      return {
        id: schedule.id,
        driverName,
        busNumber,
        avgLateness,
        maxLateness,
        onTimePercentage,
        stops,
        status: schedule.status
      };
    });
});


// Helper functions
const getDriverName = (driverId) => {
  const driver = drivers.value.find(d => d.id === driverId);
  return driver ? driver.name : 'Unassigned';
};
const getBusPlateNumber = (busId) => {
  const bus = buses.value.find(b => b.id === busId);
  return bus ? bus.plateNumber : 'Unassigned';
};
const latenessClass = (minutes) => {
  if (minutes <= 0) return 'on-time';
  if (minutes <= 5) return 'minor-delay';
  return 'major-delay';
};
const formatLateness = (minutes) => {
  if (minutes < 0) return `${Math.abs(minutes)} min early`;
  if (minutes === 0) return 'On time';
  return `${minutes} min late`;
};


// UI handlers
const toggleExpand = (id) => {
  expandedId.value = expandedId.value === id ? null : id;
};
const toggleViewMode = () => {
  viewMode.value = viewMode.value === 'timeline' ? 'table' : 'timeline';
};
</script>



<template>
  <!-- View Mode Toggle Section -->
  <div v-if="busAssignments.length > 0" class="d-flex mb-4">
    <argon-button color="secondary" variant="outline" size="sm" @click="toggleViewMode">
      <i class="fas" :class="viewMode === 'timeline' ? 'fa-table' : 'fa-list'"></i>
      {{ viewMode === 'timeline' ? 'Table View' : 'Timeline View' }}
    </argon-button>
  </div>
  <div v-else class="text-center py-4">
    No performance data available for this schedule.
  </div>

  <!-- Bus Assignments List Section -->
  <div v-for="assignment in busAssignments" :key="assignment.id" class="accordion-item mb-3 rounded shadow-sm"
    :class="{ 'border-left border-5 border-primary': assignment.status === 'in_progress' }">

    <!-- Header (Clickable) -->
    <div class="accordion-header p-3 d-flex justify-content-between align-items-center"
      @click="toggleExpand(assignment.id)" :class="{ 'cursor-pointer': assignment.stops.length > 0 }">
      <div>
        <span class="fw-bold">{{ assignment.busNumber }}</span>
        <span class="ms-2">{{ assignment.driverName }}</span>
        <span v-if="assignment.status === 'in_progress'" class="badge badge-in-progress ms-2">
          In Progress
        </span>
        <span v-else-if="assignment.status === 'completed'" class="badge bg-success ms-2">
          Completed
        </span>
      </div>

      <!-- Performance Stats -->
      <div class="d-flex gap-2">
        <span class="stat-chip badge bg-light text-dark" :title="`Average Lateness: ${assignment.avgLateness} min`">
          Avg: <b>{{ assignment.avgLateness }} min</b>
        </span>
        <span class="stat-chip badge bg-light text-dark" :title="`Worst Lateness: ${assignment.maxLateness} min`">
          Max: <b>{{ assignment.maxLateness }} min</b>
        </span>
        <span class="stat-chip badge"
          :class="assignment.onTimePercentage >= 90 ? 'bg-success' : assignment.onTimePercentage >= 75 ? 'bg-warning text-dark' : 'bg-danger'"
          :title="`${assignment.onTimePercentage}% of stops were on time`">
          On-Time: <b>{{ assignment.onTimePercentage }}%</b>
        </span>
      </div>

      <!-- Expand/Collapse Icon -->
      <div class="expand-icon" v-if="assignment.stops.length > 0">
        <i class="fas" :class="expandedId === assignment.id ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
      </div>
    </div>

    <!-- Expanded Content Section -->
    <div v-if="expandedId === assignment.id && assignment.stops.length > 0" class="accordion-body p-3 pt-0">

      <!-- Timeline View -->
      <div v-if="viewMode === 'timeline'" class="timeline">
        <div v-for="(stop, index) in assignment.stops" :key="index" class="timeline-item d-flex align-items-start mb-3">
          <div class="timeline-dot rounded-circle me-3" :class="latenessClass(stop.lateness)"></div>
          <div class="timeline-content flex-grow-1">
            <div class="d-flex justify-content-between">
              <span class="text-sm fw-bold">{{ stop.name }}</span>
              <span class="text-sm">{{ stop.plannedTime }}</span>
            </div>
            <div class="d-flex justify-content-between">
              <small class="text-sm">Actual: {{ stop.actualTime || 'Not recorded' }}</small>
              <span class="timeline-lateness fw-bold" :class="latenessClass(stop.lateness)">
                {{ formatLateness(stop.lateness) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Table View -->
      <div v-else class="table-responsive p-0">
        <table class="table table-hover align-items-center justify-content-center">
          <thead>
            <tr>
              <th class="text-uppercase text-xxs font-weight-bolder ps-2">Stop</th>
              <th class="text-uppercase text-xxs font-weight-bolder ps-2">Planned Time</th>
              <th class="text-uppercase text-xxs font-weight-bolder ps-2">Actual Time</th>
              <th class="text-uppercase text-xxs font-weight-bolder ps-2 text-end">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(stop, index) in assignment.stops" :key="index">
              <td class="text-sm mb-0">{{ stop.name }}</td>
              <td class="text-sm mb-0">{{ stop.plannedTime }}</td>
              <td class="text-sm mb-0">{{ stop.actualTime || 'Not recorded' }}</td>
              <td class="mb-0 text-end fw-bold" :class="'text-' + latenessClass(stop.lateness)">
                {{ formatLateness(stop.lateness) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>



<style scoped>
.accordion-item {
  background-color: white;
  border: 1px solid rgba(0, 0, 0, 0.125);
  transition: all 0.2s ease;
}
.accordion-item:hover {
  box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075);
}
.accordion-header {
  transition: background-color 0.2s ease;
}
.accordion-header:hover {
  background-color: rgba(0, 0, 0, 0.03);
}
.stat-chip {
  font-size: 0.75rem;
  padding: 0.35em 0.65em;
  border-radius: 50rem;
}
.timeline {
  position: relative;
  padding-left: 1.5rem;
}
.timeline::before {
  left: 0.5rem;
  bottom: 0;
  width: 2px;
  background-color: #e9ecef;
}
.timeline-item {
  position: relative;
}
.timeline-dot {
  width: 1rem;
  height: 1rem;
  margin-top: 0.2rem;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}
.timeline-dot.on-time {
  background-color: #28a745;
  border: 2px solid #d4edda;
}
.timeline-dot.minor-delay {
  background-color: #ffc107;
  border: 2px solid #fff3cd;
}
.timeline-dot.major-delay {
  background-color: #dc3545;
  border: 2px solid #f8d7da;
}
.timeline-lateness.on-time {
  color: #28a745;
}
.timeline-lateness.minor-delay {
  color: #ffc107;
}
.timeline-lateness.major-delay {
  color: #dc3545;
}
.text-on-time {
  color: #28a745;
}
.text-minor-delay {
  color: #ffc107;
}
.text-major-delay {
  color: #dc3545;
}
</style>
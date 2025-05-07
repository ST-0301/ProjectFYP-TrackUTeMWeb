<script setup>
import { ref } from 'vue';
import { routeCollection } from '@/firebase';
import { addDoc, serverTimestamp } from 'firebase/firestore';
import ArgonInput from "@/components/ArgonInput.vue";
import ArgonButton from "@/components/ArgonButton.vue";
// import ArgonCheckbox from "@/components/ArgonCheckbox.vue";

const props = defineProps({ stops: Array });
const emit = defineEmits(['update-route']);

const routeName = ref('');
const routeStatus = ref('active');
const assignedBus = ref('');
const assignedDriver = ref('');
const schedule = ref({
    monThu: { in: [], out: [] },
    fri: { in: [], out: [] }
});



// Temporary time inputs
const newInTime = ref('');
const newOutTime = ref('');
function addTime(dayType, timeType) {
    const time = timeType === 'in' ? newInTime.value : newOutTime.value;
    if (time) {
        schedule.value[dayType][timeType].push(time);
        if (timeType === 'in') newInTime.value = '';
        else newOutTime.value = '';
    }
}

// Form steps control
const currentStep = ref(1);
function nextStep() {
    if (currentStep.value < 3) currentStep.value++;
}
function prevStep() {
    if (currentStep.value > 1) currentStep.value--;
}

async function emitUpdate() {
    const scheduleData = {
        monThu: {
            in: [...schedule.value.monThu.in],
            out: [...schedule.value.monThu.out]
        },
        fri: {
            in: [...schedule.value.fri.in],
            out: [...schedule.value.fri.out]
        }
    };

    const routeData = {
        name: routeName.value,
        status: routeStatus.value,
        stops: props.stops.map(stop => stop.id),
        schedule: scheduleData,
        assignments: {
            bus: assignedBus.value,
            driver: assignedDriver.value
        },
        createdAt: serverTimestamp()
    };
    console.log('Saving route data:', routeData);
    
    try {
        await addDoc(routeCollection, routeData);
        alert('Route saved successfully!');
        emit('update-route', routeData);
    } catch (err) {
        console.error('Failed to save route:', err);
        alert('Error saving route. Check console.');
    }
}
</script>

<style scoped>
.badge {
    font-size: 0.75rem;
    padding: 0.5em 0.75em;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
}
.btn-rotate {
    transform: rotate(45deg);
    padding: 0;
    line-height: 1;
}
.step-indicator {
    position: absolute;
    top: 1rem;
    right: 1rem;
    font-size: 0.9rem;
    color: #666;
}
.bg-white {
    background: white;
    z-index: 1;
}
</style>

<template>
    <div class="card d-flex flex-column">
        <div class="card-header pb-0">
            <h6>Route Creation (Step {{ currentStep }} of 3)</h6>
        </div>
        <div class="card-body d-flex flex-column">
            <div class="flex-grow-1">
                <!-- Step 1: Basic Information -->
                <div v-show="currentStep === 1" class="space-y-4">
                    <h3 class="text-sm font-weight-bold">Route Information</h3>
                    <div class="mb-3">
                        <label class="form-label">Route Name</label>
                        <ArgonInput v-model="routeName" type="text" placeholder="Route Name" required />
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Status</label>
                        <select v-model="routeStatus" class="form-select">
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>
                    <div>
                        <h3 class="text-sm font-weight-bold">Bus Stops</h3>
                        <ul class="list-group">
                            <li v-for="(stop, index) in stops" :key="stop.id"
                                class="list-group-item d-flex align-items-center">
                                <span class="badge bg-gradient-success me-2">{{ index + 1 }}</span>
                                {{ stop.title }} ({{ stop.id }})
                            </li>
                        </ul>
                    </div>

                    <!-- <div class="d-flex justify-content-between">
                    <ArgonButton color="secondary" @click="prevStep" :disabled="currentStep === 1">
                        Previous
                    </ArgonButton>
                    <ArgonButton color="success" @click="nextStep">
                        Next
                    </ArgonButton>
                </div> -->
                </div>

                <!-- Step 2: Schedule -->
                <div v-show="currentStep === 2" class="space-y-4">
                    <h3 class="text-sm font-weight-bold">Schedule Setup</h3>
                    <div v-for="(dayGroup, dayKey) in schedule" :key="dayKey" class="mb-4">
                        <h5 class="text-capitalize">{{ dayKey }}</h5>
                        <div class="row">
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label class="form-label">Inbound Times</label>
                                    <div class="d-flex gap-2 mb-2">
                                        <ArgonInput v-model="newInTime" type="time" />
                                        <ArgonButton color="info" size="sm" @click="addTime(dayKey, 'in')">
                                            Add
                                        </ArgonButton>
                                    </div>
                                    <div class="d-flex flex-wrap gap-2">
                                        <span v-for="(time, idx) in dayGroup.in" :key="idx"
                                            class="badge bg-gradient-dark">
                                            {{ time }}
                                            <button type="button" class="btn-rotate btn-link text-danger"
                                                @click="dayGroup.in.splice(idx, 1)">
                                                <i class="fas fa-times"></i>
                                            </button>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label class="form-label">Outbound Times</label>
                                    <div class="d-flex gap-2 mb-2">
                                        <ArgonInput v-model="newOutTime" type="time" />
                                        <ArgonButton color="info" size="sm" @click="addTime(dayKey, 'out')">
                                            Add
                                        </ArgonButton>
                                    </div>
                                    <div class="d-flex flex-wrap gap-2">
                                        <span v-for="(time, idx) in dayGroup.out" :key="idx"
                                            class="badge bg-gradient-dark">
                                            {{ time }}
                                            <button type="button" class="btn-rotate btn-link text-danger"
                                                @click="dayGroup.out.splice(idx, 1)">
                                                <i class="fas fa-times"></i>
                                            </button>
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- <div class="d-flex justify-content-between">
                    <ArgonButton color="secondary" @click="prevStep">
                        Previous
                    </ArgonButton>
                    <div class="d-flex gap-2">
                        <ArgonButton color="success" @click="nextStep">
                            Next
                        </ArgonButton>
                    </div>
                </div> -->
                </div>

                <!-- Step 3: Assignments -->
                <div v-show="currentStep === 3" class="space-y-4">
                    <h3 class="text-sm font-weight-bold">Assignments</h3>
                    <div class="mb-3">
                        <label class="form-label">Select Bus</label>
                        <select v-model="assignedBus" class="form-select">
                            <option value="">Select Bus (Optional)</option>
                            <option value="bus1">Bus 1</option>
                            <option value="bus2">Bus 2</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Select Driver</label>
                        <select v-model="assignedDriver" class="form-select">
                            <option value="">Select Driver (Optional)</option>
                            <option value="driver1">Driver A</option>
                            <option value="driver2">Driver B</option>
                        </select>
                    </div>
                    <!-- <div class="d-flex justify-content-between">
                    <ArgonButton color="secondary" @click="prevStep">
                        Previous
                    </ArgonButton>
                    <ArgonButton color="success" variant="gradient" @click="emitUpdate">
                        <i class="ni ni-check-bold me-1"></i> Save Route
                    </ArgonButton>
                </div> -->
                </div>
            </div>
            <div class="border-top pt-3 mt-auto bg-white" style="position: sticky; bottom: 0;">
                <div class="d-flex justify-content-between">
                    <ArgonButton v-if="currentStep > 1" color="secondary" @click="prevStep" class="me-2">
                        <i class="ni ni-bold-left me-1"></i> Previous
                    </ArgonButton>

                    <div class="ms-auto">
                        <ArgonButton v-if="currentStep < 3" color="success" @click="nextStep">
                            Next <i class="ni ni-bold-right ms-1"></i>
                        </ArgonButton>

                        <ArgonButton v-if="currentStep === 3" color="success" variant="gradient" @click="emitUpdate">
                            <i class="ni ni-check-bold me-1"></i> Save Route
                        </ArgonButton>
                    </div>
                </div>
            </div>
    </div>
    </div>
</template>
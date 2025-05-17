<script setup>
import { ref, onMounted, watch, nextTick, reactive } from 'vue';
import { deleteDoc, updateDoc, setDoc, onSnapshot, doc, getDocs, query, where, GeoPoint } from 'firebase/firestore';
import { stopCollection } from '@/firebase';
import { routeCollection } from '@/firebase';
import ArgonButton from "@/components/ArgonButton.vue";
import ArgonInput from "@/components/ArgonInput.vue";
import GoogleMapPicker from '@/views/components/GoogleMapPicker.vue';


// Reactive state
const stops = ref([]);
const routes = ref([]);
const showAddStopModal = ref(false);
const showDeleteModal = ref(false);
const editingStop = ref(false);
const currentStop = reactive(createDefaultStop());
const stopToDelete = ref(null);
const errors = ref({ name: '', location: '' });
const mapLoaded = ref(false);
const routesUsingStop = ref([]);
const DEFAULT_CENTER = { lat: 2.3114, lng: 102.3203 };
const mapCenter = ref({ ...DEFAULT_CENTER });


// Lifecycle hooks
onMounted(() => {
    const stopUnsub = onSnapshot(stopCollection, (snapshot) => {
        stops.value = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    });
    const routesUnsub = onSnapshot(routeCollection, (snapshot) => {
        routes.value = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    });
    return () => { stopUnsub(); routesUnsub(); }
});


// Helper functions
function createDefaultStop() {
    return {
        stopId: "",
        name: "",
        location: { lat: null, lng: null },
        created: null
    };
}
async function checkExistingStop() {
    const nameQuery = query(stopCollection, where("name", "==", currentStop.name));
    const locationQuery = query(stopCollection,
        where("location.lat", "==", currentStop.location.lat),
        where("location.lng", "==", currentStop.location.lng)
    );
    const [nameSnapshot, locationSnapshot] = await Promise.all([
        getDocs(nameQuery),
        getDocs(locationQuery)
    ]);
    if (editingStop.value) {
        return {
            nameExists: nameSnapshot.docs.some(doc => doc.id !== currentStop.id),
            locationExists: locationSnapshot.docs.some(doc => doc.id !== currentStop.id)
        };
    }
    return {
        nameExists: !nameSnapshot.empty,
        locationExists: !locationSnapshot.empty
    };
};
const getRouteNamesForStop = (stopId) => {
    const matchingRoutes = routes.value.filter(route =>
        route.stops && route.stops.includes(stopId)
    );
    return matchingRoutes.map(route => route.name).join(', ') || '-';
};


// Validation function
const validateForm = async () => {
    errors.value = { name: '', location: '' };
    let isValid = true;
    if (!currentStop.name.trim()) {
        errors.value.name = 'Stop name is required';
        isValid = false;
    }

    const lat = Number(currentStop.location.lat);
    const lng = Number(currentStop.location.lng);
    currentStop.location.lat = lat;
    currentStop.location.lng = lng;
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
        errors.value.location = 'Valid numeric coordinates required';
        isValid = false;
    }

    const { nameExists, locationExists } = await checkExistingStop();
    if (nameExists) {
        errors.value.name = 'Stop name already exists';
        isValid = false;
    }
    if (locationExists) {
        errors.value.location = 'Location already registered';
        isValid = false;
    }
    return isValid;
};


// CRUD operations
async function createStop() {
    try {
        const newStopRef = doc(stopCollection);
        const stopData = {
            stopId: newStopRef.id,
            name: currentStop.name,
            location: new GeoPoint( // Convert to GeoPoint
                currentStop.location.lat,
                currentStop.location.lng
            ),
            created: new Date().toISOString()
        };
        await setDoc(newStopRef, stopData);
    } catch (error) {
        console.error("Error creating stop:", error);
        throw error;
    }
}
async function updateStop() {
    const stopDocRef = doc(stopCollection, currentStop.id);
    const updates = {
        name: currentStop.name,
        location: new GeoPoint( // Convert to GeoPoint
            currentStop.location.lat,
            currentStop.location.lng
        )
    };
    await updateDoc(stopDocRef, updates);
}
async function deleteStop() {
    try {
        const routesQuery = query(routeCollection, where("stops", "array-contains", stopToDelete.value));
        const routeSnapshot = await getDocs(routesQuery);
        if (!routeSnapshot.empty) {
            const routeNames = routeSnapshot.docs.map(doc => doc.data().name).join(', ');
            errors.value.general = `Cannot delete stop. It is used in route(s): ${routeNames}. Delete the routes first.`;
            return;
        }

        const stopDocRef = doc(stopCollection, stopToDelete.value);
        await deleteDoc(stopDocRef);
        showDeleteModal.value = false;
    } catch (error) {
        console.error("Error deleting stop: ", error);
        errors.value.general = error.message;
    }
}


// UI handlers
const addStop = () => {
    Object.assign(currentStop, createDefaultStop());
    editingStop.value = false;
    mapCenter.value = { ...DEFAULT_CENTER };
    showAddStopModal.value = true;
};
const editStop = async (stop) => {
    Object.assign(currentStop, {
        ...stop,
        location: { // Convert GeoPoint to { lat, lng }
            lat: stop.location.latitude,
            lng: stop.location.longitude
        }
    });
    editingStop.value = true;
    mapCenter.value = { lat: stop.location.latitude, lng: stop.location.longitude };
    showAddStopModal.value = true;
    await nextTick();
    mapLoaded.value = true;
};
const saveStop = async () => {
    if (!await validateForm()) return;
    try {
        if (editingStop.value) {
            await updateStop();
        } else {
            await createStop();
        }
        closeModal();
    } catch (error) {
        console.error("Error saving stop:", error);
        errors.value.general = error.message;
    }
};
const confirmDelete = async (id) => {
    stopToDelete.value = id;
    const routesQuery = query(routeCollection, where("stops", "array-contains", id));
    const routeSnapshot = await getDocs(routesQuery);
    routesUsingStop.value = routeSnapshot.docs.map(doc => doc.data());
    showDeleteModal.value = true;
};
const closeModal = () => {
    showAddStopModal.value = false;
    editingStop.value = false;
    Object.assign(currentStop, createDefaultStop());
    errors.value = {
        name: '',
        location: ''
    };
};


// Formatters
const formatDateTime = (dateInput) => {
    let date;
    if (dateInput && typeof dateInput.toDate === 'function') {
        date = dateInput.toDate();
    } else {
        date = new Date(dateInput);
    }
    if (isNaN(date.getTime())) {
        return '-';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;

    return `${year}-${month}-${day}, ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
};


// Watchers
watch(() => currentStop.location, (newVal) => {
    currentStop.location.lat = Number(newVal.lat);
    currentStop.location.lng = Number(newVal.lng);
}, { deep: true, immediate: true });
</script>



<template>
    <div class="py-4 container-fluid">
        <div class="row">
            <div class="col-12">
                <div class="card mb-4">
                    <div class="card-header pb-0">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6>Bus Stop List</h6>
                            <argon-button color="success" size="sm" @click="addStop">
                                <i class="ni ni-fat-add"></i> Add Bus Stop
                            </argon-button>
                        </div>
                    </div>
                    <div class="card-body pt-0 pb-2">
                        <div class="table-responsive p-0">
                            <table class="table align-items-center justify-content-center mb-0">
                                <thead>
                                    <tr>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Stop
                                            Name</th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Location
                                        </th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Route (s)
                                        </th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Created
                                        </th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-if="stops.length === 0">
                                        <td colspan="5" class="text-center py-4">
                                            No bus stop found
                                        </td>
                                    </tr>

                                    <tr v-for="stop in stops" :key="stop.stopId">
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">{{ stop.name }}</p>
                                        </td>
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">
                                                {{ Number(stop.location.latitude).toFixed(6) }},
                                                {{ Number(stop.location.longitude).toFixed(6) }}
                                            </p>
                                        </td>
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">
                                                {{ getRouteNamesForStop(stop.id) }}
                                            </p>
                                        </td>
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">{{ formatDateTime(stop.created) }}
                                            </p>
                                        </td>

                                        <td class="align-middle">
                                            <button class="btn btn-link text-secondary mb-0 px-1"
                                                @click="editStop(stop)">
                                                <i class="fas fa-pencil-alt text-xs" aria-hidden="true"></i>
                                            </button>
                                            <button class="btn btn-link text-danger mb-0 px-1"
                                                @click="confirmDelete(stop.id)">
                                                <i class="fas fa-trash-alt text-xs" aria-hidden="true"></i>
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Add/Edit Bus Stop Modal -->
                    <div class="modal fade" :class="{ 'show d-block': showAddStopModal }" tabindex="-1" role="dialog"
                        v-if="showAddStopModal">
                        <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h5 class="modal-title">{{ editingStop ? 'Edit Bus Stop' : 'Add New Bus Stop' }}
                                    </h5>
                                    <button type="button" class="btn-close" @click="closeModal"></button>
                                </div>
                                <div class="modal-body">
                                    <form @submit.prevent="saveStop" class="row g-4">
                                        <div class="col-md-6">
                                            <div class="mb-3">
                                                <label class="form-label">Bus Stop Name</label>
                                                <argon-input v-model="currentStop.name" type="text"
                                                    placeholder="Bus stop name" required />
                                                <div v-if="errors.name" class="text-danger text-sm mt-1">{{ errors.name
                                                    }}
                                                </div>
                                            </div>

                                            <div class="mb-3">
                                                <h3 class="text-sm font-weight-bold mt-4">Coordinates</h3>
                                                <div class="row g-2">
                                                    <!-- Latitude Row -->
                                                    <div class="col-12">
                                                        <div class="row g-2 align-items-center">
                                                            <div class="col-3">
                                                                <label
                                                                    class="form-label text-muted pt-2 pb-3">Latitude:</label>
                                                            </div>
                                                            <div class="col-9">
                                                                <argon-input v-model.number="currentStop.location.lat"
                                                                    type="number" step="any" placeholder="Latitude"
                                                                    required />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <!-- Longitude Row -->
                                                    <div class="col-12">
                                                        <div class="row g-2 align-items-center">
                                                            <div class="col-3">
                                                                <label
                                                                    class="form-label text-muted pt-2 pb-3">Longitude:</label>
                                                            </div>
                                                            <div class="col-9">
                                                                <argon-input v-model.number="currentStop.location.lng"
                                                                    type="number" step="any" placeholder="Longitude"
                                                                    required />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div v-if="errors.location" class="text-danger text-sm mt-1">
                                                    {{ errors.location }}
                                                </div>
                                            </div>
                                        </div>


                                        <div class="col-md-6">
                                            <div class="h-100 d-flex flex-column">
                                                <label class="form-label">Select Location</label>
                                                <div class="text-muted text-xs">
                                                    Click on the map below to select location
                                                </div>
                                                <GoogleMapPicker v-if="showAddStopModal"
                                                    v-model:location="currentStop.location" :existing-stops="stops"
                                                    :is-editing="editingStop"
                                                    :editing-stop-id="editingStop ? currentStop.id : null"
                                                    :center="mapCenter" class="mt-3 stop-page-map flex-grow-1" />
                                            </div>
                                        </div>

                                        <div class="col-12 mt-2">
                                            <div v-if="errors.general" class="text-danger text-sm text-sm mt-2">
                                                {{ errors.general }}
                                            </div>
                                            <div class="d-flex justify-content-end gap-3 mt-2">
                                                <argon-button type="button" color="secondary" @click="closeModal">
                                                    Cancel
                                                </argon-button>
                                                <argon-button type="submit" color="success" variant="gradient">
                                                    {{ editingStop ? 'Update Bus Stop' : 'Add Bus Stop' }}
                                                </argon-button>
                                            </div>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-backdrop fade show" v-if="showAddStopModal"></div>




                    <!-- Delete Confirmation Modal -->
                    <div class="modal fade" :class="{ 'show d-block': showDeleteModal }" tabindex="-1" role="dialog"
                        v-if="showDeleteModal">
                        <div class="modal-dialog modal-dialog-centered" role="document">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h5 class="modal-title">Confirm Delete</h5>
                                    <button type="button" class="btn-close" @click="showDeleteModal = false"></button>
                                </div>
                                <div class="modal-body">
                                    <div v-if="routesUsingStop.length > 0">
                                        <p class="text-danger">This stop is used in the following routes and cannot be
                                            deleted:</p>
                                        <ul>
                                            <li v-for="route in routesUsingStop" :key="route.id">{{ route.name }}</li>
                                        </ul>
                                        <p>Please delete these routes first.</p>
                                    </div>
                                    <p v-else>Are you sure you want to delete this bus stop?</p>
                                </div>
                                <div class="modal-footer">
                                    <argon-button color="danger" @click="deleteStop"
                                        :disabled="routesUsingStop.length > 0">Delete</argon-button>
                                    <argon-button color="secondary"
                                        @click="showDeleteModal = false">Cancel</argon-button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-backdrop fade show" v-if="showDeleteModal"></div>
                </div>
            </div>
        </div>
    </div>
</template>



<style scoped>
.stop-page-map :deep(.map-container) {
    height: 400px !important;
    border-radius: 8px;
    border: 1px solid #dee2e6;
}
.stop-page-map :deep(.card) {
    height: 100%;
    margin-bottom: 0;
}
.stop-page-map :deep(.card-body) {
    height: calc(100% - 20px);
}
</style>
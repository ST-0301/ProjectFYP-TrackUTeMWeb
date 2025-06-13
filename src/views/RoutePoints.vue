<script setup>
import { ref, onMounted, watch, nextTick, reactive } from 'vue';
import { deleteDoc, updateDoc, setDoc, onSnapshot, doc, getDocs, query, where, GeoPoint } from 'firebase/firestore';
import { rPointCollection, routeCollection } from '@/firebase';
import ArgonButton from "@/components/ArgonButton.vue";
import ArgonInput from "@/components/ArgonInput.vue";
import GoogleMapPicker from '@/views/components/GoogleMapPicker.vue';


// Reactive state
const rPoints = ref([]);
const routes = ref([]);
const showAddRPointModal = ref(false);
const showDeleteModal = ref(false);
const editingRPoint = ref(false);
const currentRPoint = reactive(createDefaultRPoint());
const rPointToDelete = ref(null);
const routesUsingRPoint = ref([]);
const errors = ref({ name: '', coordinates: '', general: '' });
const mapLoaded = ref(false);
const DEFAULT_CENTER = { lat: 2.3114, lng: 102.3203 };
const mapCenter = ref({ ...DEFAULT_CENTER });


// Lifecycle hooks
onMounted(() => {
    const rPointUnsub = onSnapshot(rPointCollection, (snapshot) => {
        rPoints.value = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                coordinates: data.coordinates
                    ? {
                        latitude: data.coordinates.latitude,
                        longitude: data.coordinates.longitude
                    }
                    : null
            };
        });
    });
    const routesUnsub = onSnapshot(routeCollection, (snapshot) => {
        routes.value = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    });
    return () => { rPointUnsub(); routesUnsub(); }
});


// Helper functions
function createDefaultRPoint() {
    return {
        rPointId: "",
        name: "",
        type: "",
        coordinates: { lat: null, lng: null },
        created: null
    };
}
async function checkExistingRPoint() {
    const nameQuery = query(rPointCollection, where("name", "==", currentRPoint.name));
    const coordinatesQuery = query(rPointCollection,
        where("coordinates.lat", "==", currentRPoint.coordinates.lat),
        where("coordinates.lng", "==", currentRPoint.coordinates.lng)
    );
    const [nameSnapshot, coordinatesSnapshot] = await Promise.all([
        getDocs(nameQuery),
        getDocs(coordinatesQuery)
    ]);
    if (editingRPoint.value) {
        return {
            nameExists: nameSnapshot.docs.some(doc => doc.id !== currentRPoint.id),
            coordinatesExists: coordinatesSnapshot.docs.some(doc => doc.id !== currentRPoint.id)
        };
    }
    return {
        nameExists: !nameSnapshot.empty,
        coordinatesExists: !coordinatesSnapshot.empty
    };
};
const getRouteNamesForRPoint = (rPointId) => {
    const matchingRoutes = routes.value.filter(route =>
        route.rPoints && route.rPoints.includes(rPointId)
    );
    return matchingRoutes.map(route => route.name).join(', ') || '-';
};


// Validation function
const validateForm = async () => {
    errors.value = { name: '', type: '', coordinates: '', general: '' };
    let isValid = true;
    if (!currentRPoint.name.trim()) {
        errors.value.name = 'Location name is required';
        isValid = false;
    }
    if (!currentRPoint.type) {
        errors.value.type = 'Location type is required';
        isValid = false;
    }
    const lat = Number(currentRPoint.coordinates.lat);
    const lng = Number(currentRPoint.coordinates.lng);
    currentRPoint.coordinates.lat = lat;
    currentRPoint.coordinates.lng = lng;
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
        errors.value.coordinates = 'Valid numeric coordinates required';
        isValid = false;
    }

    const { nameExists, coordinatesExists } = await checkExistingRPoint();
    if (nameExists) {
        errors.value.name = 'Location name already exists';
        isValid = false;
    }
    if (coordinatesExists) {
        errors.value.coordinates = 'Coordinates already registered';
        isValid = false;
    }
    return isValid;
};


// CRUD operations
async function createRPoint() {
    try {
        const newRPointRef = doc(rPointCollection);
        const rPointData = {
            rPointId: newRPointRef.id,
            name: currentRPoint.name,
            type: currentRPoint.type,
            coordinates: new GeoPoint(
                currentRPoint.coordinates.lat,
                currentRPoint.coordinates.lng
            ),
            created: new Date().toISOString()
        };
        await setDoc(newRPointRef, rPointData);
    } catch (error) {
        console.error("Error creating location:", error);
        throw error;
    }
}
async function updateRPoint() {
    const rPointDocRef = doc(rPointCollection, currentRPoint.id);
    const updates = {
        name: currentRPoint.name,
        type: currentRPoint.type,
        coordinates: new GeoPoint(
            currentRPoint.coordinates.lat,
            currentRPoint.coordinates.lng
        )
    };
    await updateDoc(rPointDocRef, updates);
}
async function deleteRPoint() {
    try {
        const routesQuery = query(routeCollection, where("rPoints", "array-contains", rPointToDelete.value));
        const routeSnapshot = await getDocs(routesQuery);
        if (!routeSnapshot.empty) {
            const routeNames = routeSnapshot.docs.map(doc => doc.data().name).join(', ');
            errors.value.general = `Cannot delete location. It is used in route(s): ${routeNames}. Delete the routes first.`;
            return;
        }

        const rPointDocRef = doc(rPointCollection, rPointToDelete.value);
        await deleteDoc(rPointDocRef);
        showDeleteModal.value = false;
    } catch (error) {
        console.error("Error deleting location: ", error);
        errors.value.general = error.message;
    }
}


// UI handlers
const addRPoint = () => {
    Object.assign(currentRPoint, createDefaultRPoint());
    editingRPoint.value = false;
    mapCenter.value = { ...DEFAULT_CENTER };
    showAddRPointModal.value = true;
};
const editRPoint = async (rPoint) => {
    Object.assign(currentRPoint, {
        ...rPoint,
        coordinates: {
            lat: rPoint.coordinates?.latitude ?? rPoint.coordinates?.lat,
            lng: rPoint.coordinates?.longitude ?? rPoint.coordinates?.lng
        }
    });
    editingRPoint.value = true;
    mapCenter.value = { lat: rPoint.coordinates.latitude, lng: rPoint.coordinates.longitude };
    showAddRPointModal.value = true;
    await nextTick();
    mapLoaded.value = true;
};
const saveRPoint = async () => {
    if (!await validateForm()) return;
    try {
        if (editingRPoint.value) {
            await updateRPoint();
        } else {
            await createRPoint();
        }
        closeModal();
    } catch (error) {
        console.error("Error saving location:", error);
        errors.value.general = error.message;
    }
};
const confirmDelete = async (id) => {
    rPointToDelete.value = id;
    const routesQuery = query(routeCollection, where("rPoints", "array-contains", id));
    const routeSnapshot = await getDocs(routesQuery);
    routesUsingRPoint.value = routeSnapshot.docs.map(doc => doc.data());
    showDeleteModal.value = true;
};
const closeModal = () => {
    showAddRPointModal.value = false;
    editingRPoint.value = false;
    Object.assign(currentRPoint, createDefaultRPoint());
    errors.value = {name: '', coordinates: '', general: ''};
};


// Formatters
const formatCoordinates = (coords) => {
    if (!coords) return 'N/A';
    const lat = coords.latitude ?? coords.lat;
    const lng = coords.longitude ?? coords.lng;
    if (lat === undefined || lng === undefined) return 'N/A';

    return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
};
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


// Watcher
watch(() => currentRPoint.coordinates, (newVal) => {
    currentRPoint.coordinates.lat = Number(newVal.lat);
    currentRPoint.coordinates.lng = Number(newVal.lng);
}, { deep: true, immediate: true });
</script>



<template>
    <div class="py-4 container-fluid">
        <div class="row">
            <div class="col-12">
                <div class="card mb-4">
                    <div class="card-header pb-0">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6>Location List</h6>
                            <argon-button color="success" size="sm" @click="addRPoint">
                                <i class="ni ni-fat-add"></i> Add Location
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
                                            Location Name</th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Coordinates
                                        </th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Route (s)
                                        </th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Type
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
                                    <tr v-if="rPoints.length === 0">
                                        <td colspan="6" class="text-center py-4">
                                            No location found
                                        </td>
                                    </tr>

                                    <tr v-for="rPoint in rPoints" :key="rPoint.rPointId">
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">{{ rPoint.name }}</p>
                                        </td>
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">
                                                {{ formatCoordinates(rPoint.coordinates) }}
                                            </p>
                                        </td>
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">
                                                {{ getRouteNamesForRPoint(rPoint.id) }}
                                            </p>
                                        </td>
                                        <td>
                                            <span class="badge badge-sm" :class="{
                                                'bg-gradient-success': rPoint.type === 'bus_stop',
                                                'bg-gradient-secondary': rPoint.type === 'event'
                                            }">
                                                {{ rPoint.type === 'bus_stop' ? 'Bus Stop' : 'Event Location' }}
                                            </span>
                                        </td>
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">{{
                                                formatDateTime(rPoint.created) }}
                                            </p>
                                        </td>

                                        <td class="align-middle">
                                            <button class="btn btn-link text-secondary mb-0 px-1"
                                                @click="editRPoint(rPoint)">
                                                <i class="fas fa-pencil-alt text-xs" aria-hidden="true"></i>
                                            </button>
                                            <button class="btn btn-link text-danger mb-0 px-1"
                                                @click="confirmDelete(rPoint.id)">
                                                <i class="fas fa-trash-alt text-xs" aria-hidden="true"></i>
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Add/Edit Location Modal -->
                    <div class="modal fade" :class="{ 'show d-block': showAddRPointModal }" tabindex="-1" role="dialog"
                        v-if="showAddRPointModal">
                        <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h5 class="modal-title">{{ editingRPoint ? 'Edit Location' : 'Add New Location' }}
                                    </h5>
                                    <button type="button" class="btn-close" @click="closeModal"></button>
                                </div>
                                <div class="modal-body">
                                    <form @submit.prevent="saveRPoint" class="row g-4">
                                        <div class="col-md-6">
                                            <div class="mb-3">
                                                <label class="form-label">Location Name</label>
                                                <argon-input v-model="currentRPoint.name" type="text"
                                                    placeholder="Location name" required />
                                                <div v-if="errors.name" class="text-danger text-sm mt-1">{{ errors.name
                                                    }}
                                                </div>
                                            </div>

                                            <div class="mb-3">
                                                <label class="form-label">Location Type</label>
                                                <select v-model="currentRPoint.type" class="form-select" required>
                                                    <option disabled value="">Select a type</option>
                                                    <option value="bus_stop">Bus Stop</option>
                                                    <option value="event">Event Location</option>
                                                </select>
                                                <div v-if="errors.type" class="text-danger text-sm mt-1">
                                                    {{ errors.type }}
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
                                                                <argon-input
                                                                    v-model.number="currentRPoint.coordinates.lat"
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
                                                                <argon-input
                                                                    v-model.number="currentRPoint.coordinates.lng"
                                                                    type="number" step="any" placeholder="Longitude"
                                                                    required />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div v-if="errors.coordinates" class="text-danger text-sm mt-1">
                                                    {{ errors.coordinates }}
                                                </div>
                                            </div>
                                        </div>


                                        <div class="col-md-6">
                                            <div class="h-100 d-flex flex-column">
                                                <label class="form-label">Select Location</label>
                                                <div class="text-muted text-xs">
                                                    Click on the map below to select location
                                                </div>
                                                <GoogleMapPicker v-if="showAddRPointModal"
                                                    v-model:coordinates="currentRPoint.coordinates"
                                                    :existing-rPoints="rPoints" :is-editing="editingRPoint"
                                                    :editing-rPoint-id="editingRPoint ? currentRPoint.id : null"
                                                    :center="mapCenter" class="mt-3 rpoint-page-map flex-grow-1" />
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
                                                    {{ editingRPoint ? 'Update Location' : 'Add Location' }}
                                                </argon-button>
                                            </div>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-backdrop fade show" v-if="showAddRPointModal"></div>




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
                                    <div v-if="routesUsingRPoint.length > 0">
                                        <p class="text-danger">This location is used in the following routes and
                                            cannot be deleted:</p>
                                        <ul>
                                            <li v-for="route in routesUsingRPoint" :key="route.id">{{ route.name }}</li>
                                        </ul>
                                        <p>Please delete these routes first.</p>
                                    </div>
                                    <p v-else>Are you sure you want to delete this location?</p>
                                </div>
                                <div class="modal-footer">
                                    <argon-button color="danger" @click="deleteRPoint"
                                        :disabled="routesUsingRPoint.length > 0">Delete</argon-button>
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
.rpoint-page-map :deep(.map-container) {
    height: 400px !important;
    border-radius: 8px;
    border: 1px solid #dee2e6;
}
.rpoint-page-map :deep(.card) {
    height: 100%;
    margin-bottom: 0;
}
.rpoint-page-map :deep(.card-body) {
    height: calc(100% - 20px);
}
</style>
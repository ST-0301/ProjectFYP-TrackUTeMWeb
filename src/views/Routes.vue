<script setup>
import { ref, onMounted, reactive, watch, computed } from 'vue';
import { updateDoc, setDoc, onSnapshot, doc, getDoc, getDocs, query, where, deleteDoc, writeBatch, GeoPoint } from 'firebase/firestore'; 
import { routeCollection, rPointCollection, scheduleCollection, db } from '@/firebase';
import GoogleMapPicker from '@/views/components/GoogleMapPicker.vue';
import ArgonButton from "@/components/ArgonButton.vue";
import ArgonInput from "@/components/ArgonInput.vue";


// Reactive state
const routes = ref([]);
const rPoints = ref([]);
const showAddRouteModal = ref(false);
const showDeleteModal = ref(false);
const editingRoute = ref(false);
const currentRoute = reactive(createDefaultRoute());
const rPointSelectionMode = ref('regular'); // 'regular' or 'event'
const pendingPinpoint = ref(null);
const pendingRPointId = ref(null);
const pendingName = ref('');
const editingPinpointIndex = ref(null);
const routeToDelete = ref(null);
const schedulesUsingRoute = ref([]);
const errors = ref({ name: '', rPoints: '', generaL: '' });
const DEFAULT_CENTER = { lat: 2.3114, lng: 102.3203 };
const mapCenter = ref({ ...DEFAULT_CENTER });


// Lifecycle hooks
onMounted(() => {
    const routesUnsub = onSnapshot(routeCollection, (snapshot) => {
        routes.value = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    });
    const rPointUnsub = onSnapshot(rPointCollection, (snapshot) => {
        rPoints.value = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    });
    return () => { routesUnsub(); rPointUnsub(); }
});


// Computed Properties
const computedEventMarkers = computed(() => {
    if (editingPinpointIndex.value !== null) {
        const pinpoint = currentRoute.rPoints[editingPinpointIndex.value];
        return [pinpoint];
    }
    return currentRoute.rPoints.filter(s => s.type === 'event');
});


// Helper functions
function createDefaultRoute() {
    return {
        routeId: "",
        name: "",
        rPoints: [],
        created: null
    };
}
const getRPointName = (rPointData) => {
    if (rPointData.type === 'regular') {
        const rPoint = rPoints.value.find(s => s.id === rPointData.id);
        return rPoint ? rPoint.name : 'Unknown Bus Stops';
    } else if (rPointData.type === 'event') {
        return rPointData.name || 'Unnamed Event Location';
    }
    return '';
};
const getPreviewRPointNames = rPointList => {
    if (!Array.isArray(rPointList) || rPointList.length === 0) return '-';
    const names = rPointList.map(rPointData => getRPointName(rPointData));
    if (names.length <= 4) return names.join(', ');
    const firstThree = names.slice(0, 3);
    const last = names[names.length - 1];
    return [...firstThree, '...', last].join(', ');
};


// Validation function
async function validateRoute() {
    errors.value = { name: '', rPoints: '', generaL: '' };
    let isValid = true;

    if (!currentRoute.name.trim()) {
        errors.value.name = 'Route name is required';
        isValid = false;
    }
    if (!currentRoute.rPoints || currentRoute.rPoints.length < 2) {
        errors.value.rPoints = 'At least 2 locations is required';
        isValid = false;
    }
    const nameQuery = query(routeCollection, where("name", "==", currentRoute.name));
    const snapshot = await getDocs(nameQuery);

    if (editingRoute.value) {
        if (snapshot.docs.some(doc => doc.id !== currentRoute.id)) {
            errors.value.name = 'Route name already exists';
            isValid = false;
        }
    } else {
        if (!snapshot.empty) {
            errors.value.name = 'Route name already exists';
            isValid = false;
        }
    }
    return isValid;
}


// CRUD operations
async function saveRoute() {
    if (!await validateRoute()) return;

    try {
        const routeRPoints = [];
        const batch = writeBatch(db);

        let originalEventRPoints = [];
        if (editingRoute.value) {
            const eventRPointIds = (currentRoute.rPoints || [])
                .filter(rp => rp.type === 'event' && rp.id)
                .map(rp => rp.id);
            if (eventRPointIds.length) {
                const q = query(rPointCollection, where('__name__', 'in', eventRPointIds));
                const snap = await getDocs(q);
                originalEventRPoints = snap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
            }
        }

        for (const rPointData of currentRoute.rPoints) {
            if (rPointData.type === 'regular') {
                routeRPoints.push(rPointData.id);
            } else if (rPointData.type === 'event') {
                const geoCoordinates = new GeoPoint(rPointData.coordinates.latitude, rPointData.coordinates.longitude);
                if (rPointData.id) {
                    const original = originalEventRPoints.find(o => o.id === rPointData.id);
                    const nameChanged = original && original.name !== rPointData.name;
                    const latChanged = original && original.coordinates.latitude !== rPointData.coordinates.latitude;
                    const lngChanged = original && original.coordinates.longitude !== rPointData.coordinates.longitude;

                    if (nameChanged || latChanged || lngChanged) {
                        const rPointRef = doc(rPointCollection, rPointData.id);
                        batch.update(rPointRef, {
                            name: rPointData.name,
                            coordinates: geoCoordinates
                        });
                    }
                    routeRPoints.push(rPointData.id);
                } else {
                    const newRPointRef = doc(rPointCollection);
                    const newRPointData = {
                        name: rPointData.name,
                        // type: 'event',
                        coordinates: geoCoordinates,
                        created: new Date().toISOString()
                    };
                    batch.set(newRPointRef, { ...newRPointData, rPointId: newRPointRef.id });
                    routeRPoints.push(newRPointRef.id);
                }
            }
        }
        await batch.commit();

        let routeType = rPointSelectionMode.value;
        if (editingRoute.value) {
            const existingRouteDoc = await getDoc(doc(routeCollection, currentRoute.id));
            if (existingRouteDoc.exists()) {
                routeType = existingRouteDoc.data().type;
            }
        }
        const routeData = {
            name: currentRoute.name,
            type: routeType,
            rPoints: routeRPoints,
            created: currentRoute.created || new Date().toISOString()
        };
        if (editingRoute.value) {
            await updateDoc(doc(routeCollection, currentRoute.id), routeData);
        } else {
            const newRouteRef = doc(routeCollection);
            await setDoc(newRouteRef, { ...routeData, routeId: newRouteRef.id });
        }
        closeModal();
    } catch (error) {
        console.error("Error saving route:", error);
        errors.value.general = "Failed to save route. Please check your connection."; //Set a general error
    }
}
const deleteRoute = async () => {
    try {
        const routeId = routeToDelete.value;
        const scheduleQuery = query(scheduleCollection, where('routeId', '==', routeId));
        const scheduleSnapshot = await getDocs(scheduleQuery);
        if (!scheduleSnapshot.empty) {
            errors.value.general = `Cannot delete route. It has ${scheduleSnapshot.size} scheduled trip(s). Delete them first.`;
            return;
        }

        const routeDocRef = doc(routeCollection, routeId);
        await deleteDoc(routeDocRef);
        showDeleteModal.value = false;
    } catch (error) {
        console.error("Error deleting route:", error);
        errors.value.general = error.message;
    }
};


// UI handlers
const addRoute = () => {
    Object.assign(currentRoute, createDefaultRoute());
    editingRoute.value = false;
    mapCenter.value = { ...DEFAULT_CENTER };
    rPointSelectionMode.value = 'regular';
    showAddRouteModal.value = true;
};
const editRoute = (route) => {
    Object.assign(currentRoute, { ...route });
    editingRoute.value = true;
    rPointSelectionMode.value = route.type;

    if (route.type === 'regular') {
        currentRoute.rPoints = route.rPoints.map(rPointId => ({
            type: 'regular',
            id: rPointId
        }));

        if (route.rPoints.length) {
            const firstRPoint = rPoints.value.find(s => s.id === route.rPoints[0]);
            if (firstRPoint) mapCenter.value = {
                lat: firstRPoint.coordinates.latitude,
                lng: firstRPoint.coordinates.longitude
            };
        }
    } else {
        currentRoute.rPoints = route.rPoints.map(rPointId => {
            const rPoint = rPoints.value.find(s => s.id === rPointId);
            return rPoint ? {
                type: 'event',
                id: rPointId,
                name: rPoint.name,
                coordinates: rPoint.coordinates
            } : null;
        }).filter(Boolean);

        if (currentRoute.rPoints.length) {
            mapCenter.value = {
                lat: currentRoute.rPoints[0].coordinates.latitude,
                lng: currentRoute.rPoints[0].coordinates.longitude
            };
        }
    }
    showAddRouteModal.value = true;
};
const confirmDelete = async (id) => {
    routeToDelete.value = id;
    const scheduleQuery = query(routeCollection, where("routeId", "==", id));
    const scheduleSnapshot = await getDocs(scheduleQuery);
    schedulesUsingRoute.value = scheduleSnapshot.docs.map(doc => doc.data());
    showDeleteModal.value = true;
};
const closeModal = () => {
    showAddRouteModal.value = false;
    editingRoute.value = false;
    Object.assign(currentRoute, createDefaultRoute());
    errors.value = { name: '', rPoints: '', generaL: '' };
};
function handleMarkerClick(rPointInfo) {
    if (rPointSelectionMode.value === 'regular' && rPointInfo.id) {
        const rPointId = rPointInfo.id;
        if (!currentRoute.rPoints.some(s => s.type === 'regular' && s.id === rPointId)) {
            currentRoute.rPoints.push({ type: 'regular', id: rPointId });
        }
    } else if (rPointSelectionMode.value === 'event' && rPointInfo.position) {
        if (editingPinpointIndex.value !== null) {
            pendingPinpoint.value = {
                latitude: rPointInfo.position.lat,
                longitude: rPointInfo.position.lng
            };
        } else {
            pendingPinpoint.value = {
                latitude: rPointInfo.position.lat,
                longitude: rPointInfo.position.lng
            };
        }
    }
};
function handlePinpointDrag({ position }) {
    const lat = position.lat;
    const lng = position.lng;
    if (!pendingPinpoint.value) {
        pendingPinpoint.value = { latitude: lat, longitude: lng };
    } else {
        pendingPinpoint.value.latitude = lat;
        pendingPinpoint.value.longitude = lng;
        pendingPinpoint.value = { ...pendingPinpoint.value };
    }

    if (editingPinpointIndex.value !== null) {
        const rPoint = currentRoute.rPoints[editingPinpointIndex.value];
        if (rPoint) {
            rPoint.coordinates = { latitude: lat, longitude: lng };
        }
    }
}
async function confirmPinpoint() {
    if (!pendingName.value.trim() || !pendingPinpoint.value) return;
    const newPinpoint = {
        type: 'event',
        name: pendingName.value.trim(),
        coordinates: { ...pendingPinpoint.value }
    };
    if (editingPinpointIndex.value !== null) {
        const original = currentRoute.rPoints[editingPinpointIndex.value];
        if (original && original.id) {
            newPinpoint.id = original.id;
        }
        currentRoute.rPoints[editingPinpointIndex.value] = newPinpoint;
    } else {
        currentRoute.rPoints.push(newPinpoint);
    }
    pendingPinpoint.value = null;
    pendingName.value = '';
    editingPinpointIndex.value = null;
    pendingRPointId.value = null;
}
async function startEditPinpoint(i) {
    const rPoint = currentRoute.rPoints[i];
    if (!rPoint || !rPoint.id) return;

    const rPointDocRef = doc(rPointCollection, rPoint.id);
    const rPointDocSnap = await getDoc(rPointDocRef);
    if (rPointDocSnap.exists()) {
        const data = rPointDocSnap.data();
        pendingPinpoint.value = {
            latitude: data.coordinates.latitude,
            longitude: data.coordinates.longitude
        };
        pendingName.value = data.name;
        editingPinpointIndex.value = i;
        pendingRPointId.value = rPoint.id;
        rPointSelectionMode.value = 'event';
    } else {
        pendingPinpoint.value = { ...rPoint.coordinates };
        pendingName.value = rPoint.name;
        editingPinpointIndex.value = i;
        pendingRPointId.value = rPoint.id || null;
        rPointSelectionMode.value = 'event';
    }
}
const removeRPoint = (index) => {
    currentRoute.rPoints.splice(index, 1);
};
function handleModeChange() {
    currentRoute.rPoints = [];
    pendingPinpoint.value = null;
    pendingName.value = '';
    editingPinpointIndex.value = null;
    errors.value.rPoints = '';
}


// Formatter
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
watch(() => currentRoute.rPoints, () => {
    if (currentRoute.rPoints && currentRoute.rPoints.length > 0) {
        errors.value.rPoints = '';
    }
}, { deep: true });
watch(editingRoute, (newValue) => {
    if (newValue) {
        rPointSelectionMode.value = 'regular';
    }
});
</script>



<template>
    <div class="py-4 container-fluid">
        <div class="row">
            <div class="col-12">
                <div class="card mb-4">
                    <div class="card-header pb-0">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6>Route List</h6>
                            <argon-button color="success" size="sm" @click="addRoute">
                                <i class="ni ni-fat-add"></i> Add Route
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
                                            Route Name</th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Route Points</th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Type</th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Created</th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-if="routes.length === 0">
                                        <td colspan="4" class="text-center py-4">
                                            No routes found
                                        </td>
                                    </tr>
                                    <tr v-for="route in routes" :key="route.id">
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0 px-2">{{ route.name }}</p>
                                        </td>
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">
                                                {{getPreviewRPointNames((route.rPoints || []).map(id => ({
                                                type: 'regular', id: id
                                                }))) }}
                                            </p>
                                        </td>
                                        <td>
                                            <span class="badge badge-sm" :class="{
                                                'bg-gradient-success': route.type === 'regular',
                                                'bg-gradient-secondary': route.type === 'event'
                                            }">
                                                {{ route.type }}
                                            </span>
                                        </td>
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">{{ formatDateTime(route.created) }}
                                            </p>
                                        </td>
                                        <td class="align-middle">
                                            <button class="btn btn-link text-secondary mb-0 px-1"
                                                @click="editRoute(route)">
                                                <i class="fas fa-pencil-alt text-xs" aria-hidden="true"></i>
                                            </button>
                                            <button class="btn btn-link text-danger mb-0 px-1"
                                                @click="confirmDelete(route.id)">
                                                <i class="fas fa-trash-alt text-xs" aria-hidden="true"></i>
                                            </button>
                                            <router-link :to="{
                                                path: `/routes/${route.id}/schedule`,
                                                query: { name: route.name }
                                            }" class="btn btn-link text-info mb-0 px-1">
                                                <i class="fas fa-calendar-alt text-xs" aria-hidden="true"></i>
                                            </router-link>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Add/Edit Route Modal -->
                    <div class="modal fade" :class="{ 'show d-block': showAddRouteModal }" tabindex="-1" role="dialog"
                        v-if="showAddRouteModal">
                        <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h5 class="modal-title">{{ editingRoute ? 'Edit Route' : 'Add New Route' }}</h5>
                                    <button type="button" class="btn-close" @click="closeModal"></button>
                                </div>
                                <div class="modal-body">
                                    <form @submit.prevent="saveRoute" class="row g-4">
                                        <div class="col-md-6">
                                            <div class="mb-3">
                                                <label class="form-label">Route Name</label>
                                                <argon-input v-model="currentRoute.name" type="text"
                                                    placeholder="Route name" />
                                                <div v-if="errors.name" class="text-danger text-sm mt-1">{{ errors.name
                                                    }}
                                                </div>
                                            </div>

                                            <!-- Left pane -->
                                            <div class="mb-3">
                                                <label class="form-label">Bus Stops / Event Locations</label>
                                                <div class="d-flex mb-3" v-if="!editingRoute">
                                                    <div class="form-check me-3">
                                                        <input class="form-check-input" type="radio" id="regular"
                                                            value="regular" v-model="rPointSelectionMode"
                                                            @change="handleModeChange">
                                                        <label class="form-check-label" for="regular">
                                                            Pick from existing Bus Stops (for regular routes)
                                                        </label>
                                                    </div>
                                                    <div class="form-check">
                                                        <input class="form-check-input" type="radio" id="event"
                                                            value="event" v-model="rPointSelectionMode"
                                                            @change="handleModeChange">
                                                        <label class="form-check-label" for="event">
                                                            Drop a new Event Location on the map (for event routes)
                                                        </label>
                                                    </div>
                                                </div>

                                                <div v-if="pendingPinpoint" class="mb-3">
                                                    <!-- <label class="form-label">Name for your new event location:</label> -->
                                                    <div class="d-flex">
                                                        <argon-input type="text" v-model="pendingName"
                                                            placeholder="Name" class="me-2" />
                                                        <button class="btn btn-success" :disabled="!pendingName.trim()"
                                                            @click="confirmPinpoint">
                                                            ✓
                                                        </button>
                                                        <button class="btn btn-outline-secondary ms-2"
                                                            @click="pendingPinpoint = null">
                                                            ✕
                                                        </button>
                                                    </div>
                                                    <small class="text-muted">
                                                        Lat: {{ pendingPinpoint.latitude?.toFixed(6) ?? 'N/A' }},
                                                        Lng: {{ pendingPinpoint.longitude?.toFixed(6) ?? 'N/A' }}
                                                    </small>
                                                </div>

                                                <ul class="list-group">
                                                    <li v-for="(rPointData, index) in currentRoute.rPoints" :key="index"
                                                        class="list-group-item d-flex justify-content-between align-items-center">
                                                        <div class="d-flex align-items-center">
                                                            <span class="badge bg-gradient-success me-2">{{ index + 1
                                                                }}</span>
                                                            <span v-if="rPointData.type === 'regular'">
                                                                {{ getRPointName(rPointData) }}
                                                            </span>
                                                            <span v-else>{{ rPointData.name }}</span>
                                                        </div>
                                                        <div class="d-flex align-items-center">
                                                            <button v-if="rPointData.type === 'event'" type="button"
                                                                class="btn btn-sm btn-outline-primary me-2 mb-0"
                                                                @click="startEditPinpoint(index)">
                                                                <i class="fas fa-pencil-alt"></i>
                                                            </button>
                                                            <button type="button" class="btn btn-sm btn-danger mb-0"
                                                                @click="removeRPoint(index)">
                                                                <i class="fas fa-trash"></i>
                                                            </button>
                                                        </div>
                                                    </li>
                                                </ul>
                                                <div v-if="errors.rPoints" class="text-danger text-sm mb-2">{{
                                                    errors.rPoints }}</div>
                                            </div>
                                        </div>

                                        <!-- Right pane (Map) -->
                                        <div class="col-md-6">
                                            <div class="h-100 d-flex flex-column">
                                                <label class="form-label">Bus Stops / Event Locations</label>
                                                <div class="text-muted text-xs">
                                                    <span v-if="rPointSelectionMode === 'regular'">Tap a bus-stop marker
                                                        on the map to add it.</span>
                                                    <span v-else-if="rPointSelectionMode === 'event'">Click anywhere on
                                                        the map to drop a new event pick-up/drop-off point.</span>
                                                </div>
                                                <GoogleMapPicker v-if="showAddRouteModal"
                                                    :existing-rPoints="rPointSelectionMode === 'regular' ? rPoints : []"
                                                    :event-rPoints="computedEventMarkers" :center="mapCenter"
                                                    :enable-click-to-add="rPointSelectionMode === 'event'"
                                                    :enable-draggable-markers="rPointSelectionMode === 'event'"
                                                    :coordinates="pendingPinpoint ? { lat: pendingPinpoint.latitude, lng: pendingPinpoint.longitude } : { lat: null, lng: null }"
                                                    @marker-clicked="handleMarkerClick"
                                                    @marker-added="handleMarkerClick"
                                                    @marker-dragged="handlePinpointDrag"
                                                    class="mt-3 rpoint-page-map flex-grow-1" />
                                                <!-- <GoogleMapPicker v-if="showAddRouteModal" :center="mapCenter"
                                                    :existing-rPoints="rPointSelectionMode === 'regular' ? rPoints : []"
                                                    :event-rPoints="computedEventMarkers"
                                                    :enable-click-to-add="rPointSelectionMode === 'event' && editingPinpointIndex === null"
                                                    :enable-draggable-markers="rPointSelectionMode === 'event'"
                                                    :coordinates="rPointSelectionMode === 'event' && pendingPinpoint ? { lat: pendingPinpoint.latitude, lng: pendingPinpoint.longitude } : { lat: null, lng: null }"
                                                    @marker-clicked="handleMarkerClick"
                                                    @marker-added="handleMarkerClick"
                                                    @marker-dragged="handlePinpointDrag"
                                                    class="mt-3 rpoint-page-map flex-grow-1" /> -->
                                            </div>
                                        </div>

                                        <div class="col-12 mt-2">
                                            <div v-if="errors.general" class="text-danger text-sm text-sm mt-2">
                                                {{ errors.general }}
                                            </div>
                                            <div class="d-flex justify-content-end gap-3 mt-4">
                                                <argon-button type="button" color="secondary" @click="closeModal">
                                                    Cancel
                                                </argon-button>
                                                <router-link :to="{
                                                    path: `/routes/${currentRoute.id}/schedule`,
                                                    query: { name: currentRoute.name }
                                                }" v-if="editingRoute">
                                                    <argon-button type="button" color="info" class="me-2">
                                                        Manage Schedule
                                                    </argon-button>
                                                </router-link>
                                                <argon-button type="submit" color="success" variant="gradient">
                                                    {{ editingRoute ? 'Update Route' : 'Add Route' }}
                                                </argon-button>
                                            </div>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-backdrop fade show" v-if="showAddRouteModal"></div>


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
                                    <div v-if="schedulesUsingRoute.length > 0">
                                        <p class="text-danger">This route is currently assigned to one or more
                                            schedules. <br>
                                            To delete this route, you must first remove it from all
                                            associated schedules.
                                        </p>
                                    </div>
                                    <p v-else>Are you sure you want to delete this route?</p>
                                </div>
                                <div class="modal-footer">
                                    <argon-button color="danger" @click="deleteRoute"
                                        :disabled="schedulesUsingRoute.length > 0">Delete</argon-button>
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
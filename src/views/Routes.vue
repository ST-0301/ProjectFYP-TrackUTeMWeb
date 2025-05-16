<script setup>
import { ref, onMounted, reactive, watch } from 'vue';
import { updateDoc, setDoc, onSnapshot, doc, getDocs, query, where, collection, writeBatch } from 'firebase/firestore'; 
import { routeCollection, stopCollection, db } from '@/firebase';
import GoogleMapPicker from '@/views/components/GoogleMapPicker.vue';
import ArgonButton from "@/components/ArgonButton.vue";
import ArgonInput from "@/components/ArgonInput.vue";


// Reactive state
const routes = ref([]);
const stops = ref([]);
const showAddRouteModal = ref(false);
const showDeleteModal = ref(false);
const editingRoute = ref(false);
const currentRoute = reactive(createDefaultRoute());
const routeToDelete = ref(null);
const errors = ref({ name: '', stops: '' });
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
    const stopUnsub = onSnapshot(stopCollection, (snapshot) => {
        stops.value = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    });
    return () => { routesUnsub(); stopUnsub(); }
});


// Helper functions
function createDefaultRoute() {
    return {
        routeId: "",
        name: "",
        stops: [],
        created: null
    };
}
const getStopName = (stopId) => {
    const stop = stops.value.find(s => s.id === stopId);
    return stop ? stop.name : 'Unknown Stop';
};
const getPreviewStopNames = stopIds => {
    if (!Array.isArray(stopIds) || stopIds.length === 0) return '-';
    const map = stops.value.reduce((a, s) => { a[s.id] = s.name; return a; }, {});
    const names = stopIds.map(id => map[id] || 'Unknown Stop');
    if (names.length <= 4) return names.join(', ');
    const firstThree = names.slice(0, 3);
    const last = names[names.length - 1];
    return [...firstThree, '...', last].join(', ');
};


// Validation functions
async function validateRoute() {
    errors.value = { name: '', stops: '' };
    let isValid = true;

    if (!currentRoute.name.trim()) {
        errors.value.name = 'Route name is required';
        isValid = false;
    }
    if (!currentRoute.stops || currentRoute.stops.length < 2) {
        errors.value.stops = 'At least 2 stops is required';
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
        const routeData = {
            name: currentRoute.name,
            stops: currentRoute.stops,
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


// UI handlers
const addRoute = () => {
    Object.assign(currentRoute, createDefaultRoute());
    editingRoute.value = false;
    mapCenter.value = { ...DEFAULT_CENTER };
    showAddRouteModal.value = true;
};
const editRoute = (route) => {
    Object.assign(currentRoute, route);
    editingRoute.value = true;
    if (route.stops.length) { 
        const firstStop = stops.value.find(s => s.id === route.stops[0]);
        if (firstStop) mapCenter.value = {
            lat: firstStop.location.latitude,
            lng: firstStop.location.longitude
        };
    }
    showAddRouteModal.value = true;
};
const confirmDelete = (id) => {
    routeToDelete.value = id;
    showDeleteModal.value = true;
};
const deleteRoute = async () => {
    try {
        const routeId = routeToDelete.value;
        const routeDocRef = doc(routeCollection, routeId);

        // 1. Delete schedule subcollection
        const scheduleColRef = collection(db, `routes/${routeId}/schedule`);
        const scheduleSnapshot = await getDocs(scheduleColRef);

        // 2. Batch delete operations
        const batch = writeBatch(db);
        scheduleSnapshot.forEach(scheduleDoc => {
            batch.delete(scheduleDoc.ref);
        });
        batch.delete(routeDocRef); // Add route deletion to batch

        // 3. Commit atomic operation
        await batch.commit();        showDeleteModal.value = false;
    } catch (error) {
        console.error("Error deleting route:", error);
    }
};
const closeModal = () => {
    showAddRouteModal.value = false;
    editingRoute.value = false;
    Object.assign(currentRoute, createDefaultRoute());
    errors.value = { name: '', stops: '' };
};


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
const handleStopClick = (stopInfo) => {
    const stopId = stopInfo.id;
    const index = currentRoute.stops.indexOf(stopId);
    if (index === -1) {
        currentRoute.stops = [...currentRoute.stops, stopId];
    }
};
const removeStop = (stopId) => {
    currentRoute.stops = currentRoute.stops.filter(id => id !== stopId);
};
watch(() => currentRoute.stops, () => {
    if (currentRoute.stops && currentRoute.stops.length > 0) {
        errors.value.stops = '';
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
                                            Stops</th>
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
                                                {{ getPreviewStopNames(route.stops) }}
                                            </p>
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

                                            <div class="mb-3">
                                                <label class="form-label">Bus Stops</label>
                                                <ul class="list-group">
                                                    <li v-for="(stopId, index) in currentRoute.stops" :key="stopId"
                                                        class="list-group-item d-flex justify-content-between align-items-center">
                                                        <div>
                                                            <span class="badge bg-gradient-success me-2">{{ index + 1
                                                                }}</span>
                                                            {{ getStopName(stopId) }}
                                                        </div>
                                                        <button type="button" class="btn btn-sm btn-danger mb-0 px-4"
                                                            @click="removeStop(stopId)">
                                                            <i class="fas fa-trash"></i>
                                                        </button>
                                                    </li>
                                                </ul>
                                                <div v-if="errors.stops" class="text-danger text-sm mb-2">{{
                                                    errors.stops }}</div>
                                            </div>
                                        </div>

                                        <div class="col-md-6">
                                            <div class="h-100 d-flex flex-column">
                                                <label class="form-label">Select Stops</label>
                                                <div class="text-muted text-xs">
                                                    Click on the map below to select stops
                                                </div>
                                                <GoogleMapPicker v-if="showAddRouteModal" :existing-stops="stops"
                                                    :center="mapCenter" :enable-click-to-add="false"
                                                    :enable-draggable-markers="false" @marker-clicked="handleStopClick"
                                                    class="mt-3 stop-page-map flex-grow-1" />
                                            </div>
                                        </div>

                                        <div class="col-12 mt-2">
                                            <div v-if="errors.general" class="alert alert-danger text-sm mt-2">
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
                                    <p>Are you sure you want to delete this route?</p>
                                </div>
                                <div class="modal-footer">
                                    <argon-button color="danger" @click="deleteRoute">Delete</argon-button>
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
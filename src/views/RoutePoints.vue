<script setup>
import { ref, onMounted, watch, nextTick, reactive, computed } from 'vue';
import { deleteDoc, updateDoc, setDoc, onSnapshot, doc, getDocs, query, where, GeoPoint } from 'firebase/firestore';
import { rPointCollection, routeCollection } from '@/firebase';
import ArgonButton from "@/components/ArgonButton.vue";
import ArgonInput from "@/components/ArgonInput.vue";
import GoogleMapPicker from '@/views/components/GoogleMapPicker.vue';


// Constant
const DEFAULT_CENTER = { lat: 2.3114, lng: 102.3203 };
// Reactive state
const rpoints = ref([]);
const routes = ref([]);
const showAddRPointModal = ref(false);
const showDeleteModal = ref(false);
const editingRPoint = ref(false);
const currentRPoint = reactive(createDefaultRPoint());
const rPointToDelete = ref(null);
const routesUsingRPoint = ref([]);
const mapLoaded = ref(false);
const mapCenter = ref({ ...DEFAULT_CENTER });
const sortColumn = ref('name');
const sortDirection = ref('asc');
const currentPage = ref(1);
const itemsPerPage = ref(10);
// Error state
const errors = ref({ name: '', coordinates: '', general: '' });


// Lifecycle hooks
onMounted(() => {
    const rPointUnsub = onSnapshot(rPointCollection, (snapshot) => {
        rpoints.value = snapshot.docs.map(doc => {
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


// Computed properties
const sortedRPoints = computed(() => {
    if (!sortColumn.value) return rpoints.value;
    return [...rpoints.value].sort((a, b) => {
        let valA = a[sortColumn.value];
        let valB = b[sortColumn.value];
        if (sortColumn.value === 'coordinates') {
            valA = a.coordinates?.latitude ?? a.coordinates?.lat ?? 0;
            valB = b.coordinates?.latitude ?? b.coordinates?.lat ?? 0;
        }
        if (sortColumn.value === 'routeNames') {
            const routesA = routes.value.filter(route =>
                route.rpoints && route.rpoints.includes(a.id)
            ).sort((x, y) => x.name.localeCompare(y.name));

            const routesB = routes.value.filter(route =>
                route.rpoints && route.rpoints.includes(b.id)
            ).sort((x, y) => x.name.localeCompare(y.name));

            valA = routesA[0]?.name || '';
            valB = routesB[0]?.name || '';
        }
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return sortDirection.value === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection.value === 'asc' ? 1 : -1;
        return 0;
    });
});
const paginatedRPoints = computed(() => {
    const start = (currentPage.value - 1) * itemsPerPage.value;
    const end = start + itemsPerPage.value;
    return sortedRPoints.value.slice(start, end);
});
const totalItems = computed(() => sortedRPoints.value.length);
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


// Helper functions
function createDefaultRPoint() {
    return {
        rpointId: "",
        name: "",
        type: "",
        coordinates: { lat: null, lng: null }
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
const getRouteNamesForRPoint = (rpointId) => {
    const matchingRoutes = routes.value.filter(route =>
        route.rpoints && route.rpoints.includes(rpointId)
    );
    const sortedRoutes = [...matchingRoutes].sort((a, b) =>
        a.name.localeCompare(b.name)
    );
    return sortedRoutes.map(route => route.name).join(', ') || '-';
};
const handleSort = (column) => {
    if (column === sortColumn.value) {
        sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn.value = column;
        sortDirection.value = 'asc';
    }
};
const formatCoordinates = (coords) => {
    if (!coords) return 'N/A';
    const lat = coords.latitude ?? coords.lat;
    const lng = coords.longitude ?? coords.lng;
    if (lat === undefined || lng === undefined) return 'N/A';

    return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
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
            rpointId: newRPointRef.id,
            name: currentRPoint.name,
            type: currentRPoint.type,
            coordinates: new GeoPoint(
                currentRPoint.coordinates.lat,
                currentRPoint.coordinates.lng
            )
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
        const routesQuery = query(routeCollection, where("rpoints", "array-contains", rPointToDelete.value));
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
    const routesQuery = query(routeCollection, where("rpoints", "array-contains", id));
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
const goToPage = (page) => {
    if (page >= 1 && page <= totalPages.value) {
        currentPage.value = page;
    }
};


// Watchers
watch(() => currentRPoint.coordinates, (newVal) => {
    currentRPoint.coordinates.lat = Number(newVal.lat);
    currentRPoint.coordinates.lng = Number(newVal.lng);
}, { deep: true, immediate: true });
watch([sortColumn, sortDirection], () => {
    currentPage.value = 1;
});
</script>



<template>
    <div class="py-4 container-fluid">
        <div class="row">
            <div class="col-12">
                <div class="card">
                    <div class="card-header pb-0">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6>Location List</h6>
                            <argon-button color="success" size="sm" @click="addRPoint">
                                <i class="ni ni-fat-add"></i> Add Location
                            </argon-button>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="table-responsive p-0">
                            <table class="table table-hover align-items-center justify-content-center mb-0">
                                <thead>
                                    <tr>
                                        <th class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2 cursor-pointer"
                                            @click="handleSort('name')">
                                            Location Name<i v-if="sortColumn === 'name'" class="fas ms-1"
                                                :class="sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down'"></i>
                                        </th>
                                        <th class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2 cursor-pointer"
                                            @click="handleSort('coordinates')">
                                            Coordinates
                                            <i v-if="sortColumn === 'coordinates'" class="fas ms-1"
                                                :class="sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down'"></i>
                                        </th>
                                        <th class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2 cursor-pointer"
                                            @click="handleSort('routeNames')">
                                            Route(s)
                                            <i v-if="sortColumn === 'routeNames'" class="fas ms-1"
                                                :class="sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down'"></i>
                                        </th>
                                        <th class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2 cursor-pointer"
                                            @click="handleSort('type')">
                                            Type
                                            <i v-if="sortColumn === 'type'" class="fas ms-1"
                                                :class="sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down'"></i>
                                        </th>
                                        <th
                                            class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-if="paginatedRPoints.length === 0">
                                        <td colspan="5" class="text-center py-4">
                                            No location found
                                        </td>
                                    </tr>

                                    <tr v-for="rPoint in paginatedRPoints" :key="rPoint.rpointId">
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
                                                    :existing-rpoints="rpoints" :is-editing="editingRPoint"
                                                    :editing-rPoint-id="editingRPoint ? currentRPoint.id : null"
                                                    :center="mapCenter" class="mt-3 rpoint-page-map flex-grow-1" />
                                            </div>
                                        </div>

                                        <div class="col-12 mt-2">
                                            <div v-if="errors.general" class="text-danger text-sm text-sm mt-2">
                                                {{ errors.general }}
                                            </div>
                                            <div class="d-flex justify-content-end gap-3 mt-2">
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
                        <div class="modal-dialog modal-dialog-centered">
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

                                <div class="d-flex justify-content-end gap-2 mt-4">
                                    <argon-button color="secondary"
                                        @click="showDeleteModal = false">Cancel</argon-button>
                                    <argon-button color="danger" @click="deleteRPoint"
                                        :disabled="routesUsingRPoint.length > 0">Confirm Delete</argon-button>
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
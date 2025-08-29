<script setup>
import { ref, onMounted, reactive, watch, computed } from 'vue';
import { updateDoc, setDoc, onSnapshot, doc, getDoc, getDocs, query, where, deleteDoc, writeBatch, GeoPoint } from 'firebase/firestore';
import { routeCollection, rPointCollection, scheduleCollection, db } from '@/firebase';
import GoogleMapPicker from '@/views/components/GoogleMapPicker.vue';
import ArgonButton from "@/components/ArgonButton.vue";
import ArgonInput from "@/components/ArgonInput.vue";


// Constants
const DEFAULT_CENTER = { lat: 2.3114, lng: 102.3203 };
// Reactive state
// Data state
const routes = ref([]);
const rpoints = ref([]);
const currentRoute = reactive(createDefaultRoute());
const routeToDelete = ref(null);
const schedulesUsingRoute = ref([]);
// UI state
const showAddRouteModal = ref(false);
const showDeleteModal = ref(false);
const editingRoute = ref(false);
const rPointSelectionMode = ref('regular');
const pendingPinpoint = ref(null);
const pendingRPointId = ref(null);
const pendingName = ref('');
const editingPinpointIndex = ref(null);
const mapCenter = ref({ ...DEFAULT_CENTER });
// Table state
const sortColumn = ref('name');
const sortDirection = ref('asc');
const currentPage = ref(1);
const itemsPerPage = ref(10);
// Error state
const errors = ref({ name: '', rpoints: '', generaL: '' });


// Computed properties
const computedEventMarkers = computed(() => {
    if (editingPinpointIndex.value !== null) {
        const pinpoint = currentRoute.rpoints[editingPinpointIndex.value];
        return [pinpoint];
    }
    return currentRoute.rpoints.filter(s => s.type === 'event');
});
const busStops = computed(() => {
    return rpoints.value.filter(rp => rp.type === 'bus_stop');
});
const sortedRoutes = computed(() => {
    if (!sortColumn.value) return routes.value;

    return [...routes.value].sort((a, b) => {
        let valA = a[sortColumn.value];
        let valB = b[sortColumn.value];

        // Special handling for route points preview
        if (sortColumn.value === 'rpoints') {
            valA = getPreviewRPointNames((a.rpoints || []).map(id => ({ type: 'regular', id })));
            valB = getPreviewRPointNames((b.rpoints || []).map(id => ({ type: 'regular', id })));
        }

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortDirection.value === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection.value === 'asc' ? 1 : -1;
        return 0;
    });
});
const paginatedRoutes = computed(() => {
    const start = (currentPage.value - 1) * itemsPerPage.value;
    const end = start + itemsPerPage.value;
    return sortedRoutes.value.slice(start, end);
});
const totalItems = computed(() => sortedRoutes.value.length);
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
onMounted(() => {
    const routesUnsub = onSnapshot(routeCollection, (snapshot) => {
        routes.value = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    });
    const rPointUnsub = onSnapshot(rPointCollection, (snapshot) => {
        rpoints.value = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                coordinates: {
                    latitude: data.coordinates?.latitude || data.coordinates?.lat,
                    longitude: data.coordinates?.longitude || data.coordinates?.lng
                }
            };
        });
    });
    return () => { routesUnsub(); rPointUnsub(); }
});


// Helper functions
function createDefaultRoute() {
    return {
        routeId: "",
        name: "",
        rpoints: [],
    };
}
const getRPointName = (rPointData) => {
    if (rPointData.type === 'regular') {
        const rPoint = rpoints.value.find(s => s.id === rPointData.id);
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
    errors.value = { name: '', rpoints: '', generaL: '' };
    let isValid = true;

    if (!currentRoute.name.trim()) {
        errors.value.name = 'Route name is required';
        isValid = false;
    }
    if (!currentRoute.rpoints || currentRoute.rpoints.length < 2) {
        errors.value.rpoints = 'At least 2 locations is required';
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
            const eventRPointIds = (currentRoute.rpoints || [])
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

        for (const rPointData of currentRoute.rpoints) {
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
                        type: 'event',
                        coordinates: geoCoordinates
                    };
                    batch.set(newRPointRef, { ...newRPointData, rpointId: newRPointRef.id });
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
            rpoints: routeRPoints
        };
        if (editingRoute.value) {
            await updateDoc(doc(routeCollection, currentRoute.id), routeData);
        } else {
            const newRouteRef = doc(routeCollection);
            await setDoc(newRouteRef, { ...routeData, routeId: newRouteRef.id });
        }
        closeModal();
    } catch (error) {
        errors.value.general = "Failed to save route. Please check your connection.";
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

    const routeRPoints = route.rpoints || [];
    if (route.type === 'regular') {
        currentRoute.rpoints = routeRPoints.map(rpointId => ({
            type: 'regular',
            id: rpointId
        }));
        if (routeRPoints.length) {
            const firstRPoint = rpoints.value.find(s => s.id === routeRPoints[0]);
            if (firstRPoint) mapCenter.value = {
                lat: firstRPoint.coordinates.latitude,
                lng: firstRPoint.coordinates.longitude
            };
        }
    } else {
        currentRoute.rpoints = routeRPoints.map(rpointId => {
            const rPoint = rpoints.value.find(s => s.id === rpointId);
            return rPoint ? {
                type: 'event',
                id: rpointId,
                name: rPoint.name,
                coordinates: rPoint.coordinates
            } : null;
        }).filter(Boolean);
        if (currentRoute.rpoints.length) {
            mapCenter.value = {
                lat: currentRoute.rpoints[0].coordinates.latitude,
                lng: currentRoute.rpoints[0].coordinates.longitude
            };
        }
    }
    showAddRouteModal.value = true;
};
const confirmDelete = async (id) => {
    routeToDelete.value = id;
    const scheduleQuery = query(scheduleCollection, where("routeId", "==", id));
    const scheduleSnapshot = await getDocs(scheduleQuery);
    schedulesUsingRoute.value = scheduleSnapshot.docs.map(doc => doc.data());
    showDeleteModal.value = true;
};
const closeModal = () => {
    showAddRouteModal.value = false;
    editingRoute.value = false;
    Object.assign(currentRoute, createDefaultRoute());
    errors.value = { name: '', rpoints: '', generaL: '' };
};
const handleSort = (column) => {
    if (column === sortColumn.value) {
        sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn.value = column;
        sortDirection.value = 'asc';
    }
};
const goToPage = (page) => {
    if (page >= 1 && page <= totalPages.value) {
        currentPage.value = page;
    }
};
function handleMarkerClick(rPointInfo) {
    if (rPointSelectionMode.value === 'regular' && rPointInfo.id) {
        const rpointId = rPointInfo.id;
        if (!currentRoute.rpoints.some(s => s.type === 'regular' && s.id === rpointId)) {
            currentRoute.rpoints.push({ type: 'regular', id: rpointId });
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
        const rPoint = currentRoute.rpoints[editingPinpointIndex.value];
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
        const original = currentRoute.rpoints[editingPinpointIndex.value];
        if (original && original.id) {
            newPinpoint.id = original.id;
        }
        currentRoute.rpoints[editingPinpointIndex.value] = newPinpoint;
    } else {
        currentRoute.rpoints.push(newPinpoint);
    }
    pendingPinpoint.value = null;
    pendingName.value = '';
    editingPinpointIndex.value = null;
    pendingRPointId.value = null;
}
async function startEditPinpoint(i) {
    const rPoint = currentRoute.rpoints[i];
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
    currentRoute.rpoints.splice(index, 1);
};
function handleModeChange() {
    currentRoute.rpoints = [];
    pendingPinpoint.value = null;
    pendingName.value = '';
    editingPinpointIndex.value = null;
    errors.value.rpoints = '';
}


// Watchers
watch(() => currentRoute.rpoints, () => {
    if (currentRoute.rpoints && currentRoute.rpoints.length > 0) {
        errors.value.rpoints = '';
    }
}, { deep: true });
watch(editingRoute, (newValue) => {
    if (newValue) {
        rPointSelectionMode.value = 'regular';
    }
});
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
                            <h6>Route List</h6>
                            <argon-button color="trackutemlightblue" size="sm" class="text-white" @click="addRoute">
                                <i class="ni ni-fat-add"></i> Add Route
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
                                            Route Name
                                            <i v-if="sortColumn === 'name'" class="fas ms-1"
                                                :class="sortDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down'"></i>
                                        </th>
                                        <th class="text-uppercase text-secondary text-xxs font-weight-bolder opacity-7 ps-2 cursor-pointer"
                                            @click="handleSort('rpoints')">
                                            Route Points
                                            <i v-if="sortColumn === 'rpoints'" class="fas ms-1"
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
                                            Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-if="paginatedRoutes.length === 0">
                                        <td colspan="4" class="text-center py-4">
                                            No routes found
                                        </td>
                                    </tr>
                                    <tr v-for="route in paginatedRoutes" :key="route.id">
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0 px-2">{{ route.name }}</p>
                                        </td>
                                        <td>
                                            <p class="text-sm font-weight-bold mb-0">
                                                {{getPreviewRPointNames((route.rpoints || []).map(id => ({
                                                type: 'regular', id: id
                                                })))}}
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
                                    <div v-if="errors.general" class="alert alert-danger text-white mb-3">
                                        {{ errors.general }}
                                    </div>

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
                                                    <li v-for="(rPointData, index) in currentRoute.rpoints" :key="index"
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
                                                <div v-if="errors.rpoints" class="text-danger text-sm mb-2">{{
                                                    errors.rpoints }}</div>
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
                                                <GoogleMapPicker v-if="showAddRouteModal" :center="mapCenter"
                                                    :existingRPoints="rPointSelectionMode === 'regular' ? busStops : []"
                                                    :event-rpoints="computedEventMarkers"
                                                    :enable-click-to-add="rPointSelectionMode === 'event'"
                                                    :enable-draggable-markers="rPointSelectionMode === 'event'"
                                                    :coordinates="pendingPinpoint ? { lat: pendingPinpoint.latitude, lng: pendingPinpoint.longitude } : { lat: null, lng: null }"
                                                    @marker-clicked="handleMarkerClick"
                                                    @marker-added="handleMarkerClick"
                                                    @marker-dragged="handlePinpointDrag"
                                                    class="mt-3 rpoint-page-map flex-grow-1" />
                                            </div>
                                        </div>

                                        <div class="d-flex justify-content-end gap-3 mt-2">
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
                                    <argon-button color="secondary"
                                        @click="showDeleteModal = false">Cancel</argon-button>
                                    <argon-button color="danger" @click="deleteRoute"
                                        :disabled="schedulesUsingRoute.length > 0">Delete</argon-button>
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
<script setup>
import { ref } from 'vue';
import GoogleMap from '@/views/components/GoogleMap.vue';
import RouteDetails from '@/views/components/RouteDetails.vue';

const mapCenter = ref({ lat: 2.3114, lng: 102.3203 });
const markers = ref([]);
const activeRoute = ref(null);

// const routes = ref([
//     {
//         origin: { lat: 2.3145, lng: 102.3189 },
//         destination: { lat: 2.2952, lng: 102.2866 },
//         travelMode: 'DRIVING'
//     }
// ]);

// Route management
function addMarker(marker) {
    markers.value.push({
        ...marker,
        id: Date.now(),
        draggable: true,
        clickable: true
    });
}

function updateMarker({ id, position }) {
    const marker = markers.value.find(m => m.id === id);
    if (marker) marker.position = position;
}

function saveRoute(routeData) {
    // Implementation for saving route to Firebase
    console.log('Route saved:', routeData);
    activeRoute.value = routeData;
}
</script>

<style scoped>
 .card {
     height: calc(100vh - 140px);
     overflow-y: auto;
 }
.map-container {
    padding-right: 1rem;
}
 .list-group-item {
     border-color: rgba(0, 0, 0, 0.1);
     padding: 0.75rem 1.25rem;
 }
</style>

<template>
    <div class="container-fluid py-4">
        <div class="row">
            <!-- Left panel: Map -->
            <div class="col-xl-5 col-lg-6">
                <GoogleMap :center="mapCenter" :markers="markers" :enable-click-to-add="true"
                    :enable-draggable-markers="true" @marker-added="addMarker" @marker-dragged="updateMarker">
                </GoogleMap>
            </div>

            <!-- Right panel: Route Details -->
            <div class="col-xl-7 col-lg-6 mt-4 mt-xl-0">
                <RouteDetails :stops="markers" @update-route="saveRoute" />
            </div>
        </div>
    </div>
</template>
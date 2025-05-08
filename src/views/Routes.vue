<script setup>
import { ref, onMounted } from 'vue';
import { onSnapshot } from 'firebase/firestore';
import { stopCollection } from '@/firebase';
import GoogleMap from '@/views/components/GoogleMap.vue';
import RouteDetails from '@/views/components/RouteDetails.vue';


// Reactive state
const mapCenter = ref({ lat: 2.3114, lng: 102.3203 });
const markers = ref([]);
const activeRoute = ref(null);
const existingStops = ref([]);


// Lifecycle hooks
onMounted(() => {
    const unsubscribe = onSnapshot(stopCollection, (snapshot) => {
        existingStops.value = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    });
    return () => unsubscribe();
});


// Route management functions
function handleStopClick(stop) {
    const exists = markers.value.some(m => m.id === stop.id);
    if (!exists) {
        markers.value.push({
            id: stop.id,
            position: stop.location,
            title: stop.title,
            draggable: false,
            clickable: true
        });
    }
}
function saveRoute(routeData) {
    console.log('Route saved:', routeData);
    activeRoute.value = routeData;
}
</script>



<template>
    <div class="container-fluid py-4">
        <div class="row">
            <!-- Left panel: Map -->
            <div class="col-xl-5 col-lg-6">
                <GoogleMap :center="mapCenter" :markers="markers" :existing-stops="existingStops"
                    :enable-click-to-add="false" @marker-clicked="handleStopClick">
                </GoogleMap>
            </div>

            <!-- Right panel: Route Details -->
            <div class="col-xl-7 col-lg-6 mt-4 mt-xl-0">
                <RouteDetails :stops="markers" @update-route="saveRoute" />
            </div>
        </div>
    </div>
</template>



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
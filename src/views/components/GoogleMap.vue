<script setup>
/* global google */
import { ref, onMounted, watchEffect, watch, onUnmounted, shallowRef } from 'vue';
import loader from '@/utils/googleMapsLoader.js';
import ArgonAlert from "@/components/ArgonAlert.vue";


const props = defineProps({
    center: { type: Object, required: true },
    zoom: { type: Number, default: 15 },
    markers: { type: Array, default: () => [] },
    existingStops: { type: Array, default: () => [] },
    mapOptions: {
        type: Object,
        default: () => ({
            mapId: '16618dbf92bab8c9',
            mapTypeControl: false,
            streetViewControl: false,
            gestureHandling: 'greedy'
        })
    },
    enableClickToAdd: { type: Boolean, default: false },
    enableDraggableMarkers: { type: Boolean, default: false }
});
const emit = defineEmits(['map-loaded', 'marker-clicked', 'marker-added', 'marker-dragged']);
const mapRef = ref(null);
const mapInstance = shallowRef(null);
const AdvancedMarkerElement = shallowRef(null);
const loading = ref(true);
const error = ref(null);
const currentMarkers = ref([]);
const clickListener = ref(null);


// Helper function
const createMarkerElement = (config) => {
    const element = document.createElement('div');
    element.className = 'advanced-marker';
    element.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path fill="${config.color || '#EA4335'}" 
                    d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/>
        </svg>
    `;
    return element;
};


// Map initialization
const initializeMap = async () => {
    try {
        await loader.load();
        const { AdvancedMarkerElement: Marker } = await google.maps.importLibrary("marker");
        AdvancedMarkerElement.value = Marker;

        mapInstance.value = new google.maps.Map(mapRef.value, {
            center: props.center,
            zoom: props.zoom,
            ...props.mapOptions
        });
        if (props.enableClickToAdd) {
            setupClickListener();
        }
        updateMarkers();
        emit('map-loaded', mapInstance.value);
        loading.value = false;
    } catch (err) {
        error.value = `Map initialization failed: ${err.message}`;
        loading.value = false;
    }
};


// Markers management
const updateMarkers = () => {
    clearMarkers();
    [...props.markers].forEach(markerConfig => { 
        const marker = new AdvancedMarkerElement.value({
            position: markerConfig.position,
            map: mapInstance.value,
            title: markerConfig.title,
            gmpDraggable: props.enableDraggableMarkers,
            content: createMarkerElement({ color: markerConfig.color || '#EA4335' }) 
        });
        if (markerConfig.clickable) {
            marker.addEventListener('gmp-click', () =>
                emit('marker-clicked', markerConfig));
        }
        if (markerConfig.draggable) {
            marker.addListener('dragend', (e) => {
                const position = {
                    lat: e.latLng.lat(),
                    lng: e.latLng.lng()
                };
                emit('marker-dragged', {
                    id: markerConfig.id,
                    position: position,
                    title: markerConfig.title
                });
            });
        }
        currentMarkers.value.push(marker);
    });
    
    props.existingStops.forEach(stop => {
        const blueMarker = new AdvancedMarkerElement.value({
            position: stop.location,
            map: mapInstance.value,
            title: stop.name,
            gmpClickable: true,
            // gmpDraggable: false,
            content: createMarkerElement({ color: '#4285F4' }) // Blue for existing stops
        });
        blueMarker.addEventListener('gmp-click', () =>
            emit('marker-clicked', { id: stop.id, position: stop.location, title: stop.name })
        );
        currentMarkers.value.push(blueMarker);
    });
};
const clearMarkers = () => {
    currentMarkers.value.forEach(marker => marker.setMap(null));
    currentMarkers.value = [];
};
const setupClickListener = () => {
    if (!mapInstance.value) return;
    if (clickListener.value) {
        google.maps.event.removeListener(clickListener.value);
    }
    clickListener.value = mapInstance.value.addListener('click', (e) => {
        emit('marker-added', {
            position: e.latLng.toJSON(),
            title: `Selected Location ${e.latLng.lat().toFixed(4)}, ${e.latLng.lng().toFixed(4)}`
        });
    });
};


// Lifecycle hooks
onMounted(initializeMap);
onUnmounted(() => {
    if (clickListener.value && mapInstance.value) {
        google.maps.event.removeListener(clickListener.value);
    }
    clearMarkers();
    if (mapInstance.value) {
        mapInstance.value = null;
    }
});
watch(
    () => props.markers,
    () => {
        if (mapInstance.value) {
            updateMarkers();
        }
    },
    { deep: true }
);
watchEffect(() => {
    if (mapInstance.value) {
        mapInstance.value.setCenter(props.center);
    }
});
</script>



<template>
    <div class="card h-100">
        <div class="card-body p-0 position-relative">
            <div class="map-container">
                <div ref="mapRef" class="h-100 w-100"></div>
                <div v-if="loading"
                    class="position-absolute w-100 h-100 d-flex align-items-center justify-content-center"
                    style="background: rgba(255, 255, 255, 0.9); z-index: 1000;">
                    <div class="text-center">
                        <div class="spinner-border text-success" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <p class="text-sm text-dark mt-2">Initializing Map...</p>
                    </div>
                </div>

                <ArgonAlert v-if="error" color="danger" class="error-overlay m-3">
                    <span class="alert-text">{{ error }}</span>
                </ArgonAlert>
            </div>
        </div>
    </div>
</template>



<style>
.map-container {
    height: 80vh;
}
.loading-overlay {
    position: absolute;
    inset: 0;
    background: rgba(255, 255, 255, 0.9);
    z-index: 1000;
}
.error-overlay {
    position: absolute;
    top: 1rem;
    right: 1rem;
    left: 1rem;
    z-index: 1000;
}
.advanced-marker {
    width: 32px;
    height: 32px;
    cursor: grab;
}
.advanced-marker:active {
    cursor: grabbing;
}
.advanced-marker svg {
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
    transition: transform 0.2s ease;
}
.advanced-marker:hover svg {
    transform: scale(1.1);
}
</style>
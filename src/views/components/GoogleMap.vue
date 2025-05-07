<script setup>
/* global google */
import { ref, onMounted, watchEffect, watch, onUnmounted, shallowRef } from 'vue';
import loader from '@/utils/googleMapsLoader.js';
import ArgonAlert from "@/components/ArgonAlert.vue";

const props = defineProps({
    center: { type: Object, required: true },
    zoom: { type: Number, default: 8 },
    markers: { type: Array, default: () => [] },
    // routes: { type: Array, default: () => [] },
    mapOptions: {
        type: Object,
        default: () => ({
            mapId: '16618dbf92bab8c9',
            mapTypeControl: false,
            streetViewControl: false,
            gestureHandling: 'greedy'
    }) },
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
    props.markers.forEach(markerConfig => {
        const marker = new AdvancedMarkerElement.value({
            position: markerConfig.position,
            map: mapInstance.value,
            title: markerConfig.title,
            gmpDraggable: props.enableDraggableMarkers,
            content: createMarkerElement(markerConfig)
        });

        if (markerConfig.clickable) {
            marker.addEventListener('gmp-click', () =>
                emit('marker-clicked', markerConfig));
        }
        if (props.enableDraggableMarkers) {
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
};
const clearMarkers = () => {
    currentMarkers.value.forEach(marker => marker.setMap(null));
    currentMarkers.value = [];
};
const setupClickListener = () => {
    clickListener.value = mapInstance.value.addListener('click', (e) => {
        emit('marker-added', {
            position: e.latLng.toJSON(),
            title: `Selected Location ${e.latLng.lat().toFixed(4)}, ${e.latLng.lng().toFixed(4)}`
        });
    });
};


// Helper function
const createMarkerElement = (config) => {
    const element = document.createElement('div');
    element.className = 'advanced-marker';
    if (config.icon) {
        element.textContent = config.icon;
        element.style.fontSize = '24px';
        element.style.color = config.color || '#FF0000';
    } else {
        element.textContent = config.title || '📍';
    }
    return element;
};


// Lifecycle hooks
onMounted(initializeMap);
onUnmounted(() => {
    if (clickListener.value) google.maps.event.removeListener(clickListener.value);
    clearMarkers();
    mapInstance.value = null;
});
watch(() => props.markers, updateMarkers, { deep: true });
watchEffect(() => {
    if (mapInstance.value) {
        mapInstance.value.setCenter(props.center);
        mapInstance.value.setZoom(props.zoom);
    }
});
</script>



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
    font-size: 24px;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    position: relative;
    top: 0;
    left: 0;
    cursor: grab;
    touch-action: none;
    user-select: none;
    -webkit-user-drag: none;
    pointer-events: auto !important;
}
.advanced-marker:active {
    cursor: grabbing;
}
</style>



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
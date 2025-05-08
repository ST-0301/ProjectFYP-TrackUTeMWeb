<!-- src/views/components/GoogleMapPicker.vue -->
<script setup>
import { ref, watch } from 'vue';
import GoogleMap from '@/views/components/GoogleMap.vue';


const props = defineProps({
    location: {
        type: Object,
        default: () => ({ lat: null, lng: null })
    },
    existingStops: {
        type: Array,
        default: () => []
    }
});
const emit = defineEmits(['update:location']);
const defaultCenter = { lat: 2.3114, lng: 102.3203 };
const currentLocation = ref(JSON.parse(JSON.stringify(props.location)));
const markers = ref([]);


// Create a marker object
const createMarker = (position) => ({
    position,
    title: 'Selected Location',
    clickable: false,
    color: '#FF0000',
    icon: '📍',
    zIndex: 9999
});


// Handle map click & drag
const handleMapClick = (e) => {
    const newLocation = {
        lat: Number(e.position.lat.toFixed(6)),
        lng: Number(e.position.lng.toFixed(6))
    }
    currentLocation.value = newLocation;
    emit('update:location', newLocation);
    markers.value = [createMarker(newLocation)];
};
const handleMarkerDrag = (e) => {
    const newLocation = {
        lat: Number(e.position.lat.toFixed(6)),
        lng: Number(e.position.lng.toFixed(6))
    };
    currentLocation.value = newLocation;
    emit('update:location', newLocation);
    markers.value = [createMarker(newLocation)];
};


// Update markers when location changes
watch(() => props.location, (newVal) => {
    if (newVal.lat && newVal.lng) {
        currentLocation.value = JSON.parse(JSON.stringify(newVal));
        markers.value = [createMarker(newVal)];
    }
}, { immediate: true, deep: true });
</script>



<style>
.map-picker {
    height: 300px;
    border-radius: 8px;
    border: 1px solid #dee2e6;
    margin-top: 1rem;
}
</style>



<template>
    <GoogleMap :center="currentLocation.lat ? currentLocation : defaultCenter" :zoom="15" :markers="markers" :existing-stops="existingStops"
        :enable-click-to-add="true" :enable-draggable-markers="true" class="map-picker" @marker-added="handleMapClick"
        @marker-dragged="handleMarkerDrag" />
</template>
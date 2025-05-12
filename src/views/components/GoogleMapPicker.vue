<script setup>
import { ref, watch, reactive } from 'vue';
import GoogleMap from './GoogleMap.vue';


const props = defineProps({
    location: { type: Object, default: () => ({ lat: null, lng: null }) },
    existingStops: { type: Array, default: () => [] },
    enableClickToAdd: { type: Boolean, default: true },
    enableDraggableMarkers: { type: Boolean, default: true },
});
const emit = defineEmits(['update:location', 'marker-clicked']);
const internalLocation = reactive({
    lat: props.location.lat,
    lng: props.location.lng
});
const markers = ref([]);


// Watch
watch(
    () => props.location,
    (newLocation) => {
        internalLocation.lat = newLocation.lat;
        internalLocation.lng = newLocation.lng;
    }, { immediate: true, deep: true }
);
watch(
    [() => props.existingStops, () => internalLocation.lat, () => internalLocation.lng],
    ([newStops, lat, lng]) => {
        // always start with blue markers for existing stops
        const base = newStops.map(stop => ({
            id: stop.id,
            position: stop.location,
            title: stop.name,
            clickable: true,
            draggable: false,
            color: '#4285F4'
        }));

        // if picked a location, append the red draggable one
        if (lat != null && lng != null) {
            base.push({
                position: { lat, lng },
                title: 'Selected Location',
                clickable: false,
                draggable: true,
                color: '#EA4335'
            });
        }
        markers.value = base;
    }, { immediate: true, deep: true }
);


// Handlers
const handleMapClick = (e) => {
    const newLocation = {
        lat: e.position.lat,
        lng: e.position.lng
    };
    internalLocation.lat = newLocation.lat;
    internalLocation.lng = newLocation.lng;
    emit('update:location', newLocation);
};
const handleMarkerDrag = (e) => {
    const newLocation = {
        lat: e.position.lat,
        lng: e.position.lng
    };
    internalLocation.lat = newLocation.lat;
    internalLocation.lng = newLocation.lng;
    emit('update:location', newLocation);
};
</script>



<template>
    <GoogleMap
        :center="{ lat: 2.3114, lng: 102.3203 }"
        :zoom="15" :markers="markers" :existing-stops="props.existingStops"
        :enable-click-to-add="props.enableClickToAdd" :enable-draggable-markers="props.enableDraggableMarkers"
        class="map-picker" @marker-added="handleMapClick" @marker-dragged="handleMarkerDrag"
        @marker-clicked="$emit('marker-clicked', $event)" />
</template>



<style>
.map-picker {
    height: 300px;
    border-radius: 8px;
    border: 1px solid #dee2e6;
    margin-top: 1rem;
}
</style>
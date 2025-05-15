<script setup>
import { ref, watch, reactive } from 'vue';
import GoogleMap from './GoogleMap.vue';


const props = defineProps({
    location: { type: Object, default: () => ({ lat: null, lng: null }) },
    existingStops: { type: Array, default: () => [] },
    isEditing: { type: Boolean, default: false },
    editingStopId: { type: String, default: null },
    center: { type: Object, required: true },
    enableClickToAdd: { type: Boolean, default: true },
    enableDraggableMarkers: { type: Boolean, default: true },
});
const emit = defineEmits(['update:location', 'marker-clicked']);
const internalLocation = reactive({
    lat: props.location.lat,
    lng: props.location.lng
});
const markers = ref([]);
// const mapCenter = computed(() => ({
//     lat: internalLocation.lat ?? 2.3114,
//     lng: internalLocation.lng ?? 102.3203
// }));


// Watch
watch(
    () => props.location,
    (newLocation) => {
        internalLocation.lat = newLocation.lat;
        internalLocation.lng = newLocation.lng;
    }, { immediate: true, deep: true }
);
watch(
    [() => props.existingStops, () => internalLocation.lat, () => internalLocation.lng, () => props.editingStopId],
    ([newStops, lat, lng, editingStopId]) => {
        const base = newStops
            .filter(stop => !(props.isEditing && stop.id === props.editingStopId))
            .map(stop => ({
                id: stop.id,
                position: stop.location,
                title: stop.name,
                clickable: true,
                draggable: false,
                color: '#4285F4'
            }));

        if (props.isEditing && props.editingStopId) {
            const editingStopData = newStops.find(s => s.id === props.editingStopId) || {};
            base.push({
                id: props.editingStopId,
                position: {
                    lat: internalLocation.lat,
                    lng: internalLocation.lng
                },
                title: editingStopData.name || 'Editing Stop',
                clickable: true,
                draggable: props.enableDraggableMarkers,
                color: '#EA4335'
            });
        }

        if (lat != null && lng != null && !editingStopId) {
            base.push({
                position: { lat, lng },
                title: 'Selected Location',
                clickable: false,
                draggable: true,
                color: '#EA4335'
            });
        }

        markers.value = base;
    },
    { immediate: true, deep: true }
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
    <GoogleMap :center="props.center" :zoom="15" :markers="markers" :existing-stops="props.existingStops"
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
<!-- GoogleMapPicker.vue -->
<script setup>
import { ref, watch, reactive } from 'vue';
import GoogleMap from './GoogleMap.vue';


const props = defineProps({
    coordinates: { type: Object, default: () => ({ lat: null, lng: null }) },
    existingRPoints: { type: Array, default: () => [] },
    eventRPoints: { type: Array, default: () => [] },
    isEditing: { type: Boolean, default: false },
    editingRPointId: { type: String, default: null },
    center: { type: Object, required: true },
    enableClickToAdd: { type: Boolean, default: true },
    enableDraggableMarkers: { type: Boolean, default: true },
});
const emit = defineEmits(['update:coordinates', 'marker-clicked', 'marker-dragged']);
const DEFAULT_CENTER = { lat: 2.3114, lng: 102.3203 };
const internalCoordinates = reactive({
    lat: props.coordinates.lat ?? DEFAULT_CENTER.lat,
    lng: props.coordinates.lng ?? DEFAULT_CENTER.lng
});
const markers = ref([]);


// Handlers
const handleMapClick = (e) => {
    const newCoordinates = {
        lat: e.position.lat,
        lng: e.position.lng
    };
    internalCoordinates.lat = newCoordinates.lat;
    internalCoordinates.lng = newCoordinates.lng;
    emit('update:coordinates', newCoordinates);
};
const handleMarkerDrag = (e) => {
    const newCoordinates = {
        lat: e.position.lat,
        lng: e.position.lng
    };
    internalCoordinates.lat = newCoordinates.lat;
    internalCoordinates.lng = newCoordinates.lng;
    emit('update:coordinates', newCoordinates);
};
const updateMarkers = () => {
    const newMarkers = [...props.existingRPoints].map(rPoint => {
        return {
            id: rPoint.id,
            position: {
                lat: rPoint.coordinates.latitude,
                lng: rPoint.coordinates.longitude
            },
            title: rPoint.name,
            clickable: true,
            draggable: false,
            color: '#4285F4'
        };
    });

    props.eventRPoints.forEach(eventPoint => {
        const lat = eventPoint.coordinates.latitude ?? eventPoint.coordinates.lat;
        const lng = eventPoint.coordinates.longitude ?? eventPoint.coordinates.lng;
        if (typeof lat === 'number' && typeof lng === 'number') {
            newMarkers.push({
                id: eventPoint.id,
                position: { lat, lng },
                title: eventPoint.name || 'Event Location',
                clickable: true,
                draggable: props.enableDraggableMarkers,
                color: '#EA4335' // red
            });
        }
    });
    markers.value = newMarkers;
};


// Watchers
watch(() => props.coordinates, (newCoordinates) => {
        internalCoordinates.lat = (typeof newCoordinates.lat === 'number') ? newCoordinates.lat : DEFAULT_CENTER.lat;
        internalCoordinates.lng = (typeof newCoordinates.lng === 'number') ? newCoordinates.lng : DEFAULT_CENTER.lng;
    }, { immediate: true, deep: true }
);
watch([() => props.existingRPoints, () => internalCoordinates.lat, () => internalCoordinates.lng, () => props.editingRPointId],
    ([newRPoints, lat, lng, editingRPointId]) => {
        const base = newRPoints
            .filter(rPoint => !(props.isEditing && rPoint.id === props.editingRPointId))
            .map(rPoint => ({
                id: rPoint.id,
                position: {
                    lat: rPoint.coordinates.latitude,
                    lng: rPoint.coordinates.longitude
                },
                title: rPoint.name,
                clickable: true,
                draggable: false,
                color: '#4285F4'
            }));

        if (props.isEditing && props.editingRPointId) {
            const editingRPointData = newRPoints.find(s => s.id === props.editingRPointId) || {};
            base.push({
                id: props.editingRPointId,
                position: {
                    lat: internalCoordinates.lat,
                    lng: internalCoordinates.lng
                },
                title: editingRPointData.name || 'Editing Route Point',
                clickable: true,
                draggable: props.enableDraggableMarkers,
                color: '#EA4335'
            });
        }

        if (typeof lat === 'number' && typeof lng === 'number' && !editingRPointId) {
            base.push({
                position: { lat, lng },
                title: 'Selected Location',
                clickable: false,
                draggable: props.enableDraggableMarkers,
                color: '#EA4335'
            });
        }
        markers.value = base;
    },
    { immediate: true, deep: true }
);
watch(() => props.eventRPoints, () => {
        updateMarkers();
    }, { deep: true }
);
</script>



<template>
    <GoogleMap :center="props.center" :zoom="15" :markers="markers" :existing-rpoints="props.existingRPoints"
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
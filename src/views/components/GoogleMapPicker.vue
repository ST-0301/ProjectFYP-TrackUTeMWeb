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
const emit = defineEmits(['update:coordinates', 'marker-clicked', 'marker-dragged', 'marker-added']);
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
    emit('marker-added', { position: newCoordinates });
};
const handleMarkerDrag = (e) => {
    const newCoordinates = {
        lat: e.position.lat,
        lng: e.position.lng
    };
    internalCoordinates.lat = newCoordinates.lat;
    internalCoordinates.lng = newCoordinates.lng;
    emit('update:coordinates', newCoordinates);
    emit('marker-dragged', { id: e.id, position: newCoordinates });
};
// const updateMarkers = () => {
//     const newMarkers = [...props.existingRPoints].map(rPoint => {
//         return {
//             id: rPoint.id,
//             position: {
//                 lat: rPoint.coordinates.latitude,
//                 lng: rPoint.coordinates.longitude
//             },
//             title: rPoint.name,
//             clickable: true,
//             draggable: false,
//             color: '#4285F4'
//         };
//     });

//     props.eventRPoints.forEach(eventPoint => {
//         const lat = eventPoint.coordinates.latitude ?? eventPoint.coordinates.lat;
//         const lng = eventPoint.coordinates.longitude ?? eventPoint.coordinates.lng;
//         if (typeof lat === 'number' && typeof lng === 'number') {
//             newMarkers.push({
//                 id: eventPoint.id,
//                 position: { lat, lng },
//                 title: eventPoint.name || 'Event Location',
//                 clickable: true,
//                 draggable: props.enableDraggableMarkers,
//                 color: '#EA4335' // red
//             });
//         }
//     });
//     markers.value = newMarkers;
// };
const updateMarkers = () => {
    const newMarkers = [];
    props.existingRPoints.forEach(rPoint => {
        const position = getPosition(rPoint.coordinates);
        if (position && typeof position.lat === 'number' && typeof position.lng === 'number') {
            newMarkers.push({
                id: rPoint.id,
                position,
                title: rPoint.name || 'Bus Stop',
                clickable: true,
                draggable: false,
                color: '#4285F4'
            });
        }
    });
    props.eventRPoints.forEach(eventPoint => {
        const position = getPosition(eventPoint.coordinates);
        if (position && typeof position.lat === 'number' && typeof position.lng === 'number') {
            newMarkers.push({
                id: eventPoint.id,
                position,
                title: eventPoint.name || 'Event Location',
                clickable: true,
                draggable: props.enableDraggableMarkers,
                color: '#EA4335' // red
            });
        }
    });
    if (props.coordinates &&
        typeof props.coordinates.lat === 'number' &&
        typeof props.coordinates.lng === 'number') {

        newMarkers.push({
            id: 'pending',
            position: {
                lat: props.coordinates.lat,
                lng: props.coordinates.lng
            },
            title: 'Selected Location',
            clickable: false,
            draggable: props.enableDraggableMarkers,
            color: '#EA4335' // red
        });
    }
    markers.value = newMarkers;
};
const getPosition = (coords) => {
    if (!coords) return null;
    return {
        lat: coords.latitude ?? coords.lat,
        lng: coords.longitude ?? coords.lng
    };
};


// Watchers
watch(() => props.coordinates, (newCoordinates) => {
    internalCoordinates.lat = (typeof newCoordinates.lat === 'number') ? newCoordinates.lat : null;
    internalCoordinates.lng = (typeof newCoordinates.lng === 'number') ? newCoordinates.lng : null;
}, { deep: true }
);
watch([() => props.existingRPoints, () => internalCoordinates.lat, () => internalCoordinates.lng, () => props.editingRPointId],
    ([newRPoints, lat, lng, editingRPointId]) => {
        const base = newRPoints
            .filter(rPoint => !(props.isEditing && rPoint.id === props.editingRPointId))
            // .map(rPoint => ({
            //     id: rPoint.id,
            //     position: {
            //         lat: rPoint.coordinates.latitude,
            //         lng: rPoint.coordinates.longitude
            //     },
            //     title: rPoint.name,
            //     clickable: true,
            //     draggable: false,
            //     color: '#4285F4'
        // }));
            .map(rPoint => {
                const coords = rPoint.coordinates;
                const position = {
                    lat: coords.latitude ?? coords.lat,
                    lng: coords.longitude ?? coords.lng
                };

                return {
                    id: rPoint.id,
                    position,
                    title: rPoint.name,
                    clickable: true,
                    draggable: false,
                    color: '#4285F4' // Blue for bus stops
                };
            });

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
                color: '#EA4335' // red
            });
        }
        if (typeof lat === 'number' && typeof lng === 'number' && !editingRPointId) {
            base.push({
                position: { lat, lng },
                title: 'Selected Location',
                clickable: false,
                draggable: props.enableDraggableMarkers,
                color: '#EA4335' // red
            });
        }
        markers.value = base;
    },
    { immediate: true, deep: true }
);
// watch(() => props.eventRPoints, () => {
//         updateMarkers();
//     }, { deep: true }
// );
watch(
    [() => props.existingRPoints, () => props.eventRPoints],
    () => {
        updateMarkers();
    },
    { deep: true, immediate: true }
);
watch(
    () => props.coordinates,
    (newCoords) => {
        if (newCoords && typeof newCoords.lat === 'number' && typeof newCoords.lng === 'number') {
            updateMarkers();
        }
    },
    { deep: true }
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
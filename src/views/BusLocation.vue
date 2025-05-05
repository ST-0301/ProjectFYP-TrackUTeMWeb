<script setup>
import { ref as dbRef, onValue } from 'firebase/database';
import { database } from '../firebase';
import { onMounted, onUnmounted, ref } from 'vue';

const loading = ref(true);
const lat = ref(null);
const lng = ref(null);
const timestamp = ref(null);
let unsubscribe;

onMounted(() => {
    const busRef = dbRef(database, 'bus_locations/bus1');

    unsubscribe = onValue(busRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            lat.value = data.lat;
            lng.value = data.lng;
            timestamp.value = data.timestamp;
        }
        loading.value = false;
    });
});

onUnmounted(() => {
    if (unsubscribe) unsubscribe();
});
</script>


<template>
    <div class="container-fluid py-4">
        <div class="row">
            <div class="col-12">
                <div class="card">
                    <div class="card-header pb-0">
                        <h6>Real-time Bus Location</h6>
                    </div>
                    <div class="card-body">
                        <div v-if="loading" class="text-center">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                        </div>
                        <div v-else>
                            <p class="text-sm">Latitude: {{ lat || 'No data' }}</p>
                            <p class="text-sm">Longitude: {{ lng || 'No data' }}</p>
                            <p class="text-sm">Last updated: {{ timestamp ? new Date(timestamp).toLocaleString() : 'N/A'
                                }}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
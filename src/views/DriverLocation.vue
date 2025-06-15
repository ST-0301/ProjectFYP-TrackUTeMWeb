<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { onSnapshot, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { driverCollection, scheduleCollection, busCollection } from '@/firebase';
import GoogleMap from '@/views/components/GoogleMap.vue';


const driverMarkers = ref([]);
const center = ref({ lat: 2.3114, lng: 102.3203 });
const zoom = ref(12);
const faUserTieSVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="32" height="32">
  <path fill="#4285F4" d="M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm89.6 32h-16.7c-22.2 10.2-46.9 16-72.9 16s-50.7-5.8-72.9-16h-16.7C60.2 288 0 348.2 0 422.4V464c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48v-41.6c0-74.2-60.2-134.4-134.4-134.4z"/>
</svg>
`;

onMounted(() => {
    const unsubscribe = onSnapshot(driverCollection, async (snapshot) => {
        const markers = [];
        for (const docSnap of snapshot.docs) {
            const driver = docSnap.data();
            if (driver.currentLocation && driver.status === 'active') {
                let licensePlate = 'N/A';
                const schedQ = query(
                    scheduleCollection,
                    where('driverId', '==', docSnap.id),
                    where('status', '==', 'in_progress')
                );
                const schedSnap = await getDocs(schedQ);
                if (!schedSnap.empty) {
                    const schedDoc = schedSnap.docs[0].data();
                    if (schedDoc.busId) {
                        const busDocRef = doc(busCollection, schedDoc.busId);
                        const busSnap = await getDoc(busDocRef);
                        if (busSnap.exists()) {
                            licensePlate = busSnap.data().licensePlate || 'N/A';
                        }
                    }
                }

                const markerObj = {
                    id: docSnap.id,
                    position: {
                        lat: driver.currentLocation.latitude,
                        lng: driver.currentLocation.longitude
                    },
                    content: `
                        <div class="driver-marker">
                            <div class="driver-name">${driver.name}</div>
                            ${faUserTieSVG}
                            <div class="driver-tooltip">
                                ${licensePlate}
                            </div>
                        </div>
                    `,
                    title: `Last update: ${driver.lastUpdate ? new Date(driver.lastUpdate.seconds * 1000).toLocaleString() : 'N/A'}`,
                    clickable: true
                };
                markers.push(markerObj);
            }
        }
        driverMarkers.value = markers;
    });
    onUnmounted(unsubscribe);
});
</script>

<template>
    <div class="container-fluid py-4">
        <div class="row">
            <div class="col-12">
                <div class="card">
                    <div class="card-header pb-0">
                        <h6>Real-time Driver Locations</h6>
                    </div>
                    <div class="card-body p-0">
                        <GoogleMap :center="center" :zoom="zoom" :markers="driverMarkers" class="driver-map" />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>


<style>
.driver-map {
    height: 70vh;
    border-radius: 8px;
}

.driver-marker {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.driver-name {
    background: white;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: bold;
    margin-bottom: 4px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    white-space: nowrap;
}

.fa-user-tie {
    color: #4285F4;
    font-size: 24px;
    filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.3));
}
</style>
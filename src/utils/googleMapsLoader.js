/* global google */
import { Loader } from "@googlemaps/js-api-loader";

const loader = new Loader({
  apiKey: process.env.VUE_APP_GOOGLE_MAPS_API_KEY,
  version: "beta",
  mapIds: ["16618dbf92bab8c9"],
  libraries: ["marker", "places", "geometry"],
});

let googleMapsPromise;

export const loadGoogleMaps = () => {
  if (!googleMapsPromise) {
    googleMapsPromise = loader.load();
  }
  return googleMapsPromise;
};

export const calculateRouteDurations = async (waypoints) => {
   if (!window.google || !window.google.maps) {
     throw new Error("Google Maps API not loaded");
   }
   if (!Array.isArray(waypoints) || waypoints.length < 2) {
     throw new Error("At least 2 waypoints are required");
   }

  const directionsService = new google.maps.DirectionsService();
  const waypointsFormatted = waypoints.slice(1, -1).map((coord) => ({
    location: new google.maps.LatLng(
      parseFloat(coord.latitude || coord.lat),
      parseFloat(coord.longitude || coord.lng)
    ),
    stopover: true,
  }));

  try {
    const request = {
      origin: new google.maps.LatLng(
        parseFloat(waypoints[0].latitude || waypoints[0].lat),
        parseFloat(waypoints[0].longitude || waypoints[0].lng)
      ),
      destination: new google.maps.LatLng(
        parseFloat(
          waypoints[waypoints.length - 1].latitude ||
            waypoints[waypoints.length - 1].lat
        ),
        parseFloat(
          waypoints[waypoints.length - 1].longitude ||
            waypoints[waypoints.length - 1].lng
        )
      ),
      waypoints: waypointsFormatted,
      travelMode: google.maps.TravelMode.DRIVING,
      optimizeWaypoints: true,
    };

    const response = await new Promise((resolve, reject) => {
      directionsService.route(request, (response, status) => {
        if (status === "OK") {
          resolve(response);
        } else {
          reject(new Error(`Directions request failed: ${status}`));
        }
      });
    });

    const legs = response.routes[0].legs;
    const durations = legs.map((leg) => leg.duration.value);
    return durations;
  } catch (error) {
    console.error("Directions API Error:", {
      waypoints,
      error: error.message,
    });
    throw error;
  }
};

export default loader;
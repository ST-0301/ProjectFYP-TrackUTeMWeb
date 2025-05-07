import { Loader } from '@googlemaps/js-api-loader';

const loader = new Loader({
  apiKey: 'AIzaSyCZyfC4f_FMI5VL5B1PnoIY4o9uSa91rlI',
  version: 'beta',
  mapIds: ['16618dbf92bab8c9'],
  libraries: [ 'marker', 'places', 'geometry' ],
});

export default loader;
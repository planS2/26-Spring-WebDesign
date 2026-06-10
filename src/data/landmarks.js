export const MAP_BOUNDS = {
  lonMin: 6.6,
  lonMax: 18.5,
  latMin: 36.6,
  latMax: 47.1,
  worldWidth: 132,
  worldSize: 170,
};

// The Italy map spans roughly 1,200 km north-to-south and 990 km east-to-west.
// A single scene unit therefore represents about 7.1 km on the ground.
export const WORLD_METERS_PER_UNIT = 7100;

export function worldUnitsFromMeters(meters) {
  return meters / WORLD_METERS_PER_UNIT;
}

function mercY(lat) {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
}

const MERC_Y_MIN = mercY(MAP_BOUNDS.latMin);
const MERC_Y_MAX = mercY(MAP_BOUNDS.latMax);

export function lngLatToWorld(lon, lat) {
  const tx = (lon - MAP_BOUNDS.lonMin) / (MAP_BOUNDS.lonMax - MAP_BOUNDS.lonMin);
  const tz = 1 - (mercY(lat) - MERC_Y_MIN) / (MERC_Y_MAX - MERC_Y_MIN);
  return [(tx - 0.5) * MAP_BOUNDS.worldWidth, 0, (tz - 0.5) * MAP_BOUNDS.worldSize];
}

export function worldToLngLat(worldX, worldZ) {
  const tx = worldX / MAP_BOUNDS.worldWidth + 0.5;
  const tz = worldZ / MAP_BOUNDS.worldSize + 0.5;
  const lon = MAP_BOUNDS.lonMin + tx * (MAP_BOUNDS.lonMax - MAP_BOUNDS.lonMin);
  const merc = MERC_Y_MIN + (1 - tz) * (MERC_Y_MAX - MERC_Y_MIN);
  const lat = (Math.atan(Math.sinh(merc)) * 180) / Math.PI;
  return { lon, lat };
}

function makeLandmark({
  id,
  name,
  description,
  lon,
  lat,
  modelKind = 'monument',
  scale = 5.8,
  triggerRadius = 13,
  rotationY = 0,
}) {
  return {
    id,
    name,
    description,
    modelPath: null,
    lon,
    lat,
    position: lngLatToWorld(lon, lat),
    rotation: [0, rotationY, 0],
    scale,
    triggerRadius,
    modelKind,
  };
}

export const landmarks = [
  {
    id: 'colosseum',
    name: 'Colosseum',
    description: 'Ancient Roman amphitheatre in the center of Rome.',
    modelPath: '/models/romes_colosseum.glb',
    lon: 12.4922,
    lat: 41.8902,
    position: lngLatToWorld(12.4922, 41.8902),
    rotation: [0, Math.PI * 0.15, 0],
    scale: 6.4,
    triggerRadius: 16,
    modelKind: 'arena',
  },
  {
    id: 'pisa',
    name: 'Leaning Tower of Pisa',
    description: 'Medieval bell tower in Pisa Cathedral Square.',
    modelPath: '/models/pisas_tower.glb',
    lon: 10.3966,
    lat: 43.723,
    position: lngLatToWorld(10.3966, 43.723),
    rotation: [0, -Math.PI * 0.2, 0],
    scale: 7.2,
    triggerRadius: 15,
    modelKind: 'tower',
  },
  {
    id: 'florence_duomo',
    name: 'Florence Duomo',
    description: 'Santa Maria del Fiore and Brunelleschi dome in Florence.',
    modelPath: null,
    lon: 11.256,
    lat: 43.7731,
    position: lngLatToWorld(11.256, 43.7731),
    rotation: [0, Math.PI * 0.08, 0],
    scale: 6.8,
    triggerRadius: 14,
    modelKind: 'dome',
  },
  {
    id: 'venice_rialto',
    name: 'Rialto Bridge',
    description: 'Historic bridge crossing Venice Grand Canal.',
    modelPath: null,
    lon: 12.3359,
    lat: 45.438,
    position: lngLatToWorld(12.3359, 45.438),
    rotation: [0, -Math.PI * 0.1, 0],
    scale: 6.2,
    triggerRadius: 14,
    modelKind: 'bridge',
  },
  {
    id: 'milan_duomo',
    name: 'Milan Cathedral',
    description: 'Gothic cathedral and plaza in central Milan.',
    modelPath: null,
    lon: 9.1919,
    lat: 45.4642,
    position: lngLatToWorld(9.1919, 45.4642),
    rotation: [0, Math.PI * 0.2, 0],
    scale: 7,
    triggerRadius: 15,
    modelKind: 'cathedral',
  },
  {
    id: 'pompeii',
    name: 'Pompeii Archaeological Park',
    description: 'Archaeological park preserving the ancient Roman city of Pompeii.',
    modelPath: null,
    lon: 14.4869,
    lat: 40.7497,
    position: lngLatToWorld(14.4869, 40.7497),
    rotation: [0, -Math.PI * 0.18, 0],
    scale: 6.4,
    triggerRadius: 15,
    modelKind: 'ruins',
  },
  makeLandmark({
    id: 'pantheon_rome',
    name: 'Pantheon',
    description: 'Ancient Roman temple and domed church in central Rome.',
    lon: 12.4768,
    lat: 41.8986,
    modelKind: 'dome',
    scale: 6.4,
  }),
  makeLandmark({
    id: 'trevi_fountain',
    name: 'Trevi Fountain',
    description: 'Baroque fountain and urban landmark in Rome.',
    lon: 12.4833,
    lat: 41.9009,
    modelKind: 'fountain',
    scale: 5.5,
  }),
  makeLandmark({
    id: 'roman_forum',
    name: 'Roman Forum',
    description: 'Archaeological area at the center of ancient Rome.',
    lon: 12.4853,
    lat: 41.8925,
    modelKind: 'ruins',
    scale: 6.2,
  }),
  makeLandmark({
    id: 'uffizi_gallery',
    name: 'Uffizi Gallery',
    description: 'Major Renaissance art museum in Florence.',
    lon: 11.2553,
    lat: 43.7687,
    modelKind: 'palace',
    scale: 5.8,
  }),
  makeLandmark({
    id: 'siena_cathedral',
    name: 'Siena Cathedral',
    description: 'Medieval cathedral with marble facade and striped interior.',
    lon: 11.3287,
    lat: 43.3177,
    modelKind: 'cathedral',
    scale: 6.2,
  }),
  makeLandmark({
    id: 'verona_arena',
    name: 'Verona Arena',
    description: 'Roman amphitheatre still used for performances.',
    lon: 10.9944,
    lat: 45.4386,
    modelKind: 'arena',
    scale: 6.2,
  }),
  makeLandmark({
    id: 'st_marks_basilica',
    name: "St Mark's Basilica",
    description: 'Byzantine and Gothic basilica on Piazza San Marco in Venice.',
    lon: 12.3397,
    lat: 45.4345,
    modelKind: 'cathedral',
    scale: 6.5,
  }),
  makeLandmark({
    id: 'doges_palace',
    name: "Doge's Palace",
    description: 'Gothic palace and former seat of Venetian government.',
    lon: 12.3404,
    lat: 45.4337,
    modelKind: 'palace',
    scale: 6,
  }),
  makeLandmark({
    id: 'cinque_terre',
    name: 'Cinque Terre',
    description: 'Coastal villages and terraced landscape on the Ligurian coast.',
    lon: 9.7089,
    lat: 44.1461,
    modelKind: 'coast',
    scale: 5.8,
  }),
  makeLandmark({
    id: 'lake_como',
    name: 'Lake Como',
    description: 'Alpine lake landscape with historic villas and towns.',
    lon: 9.2572,
    lat: 45.9871,
    modelKind: 'lake',
    scale: 6,
  }),
  makeLandmark({
    id: 'mole_antonelliana',
    name: 'Mole Antonelliana',
    description: 'Tall historic tower and landmark of Turin.',
    lon: 7.6931,
    lat: 45.0691,
    modelKind: 'tower',
    scale: 6.8,
  }),
  makeLandmark({
    id: 'san_vitale_ravenna',
    name: 'Basilica of San Vitale',
    description: 'Ravenna basilica known for Byzantine mosaics.',
    lon: 12.1964,
    lat: 44.4208,
    modelKind: 'dome',
    scale: 5.8,
  }),
  makeLandmark({
    id: 'assisi_basilica',
    name: 'Basilica of Saint Francis of Assisi',
    description: 'Franciscan basilica and pilgrimage landmark in Umbria.',
    lon: 12.6264,
    lat: 43.0747,
    modelKind: 'cathedral',
    scale: 6.1,
  }),
  makeLandmark({
    id: 'caserta_palace',
    name: 'Royal Palace of Caserta',
    description: 'Large Bourbon royal palace and garden complex near Naples.',
    lon: 14.3275,
    lat: 41.0731,
    modelKind: 'palace',
    scale: 6.4,
  }),
  makeLandmark({
    id: 'herculaneum',
    name: 'Herculaneum',
    description: 'Ancient Roman town preserved by the eruption of Mount Vesuvius.',
    lon: 14.3487,
    lat: 40.8059,
    modelKind: 'ruins',
    scale: 5.9,
  }),
  makeLandmark({
    id: 'paestum',
    name: 'Paestum',
    description: 'Greek temples and archaeological site in Campania.',
    lon: 15.0059,
    lat: 40.4197,
    modelKind: 'temple',
    scale: 6.1,
  }),
  makeLandmark({
    id: 'matera_sassi',
    name: 'Sassi di Matera',
    description: 'Historic cave dwellings and stone urban landscape in Matera.',
    lon: 16.6106,
    lat: 40.6664,
    modelKind: 'ruins',
    scale: 5.8,
  }),
  makeLandmark({
    id: 'alberobello_trulli',
    name: 'Trulli of Alberobello',
    description: 'Dry-stone conical-roof houses in Apulia.',
    lon: 17.2365,
    lat: 40.7829,
    modelKind: 'village',
    scale: 5.7,
  }),
  makeLandmark({
    id: 'castel_del_monte',
    name: 'Castel del Monte',
    description: 'Octagonal medieval castle in Apulia.',
    lon: 16.2707,
    lat: 41.0847,
    modelKind: 'castle',
    scale: 6.1,
  }),
  makeLandmark({
    id: 'amalfi_coast',
    name: 'Amalfi Coast',
    description: 'Cliffside coastal landscape and historic towns in Campania.',
    lon: 14.6027,
    lat: 40.634,
    modelKind: 'coast',
    scale: 5.8,
  }),
  makeLandmark({
    id: 'valley_of_temples',
    name: 'Valley of the Temples',
    description: 'Ancient Greek temple landscape in Agrigento, Sicily.',
    lon: 13.5933,
    lat: 37.2894,
    modelKind: 'temple',
    scale: 6.2,
  }),
  makeLandmark({
    id: 'mount_etna',
    name: 'Mount Etna',
    description: 'Active volcano and mountain landscape in eastern Sicily.',
    lon: 14.9958,
    lat: 37.751,
    modelKind: 'mountain',
    scale: 6.6,
  }),
  makeLandmark({
    id: 'palermo_cathedral',
    name: 'Palermo Cathedral',
    description: 'Cathedral complex combining Norman, Gothic, and later styles.',
    lon: 13.3564,
    lat: 38.1144,
    modelKind: 'cathedral',
    scale: 6,
  }),
  makeLandmark({
    id: 'nuraghe_su_nuraxi',
    name: 'Su Nuraxi di Barumini',
    description: 'Bronze Age nuragic archaeological site in Sardinia.',
    lon: 8.9918,
    lat: 39.7056,
    modelKind: 'ruins',
    scale: 5.8,
  }),
];

export const WORLD_SIZE_UNITS = MAP_BOUNDS.worldSize;

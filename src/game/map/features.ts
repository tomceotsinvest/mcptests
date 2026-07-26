import type { Landmark, Park, Vec } from '../types';

/**
 * Local equirectangular projection centred near Covent Garden (-0.11, 51.51).
 * x grows east, y grows north, both in metres.
 */
const CENTER_LON = -0.11;
const CENTER_LAT = 51.51;
const M_PER_LON = 111320 * Math.cos((CENTER_LAT * Math.PI) / 180); // ≈ 69300
const M_PER_LAT = 111132;

export const ll = (lon: number, lat: number): Vec => ({
  x: (lon - CENTER_LON) * M_PER_LON,
  y: (lat - CENTER_LAT) * M_PER_LAT,
});

const lls = (pts: [number, number][]): Vec[] => pts.map(([lon, lat]) => ll(lon, lat));

/* ------------------------------------------------------------- the Thames */

export const THAMES: Vec[] = lls([
  [-0.222, 51.477], [-0.205, 51.4785], [-0.185, 51.4815], [-0.17, 51.4835],
  [-0.158, 51.4845], [-0.1495, 51.4845], [-0.14, 51.4845], [-0.133, 51.486],
  [-0.1275, 51.4875], [-0.1235, 51.4915], [-0.1215, 51.4945], [-0.1215, 51.4975],
  [-0.1218, 51.5008], [-0.12, 51.504], [-0.1165, 51.5068], [-0.1145, 51.508],
  [-0.11, 51.509], [-0.1042, 51.5095], [-0.0985, 51.509], [-0.094, 51.5085],
  [-0.0877, 51.5072], [-0.08, 51.506], [-0.0753, 51.5055], [-0.068, 51.5048],
  [-0.058, 51.5035], [-0.048, 51.5045], [-0.038, 51.5065], [-0.029, 51.509],
  [-0.022, 51.507], [-0.017, 51.5], [-0.019, 51.49], [-0.021, 51.482],
]);

export const THAMES_WIDTH = 230;

/* ----------------------------------------------------------------- parks */

export const PARKS: Park[] = [
  {
    name: 'Hyde Park & Kensington Gardens',
    poly: lls([
      [-0.19, 51.5025], [-0.19, 51.5105], [-0.1755, 51.5115], [-0.159, 51.5125],
      [-0.1535, 51.5065], [-0.159, 51.5035], [-0.175, 51.5025],
    ]),
  },
  {
    name: 'Green Park',
    poly: lls([[-0.1505, 51.5045], [-0.1435, 51.5075], [-0.14, 51.5045], [-0.1445, 51.5025]]),
  },
  {
    name: "St James's Park",
    poly: lls([[-0.14, 51.5025], [-0.1295, 51.5045], [-0.129, 51.5015], [-0.138, 51.4995]]),
  },
  {
    name: "Regent's Park",
    poly: lls([
      [-0.1625, 51.5265], [-0.163, 51.535], [-0.15, 51.5375], [-0.1415, 51.531], [-0.147, 51.526],
    ]),
  },
  {
    name: 'Battersea Park',
    poly: lls([[-0.163, 51.4765], [-0.163, 51.4825], [-0.148, 51.4825], [-0.148, 51.4765]]),
  },
  {
    name: "Lincoln's Inn Fields",
    poly: lls([[-0.1185, 51.516], [-0.1185, 51.5175], [-0.115, 51.5175], [-0.115, 51.516]]),
  },
  {
    name: 'Russell Square',
    poly: lls([[-0.127, 51.5215], [-0.127, 51.5235], [-0.124, 51.5235], [-0.124, 51.5215]]),
  },
  {
    name: 'Kennington Park',
    poly: lls([[-0.11, 51.483], [-0.11, 51.487], [-0.105, 51.487], [-0.105, 51.483]]),
  },
];

/* ------------------------------------------------------------- landmarks */

const lm = (name: string, lon: number, lat: number, icon: string, weight: number): Landmark => ({
  name,
  p: ll(lon, lat),
  icon,
  weight,
});

export const LANDMARKS: Landmark[] = [
  lm('Buckingham Palace', -0.1419, 51.5014, '🏰', 3),
  lm('Palace of Westminster', -0.1246, 51.5007, '🏛️', 3),
  lm('London Eye', -0.1196, 51.5033, '🎡', 3),
  lm('Trafalgar Square', -0.128, 51.508, '🦁', 2),
  lm('British Museum', -0.1269, 51.5194, '🏛️', 3),
  lm('Covent Garden', -0.1226, 51.5117, '🎭', 2.5),
  lm('Tower of London', -0.0759, 51.5081, '🏯', 3),
  lm('Tower Bridge', -0.0754, 51.5055, '🌉', 2),
  lm("St Paul's Cathedral", -0.0984, 51.5138, '⛪', 2.5),
  lm('Tate Modern', -0.0993, 51.5076, '🎨', 2),
  lm('The Shard', -0.0865, 51.5045, '🏙️', 2),
  lm('Borough Market', -0.091, 51.5055, '🥘', 2),
  lm('Oxford Street', -0.145, 51.5147, '🛍️', 3),
  lm('Harrods', -0.1635, 51.4994, '🛍️', 2),
  lm('Natural History Museum', -0.1764, 51.4967, '🦖', 2.5),
  lm('Science Museum', -0.1749, 51.4978, '🔬', 1.5),
  lm('V&A Museum', -0.1724, 51.4966, '🖼️', 1.5),
  lm('London Zoo', -0.1534, 51.5353, '🦁', 2),
  lm('Soho', -0.132, 51.5135, '🍸', 2.5),
  lm('Leicester Square', -0.13, 51.5103, '🎬', 2),
  lm('Piccadilly Circus', -0.1337, 51.51, '💡', 2),
  lm('Somerset House', -0.1174, 51.5111, '🏛️', 1),
  lm('Southbank Centre', -0.116, 51.506, '🎻', 1.5),
  lm('Barbican Centre', -0.0937, 51.5202, '🎻', 1.5),
  lm("Lord's Cricket Ground", -0.1728, 51.5294, '🏏', 1.5),
  lm('The Oval', -0.1146, 51.4839, '🏏', 2),
  lm('UCL', -0.134, 51.5246, '🎓', 2),
  lm('LSE', -0.1163, 51.5145, '🎓', 1.5),
  lm('Imperial College', -0.1749, 51.4988, '🎓', 1.5),
];

/* ----------------------------------------------------------------- piers */

export const PIER_DEFS: { name: string; p: Vec }[] = [
  { name: 'St George Wharf Pier', p: ll(-0.126, 51.487) },
  { name: 'Millbank Pier', p: ll(-0.1235, 51.4935) },
  { name: 'Westminster Pier', p: ll(-0.122, 51.5018) },
  { name: 'London Eye Pier', p: ll(-0.1198, 51.5036) },
  { name: 'Embankment Pier', p: ll(-0.1205, 51.507) },
  { name: 'Blackfriars Pier', p: ll(-0.1032, 51.5102) },
  { name: 'Bankside Pier', p: ll(-0.0965, 51.5082) },
  { name: 'London Bridge City Pier', p: ll(-0.0845, 51.5062) },
  { name: 'Tower Pier', p: ll(-0.0787, 51.5062) },
];

/* --------------------------------------------------- national rail (deco) */

export const RAIL_LINES: Vec[][] = [
  lls([[-0.2255, 51.518], [-0.191, 51.5175], [-0.1774, 51.5165]]),
  lls([[-0.1631, 51.5225], [-0.168, 51.531], [-0.175, 51.545]]),
  lls([[-0.1335, 51.5282], [-0.138, 51.535], [-0.141, 51.545]]),
  lls([[-0.124, 51.5308], [-0.124, 51.537], [-0.1235, 51.545]]),
  lls([[-0.0817, 51.5178], [-0.072, 51.523], [-0.06, 51.53]]),
  lls([[-0.0785, 51.5115], [-0.068, 51.512], [-0.05, 51.514]]),
  lls([[-0.0864, 51.5049], [-0.075, 51.5], [-0.06, 51.4955], [-0.04, 51.489]]),
  lls([[-0.1143, 51.5036], [-0.112, 51.494], [-0.115, 51.483], [-0.118, 51.475]]),
  lls([[-0.1441, 51.4965], [-0.1445, 51.489], [-0.147, 51.4805], [-0.148, 51.475]]),
  lls([[-0.1247, 51.5074], [-0.119, 51.5045], [-0.116, 51.5025], [-0.112, 51.494]]),
  lls([[-0.0904, 51.5113], [-0.09, 51.5065], [-0.083, 51.5], [-0.075, 51.4955]]),
  lls([[-0.1037, 51.5116], [-0.1035, 51.5045], [-0.104, 51.4975], [-0.106, 51.489]]),
];

/* ----------------------------------------------------- borough boundaries */

export const BOROUGH_LINES: Vec[][] = [
  // City of London
  lls([
    [-0.112, 51.5185], [-0.104, 51.522], [-0.095, 51.522], [-0.078, 51.522],
    [-0.071, 51.515], [-0.074, 51.509],
  ]),
  // Westminster / Camden+Islington along the Euston Road corridor
  lls([[-0.1755, 51.5235], [-0.146, 51.5245], [-0.135, 51.527], [-0.124, 51.5305]]),
  // Westminster / Kensington & Chelsea
  lls([[-0.1963, 51.5091], [-0.19, 51.502], [-0.183, 51.494], [-0.178, 51.485]]),
];

/**
 * Demand blobs (gaussians in world metres) used by buildMap for the zone
 * grid — jobs, residential, plus commuter inflow at the rail termini.
 */
export const JOB_CENTRES: { p: Vec; sigma: number; w: number }[] = [
  { p: ll(-0.0886, 51.5133), sigma: 900, w: 5 }, // the City
  { p: ll(-0.1265, 51.503), sigma: 600, w: 2.5 }, // Whitehall/Westminster
  { p: ll(-0.135, 51.5135), sigma: 700, w: 3 }, // West End/Soho
  { p: ll(-0.115, 51.5165), sigma: 600, w: 2.5 }, // Midtown/Holborn
  { p: ll(-0.1435, 51.4965), sigma: 500, w: 2 }, // Victoria
  { p: ll(-0.1755, 51.5155), sigma: 400, w: 1.2 }, // Paddington
  { p: ll(-0.108, 51.505), sigma: 500, w: 1.8 }, // South Bank
  { p: ll(-0.0876, 51.5257), sigma: 500, w: 1.8 }, // Shoreditch/Old St
  { p: ll(-0.0735, 51.5145), sigma: 400, w: 1.5 }, // Aldgate
];

export const RES_CENTRES: { p: Vec; sigma: number; w: number }[] = [
  { p: ll(-0.135, 51.489), sigma: 700, w: 2.5 }, // Pimlico
  { p: ll(-0.17, 51.49), sigma: 900, w: 3 }, // Chelsea/S Ken
  { p: ll(-0.19, 51.512), sigma: 800, w: 2.5 }, // Bayswater/Notting Hill
  { p: ll(-0.155, 51.518), sigma: 600, w: 2 }, // Marylebone
  { p: ll(-0.127, 51.521), sigma: 600, w: 1.8 }, // Bloomsbury
  { p: ll(-0.106, 51.532), sigma: 700, w: 2.2 }, // Angel/Islington
  { p: ll(-0.108, 51.523), sigma: 500, w: 1.5 }, // Clerkenwell
  { p: ll(-0.062, 51.519), sigma: 700, w: 2.5 }, // Whitechapel
  { p: ll(-0.082, 51.499), sigma: 700, w: 2.2 }, // Bermondsey/Borough
  { p: ll(-0.105, 51.49), sigma: 700, w: 2.5 }, // Kennington/Elephant
];

/** Rail termini act as commuter origins/destinations. */
export const TERMINI: { name: string; p: Vec }[] = [
  { name: 'Paddington', p: ll(-0.1774, 51.5165) },
  { name: 'Marylebone', p: ll(-0.1631, 51.5225) },
  { name: 'Euston', p: ll(-0.1335, 51.5282) },
  { name: "King's Cross St Pancras", p: ll(-0.124, 51.5308) },
  { name: 'Liverpool Street', p: ll(-0.0817, 51.5178) },
  { name: 'Fenchurch Street', p: ll(-0.0785, 51.5115) },
  { name: 'London Bridge', p: ll(-0.0864, 51.5049) },
  { name: 'Waterloo', p: ll(-0.1143, 51.5036) },
  { name: 'Victoria', p: ll(-0.1441, 51.4965) },
  { name: 'Charing Cross', p: ll(-0.1247, 51.5074) },
];

import { RoadClass } from '../types';
import type { Vec } from '../types';
import { ll } from './features';

export interface AuthoredRoad {
  name: string;
  cls: RoadClass;
  oneWay?: boolean;
  busLane?: boolean;
  bridge?: boolean;
  pts: Vec[];
}

const road = (
  name: string,
  cls: RoadClass,
  pts: [number, number][],
  opts: { oneWay?: boolean; busLane?: boolean; bridge?: boolean } = {},
): AuthoredRoad => ({ name, cls, pts: pts.map(([lon, lat]) => ll(lon, lat)), ...opts });

const { Motorway, A, B, Residential, Pedestrian } = RoadClass;

/**
 * Hand-digitised Zone-1 arterials. Coordinates are approximate but
 * geographically faithful; the network is what gameplay runs on.
 */
export const AUTHORED_ROADS: AuthoredRoad[] = [
  road('Westway (A40)', Motorway, [
    [-0.2255, 51.5195], [-0.205, 51.5185], [-0.19, 51.519], [-0.178, 51.5205],
  ]),
  road('Marylebone Rd / Euston Rd / City Rd', A, [
    [-0.178, 51.5205], [-0.168, 51.522], [-0.1571, 51.5228], [-0.1465, 51.5238],
    [-0.1355, 51.526], [-0.1295, 51.5273], [-0.124, 51.5305], [-0.1055, 51.532],
    [-0.0955, 51.529], [-0.0876, 51.5257], [-0.079, 51.521],
  ], { busLane: true }),
  road('Oxford Street', A, [
    [-0.1587, 51.5135], [-0.149, 51.5143], [-0.141, 51.5152], [-0.13, 51.5163],
  ], { busLane: true }),
  road('High Holborn / Cheapside / Cornhill', A, [
    [-0.13, 51.5163], [-0.12, 51.5175], [-0.1111, 51.518], [-0.105, 51.5175],
    [-0.0975, 51.5152], [-0.089, 51.5133], [-0.083, 51.513], [-0.0755, 51.5143],
  ], { busLane: true }),
  road('Strand / Fleet St / Cannon St', A, [
    [-0.1275, 51.508], [-0.12, 51.511], [-0.113, 51.5115], [-0.107, 51.5142],
    [-0.104, 51.514], [-0.1, 51.5138], [-0.092, 51.5122], [-0.086, 51.5106],
    [-0.076, 51.51],
  ], { busLane: true }),
  road('Piccadilly', A, [
    [-0.1525, 51.5027], [-0.141, 51.5075], [-0.1345, 51.5098],
  ], { busLane: true }),
  road('Pall Mall', B, [[-0.128, 51.5077], [-0.135, 51.5065], [-0.14, 51.5045]], { oneWay: true }),
  road('The Mall', B, [[-0.129, 51.5066], [-0.1415, 51.5019]]),
  road('Victoria Embankment / Thames St', A, [
    [-0.124, 51.5013], [-0.122, 51.507], [-0.113, 51.5108], [-0.1043, 51.5108],
    [-0.096, 51.51], [-0.082, 51.5085], [-0.076, 51.509],
  ], { busLane: true }),
  road('Holland Park Ave / Bayswater Rd', A, [
    [-0.2255, 51.5065], [-0.21, 51.5075], [-0.1963, 51.5091], [-0.188, 51.5115],
    [-0.1756, 51.5117], [-0.1587, 51.5135],
  ], { busLane: true }),
  road('Kensington High St / Knightsbridge', A, [
    [-0.205, 51.5005], [-0.1925, 51.5012], [-0.175, 51.5018], [-0.1607, 51.5017],
    [-0.1525, 51.5027],
  ], { busLane: true }),
  road('Park Lane', A, [[-0.1587, 51.5135], [-0.1525, 51.5027]]),
  road('Edgware Road', A, [[-0.1587, 51.5135], [-0.167, 51.5202], [-0.172, 51.527]]),
  road('Regent Street', A, [
    [-0.141, 51.5152], [-0.1385, 51.5125], [-0.1345, 51.5098], [-0.132, 51.507],
  ]),
  road('Portland Place', A, [[-0.141, 51.5152], [-0.1435, 51.518], [-0.1445, 51.5237]]),
  road('Tottenham Court Road', A, [
    [-0.13, 51.5163], [-0.1345, 51.5205], [-0.138, 51.5245],
  ]),
  road('Gower Street', B, [[-0.1338, 51.5238], [-0.13, 51.519], [-0.1285, 51.5168]], { oneWay: true }),
  road('Charing Cross Road', A, [[-0.13, 51.5163], [-0.128, 51.5115], [-0.128, 51.508]]),
  road('Shaftesbury Avenue', A, [
    [-0.1345, 51.5098], [-0.13, 51.5125], [-0.1278, 51.5133], [-0.122, 51.5158],
  ]),
  road('Kingsway', A, [[-0.12, 51.5175], [-0.117, 51.5128]], { busLane: true }),
  road('Aldwych', B, [[-0.1205, 51.5117], [-0.117, 51.5128], [-0.113, 51.5115]], { oneWay: true }),
  road('Farringdon Road', A, [
    [-0.1195, 51.5305], [-0.112, 51.527], [-0.105, 51.52], [-0.104, 51.5155], [-0.104, 51.514],
  ]),
  road("Gray's Inn Road", B, [[-0.123, 51.5303], [-0.117, 51.524], [-0.111, 51.5185]]),
  road('Clerkenwell Rd / Old Street', A, [
    [-0.112, 51.5225], [-0.1025, 51.5228], [-0.093, 51.5245], [-0.0876, 51.5257],
  ]),
  road('Moorgate', A, [[-0.0876, 51.5257], [-0.0885, 51.5185], [-0.089, 51.5135]]),
  road('Gracechurch St / Bishopsgate', A, [
    [-0.0855, 51.511], [-0.0835, 51.5145], [-0.0815, 51.518], [-0.078, 51.5235],
  ], { busLane: true }),
  road('Whitechapel Road', A, [
    [-0.0755, 51.5143], [-0.0722, 51.5152], [-0.0615, 51.5185], [-0.052, 51.521],
  ], { busLane: true }),
  road('Tower Bridge / Tower Bridge Rd', A, [
    [-0.0755, 51.5095], [-0.0752, 51.5033], [-0.0785, 51.4985], [-0.081, 51.496],
  ], { bridge: true }),
  road('London Bridge / Borough High St', A, [
    [-0.0877, 51.511], [-0.0877, 51.505], [-0.09, 51.501], [-0.099, 51.4945],
  ], { bridge: true, busLane: true }),
  road('Southwark Bridge / Southwark Bridge Rd', A, [
    [-0.094, 51.512], [-0.0938, 51.507], [-0.099, 51.5], [-0.099, 51.4945],
  ], { bridge: true }),
  road('Millennium Bridge', Pedestrian, [[-0.0985, 51.5135], [-0.099, 51.5075]], { bridge: true }),
  road('Blackfriars Bridge / Blackfriars Rd', A, [
    [-0.104, 51.514], [-0.1038, 51.509], [-0.1035, 51.5045], [-0.1005, 51.4948],
  ], { bridge: true, busLane: true }),
  road('Waterloo Bridge / Waterloo Rd', A, [
    [-0.117, 51.5128], [-0.1155, 51.508], [-0.114, 51.5045], [-0.1135, 51.5025],
    [-0.106, 51.498],
  ], { bridge: true, busLane: true }),
  road('Westminster Bridge', A, [
    [-0.1265, 51.5007], [-0.122, 51.5008], [-0.116, 51.501], [-0.109, 51.4995], [-0.106, 51.498],
  ], { bridge: true, busLane: true }),
  road('Lambeth Bridge / Lambeth Rd', A, [
    [-0.1245, 51.4948], [-0.1205, 51.4945], [-0.112, 51.4955], [-0.106, 51.498],
  ], { bridge: true }),
  road('Vauxhall Bridge', A, [
    [-0.1278, 51.4885], [-0.124, 51.4863], [-0.1235, 51.4855],
  ], { bridge: true }),
  road('Chelsea Bridge', A, [[-0.1495, 51.485], [-0.147, 51.4825], [-0.146, 51.4795]], { bridge: true }),
  road('Grosvenor Rd / Millbank', A, [
    [-0.1495, 51.485], [-0.135, 51.487], [-0.1278, 51.4885], [-0.125, 51.492],
    [-0.1245, 51.4948], [-0.126, 51.4985], [-0.1265, 51.5007],
  ]),
  road('Albert Embankment', A, [
    [-0.1235, 51.4855], [-0.119, 51.4905], [-0.1205, 51.4945], [-0.116, 51.501], [-0.1135, 51.5025],
  ]),
  road('York Rd / Stamford St / Southwark St / Tooley St', A, [
    [-0.116, 51.501], [-0.1135, 51.5025], [-0.107, 51.5065], [-0.1035, 51.5065],
    [-0.097, 51.505], [-0.091, 51.505], [-0.0877, 51.505], [-0.081, 51.5035],
    [-0.0752, 51.5033],
  ], { busLane: true }),
  road('Victoria Street', A, [
    [-0.1265, 51.5007], [-0.135, 51.4985], [-0.1435, 51.4965],
  ], { busLane: true }),
  road('Grosvenor Pl / Buckingham Palace Rd', A, [
    [-0.1525, 51.5027], [-0.1435, 51.4965], [-0.148, 51.492], [-0.1495, 51.485],
  ]),
  road('Sloane Street', A, [
    [-0.1607, 51.5017], [-0.1565, 51.4925], [-0.152, 51.488], [-0.1495, 51.485],
  ]),
  road("King's Road", A, [
    [-0.1565, 51.4925], [-0.168, 51.4885], [-0.18, 51.485], [-0.19, 51.482],
  ]),
  road('Brompton Road', A, [
    [-0.1607, 51.5017], [-0.1635, 51.4995], [-0.17, 51.497], [-0.174, 51.494],
  ]),
  road('Cromwell Road', A, [
    [-0.174, 51.494], [-0.1829, 51.4945], [-0.195, 51.495], [-0.21, 51.495],
  ], { busLane: true }),
  road('Exhibition Road', B, [[-0.174, 51.494], [-0.1745, 51.4995], [-0.175, 51.5018]]),
  road('Whitehall', A, [[-0.128, 51.508], [-0.1265, 51.5035], [-0.1265, 51.5007]], { busLane: true }),
  road('Baker Street', A, [
    [-0.1571, 51.5228], [-0.1565, 51.518], [-0.156, 51.515], [-0.1565, 51.5138],
  ]),
  road('Southampton Row / Woburn Place', A, [
    [-0.12, 51.5175], [-0.1235, 51.521], [-0.126, 51.5255], [-0.1295, 51.5273],
  ]),
  road('Haymarket', B, [[-0.1345, 51.5098], [-0.132, 51.5075]], { oneWay: true }),
  road('Northumberland Avenue', B, [[-0.128, 51.5077], [-0.1225, 51.5065]]),
  road('Praed Street', B, [[-0.1665, 51.5175], [-0.1755, 51.5155]]),
  road("St George's / Borough Rd", B, [[-0.106, 51.498], [-0.0955, 51.4995], [-0.09, 51.501]]),
  road('New Kent Road', A, [[-0.099, 51.4945], [-0.088, 51.493], [-0.08, 51.491]]),
  road('Kennington Road', B, [[-0.112, 51.4955], [-0.111, 51.489], [-0.109, 51.4855]]),
  road('Vauxhall Bridge Road', A, [[-0.1435, 51.4965], [-0.135, 51.492], [-0.1278, 51.4885]]),
  road('The Highway', A, [[-0.0755, 51.5095], [-0.066, 51.5105], [-0.0565, 51.511]]),
  road('Jamaica Road', A, [[-0.0752, 51.5033], [-0.0665, 51.4995], [-0.058, 51.497]]),
  // Pedestrian streets
  road('Carnaby Street', Pedestrian, [[-0.139, 51.5135], [-0.139, 51.512]]),
  road("Queen's Walk (South Bank)", Pedestrian, [
    [-0.117, 51.502], [-0.114, 51.5065], [-0.11, 51.5077], [-0.104, 51.508],
    [-0.0985, 51.5077], [-0.0925, 51.5068], [-0.088, 51.506], [-0.083, 51.5055],
    [-0.076, 51.5035],
  ]),
  road('South Molton Street', Pedestrian, [[-0.149, 51.5143], [-0.1475, 51.5128]]),
];

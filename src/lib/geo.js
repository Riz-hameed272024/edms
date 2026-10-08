'use strict';
// Declassifier for location data (SR-07): rounds to 2 decimals (~1.1 km) for low-trust viewers.
function toCoarse(loc) {
  if (!loc) return null;
  return { lat: Math.round(loc.lat * 100) / 100, lon: Math.round(loc.lon * 100) / 100, precision: '~1km' };
}
function distanceMeters(a, b) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
module.exports = { toCoarse, distanceMeters };

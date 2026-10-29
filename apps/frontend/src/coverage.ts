import type { Region } from "./api";

/**
 * Builds a polygon covering the whole world with the region punched out, so the
 * area without tile coverage can be dimmed.
 */
export function coverageMask(region: Region): GeoJSON.Feature<GeoJSON.Polygon> | undefined {
  const geom = region.polygon;
  if (!geom) return undefined;

  const rings: number[][][] =
    geom.type === "Polygon"
      ? [geom.coordinates[0] as number[][]]
      : (geom.coordinates as number[][][][]).map((poly) => poly[0] as number[][]);

  const world: number[][] = [
    [-180, -85.051129],
    [180, -85.051129],
    [180, 85.051129],
    [-180, 85.051129],
    [-180, -85.051129],
  ];

  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [world, ...rings] },
  };
}

export function coverageOutline(
  region: Region,
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | undefined {
  if (!region.polygon) return undefined;
  return { type: "Feature", properties: {}, geometry: region.polygon };
}

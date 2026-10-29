import { useEffect, useRef, useState } from "react";
import {
  GeolocateControl,
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  type GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { styleUrl, type Polygon, type Region, type Theme } from "./api";
import { coverageMask, coverageOutline } from "./coverage";

const MASK_SOURCE = "coverage";
const OUTLINE_SOURCE = "coverage-outline";
const PREVIEW_SOURCE = "preview";

export type Cursor = { lon: number; lat: number; zoom: number };

type Props = {
  region: Region;
  theme: Theme;
  showCoverage: boolean;
  /** boundary of a search result, drawn before it is downloaded */
  preview?: Polygon;
  onCursor: (cursor: Cursor) => void;
};

export function MapView({ region, theme, showCoverage, preview, onCursor }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  // Avoids re-fitting the viewport when only the theme changed.
  const fitted = useRef<string | null>(null);

  // Create the map once; styles and viewport are driven by the effects below.
  useEffect(() => {
    if (!container.current || map.current) return;
    const instance = new MapLibreMap({
      container: container.current,
      style: styleUrl(region, theme),
      bounds: region.bbox,
      fitBoundsOptions: { padding: 24 },
      maxZoom: region.maxzoom + 2,
      attributionControl: { compact: true },
      hash: true,
    });
    instance.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
    instance.addControl(
      new ScaleControl({ maxWidth: 120, unit: "metric" }),
      "bottom-right",
    );
    instance.addControl(
      new GeolocateControl({ trackUserLocation: true }),
      "top-right",
    );

    const report = () => {
      const { lng, lat } = instance.getCenter();
      onCursor({ lon: lng, lat, zoom: instance.getZoom() });
    };
    instance.on("move", report);
    instance.on("mousemove", (e: MapMouseEvent) =>
      onCursor({ lon: e.lngLat.lng, lat: e.lngLat.lat, zoom: instance.getZoom() }),
    );
    instance.on("load", () => {
      setReady(true);
      report();
    });

    fitted.current = region.name;
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap style when the region or theme changes.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    instance.setStyle(styleUrl(region, theme));
    instance.setMaxZoom(region.maxzoom + 2);
    if (fitted.current !== region.name) {
      fitted.current = region.name;
      instance.fitBounds(region.bbox, { padding: 24, duration: 600 });
    }
  }, [region, theme, ready]);

  // (Re)attach the coverage overlay. setStyle discards custom sources, so this
  // listens on both styledata and idle: styledata can fire before the style is
  // actually queryable, and idle is guaranteed to land after it settles.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;

    const attach = () => {
      if (!instance.isStyleLoaded()) return;

      const present = instance.getLayer(`${OUTLINE_SOURCE}-line`) !== undefined;
      if (present === showCoverage && instance.getSource(OUTLINE_SOURCE) !== undefined) {
        // Already in the desired state for this style; refresh the data only.
        if (!showCoverage) return;
        const outline = coverageOutline(region);
        const mask = coverageMask(region);
        if (!outline || !mask) return;
        (instance.getSource(OUTLINE_SOURCE) as GeoJSONSource).setData(outline);
        (instance.getSource(MASK_SOURCE) as GeoJSONSource).setData(mask);
        return;
      }

      for (const id of [`${MASK_SOURCE}-fill`, `${OUTLINE_SOURCE}-line`]) {
        if (instance.getLayer(id)) instance.removeLayer(id);
      }
      for (const id of [MASK_SOURCE, OUTLINE_SOURCE]) {
        if (instance.getSource(id)) instance.removeSource(id);
      }
      if (!showCoverage) return;

      const mask = coverageMask(region);
      const outline = coverageOutline(region);
      if (!mask || !outline) return;

      instance.addSource(MASK_SOURCE, { type: "geojson", data: mask });
      instance.addLayer({
        id: `${MASK_SOURCE}-fill`,
        type: "fill",
        source: MASK_SOURCE,
        paint: { "fill-color": "#0b0f14", "fill-opacity": 0.35 },
      });
      instance.addSource(OUTLINE_SOURCE, { type: "geojson", data: outline });
      instance.addLayer({
        id: `${OUTLINE_SOURCE}-line`,
        type: "line",
        source: OUTLINE_SOURCE,
        paint: { "line-color": "#4f8cff", "line-width": 1.5, "line-opacity": 0.9 },
      });
    };

    attach();
    instance.on("styledata", attach);
    instance.on("idle", attach);
    return () => {
      instance.off("styledata", attach);
      instance.off("idle", attach);
    };
  }, [region, theme, showCoverage, ready]);

  // Boundary of the candidate being considered in the add dialog.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;

    const attach = () => {
      if (!instance.isStyleLoaded()) return;

      if (!preview) {
        if (instance.getLayer(`${PREVIEW_SOURCE}-line`)) {
          instance.removeLayer(`${PREVIEW_SOURCE}-line`);
        }
        if (instance.getLayer(`${PREVIEW_SOURCE}-fill`)) {
          instance.removeLayer(`${PREVIEW_SOURCE}-fill`);
        }
        if (instance.getSource(PREVIEW_SOURCE)) instance.removeSource(PREVIEW_SOURCE);
        return;
      }

      const data = {
        type: "Feature" as const,
        properties: {},
        geometry: preview as GeoJSON.Geometry,
      };
      const source = instance.getSource(PREVIEW_SOURCE) as GeoJSONSource | undefined;
      if (source) {
        source.setData(data);
        return;
      }

      instance.addSource(PREVIEW_SOURCE, { type: "geojson", data });
      instance.addLayer({
        id: `${PREVIEW_SOURCE}-fill`,
        type: "fill",
        source: PREVIEW_SOURCE,
        paint: { "fill-color": "#4f8cff", "fill-opacity": 0.12 },
      });
      instance.addLayer({
        id: `${PREVIEW_SOURCE}-line`,
        type: "line",
        source: PREVIEW_SOURCE,
        paint: { "line-color": "#4f8cff", "line-width": 2, "line-dasharray": [2, 1] },
      });
    };

    attach();
    instance.on("styledata", attach);
    instance.on("idle", attach);
    return () => {
      instance.off("styledata", attach);
      instance.off("idle", attach);
    };
  }, [preview, ready]);

  // Frame a candidate so you can see what you are about to download.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready || !preview) return;
    const bounds = polygonBounds(preview);
    if (bounds) instance.fitBounds(bounds, { padding: 48, duration: 600 });
  }, [preview, ready]);

  return <div ref={container} className="map" />;
}

/** Bounding box of a preview polygon, for framing the map on it. */
function polygonBounds(polygon: Polygon): [number, number, number, number] | undefined {
  let minLon = 180;
  let minLat = 90;
  let maxLon = -180;
  let maxLat = -90;
  const visit = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === "number" && typeof node[1] === "number") {
      const [lon, lat] = node as [number, number];
      minLon = Math.min(minLon, lon);
      minLat = Math.min(minLat, lat);
      maxLon = Math.max(maxLon, lon);
      maxLat = Math.max(maxLat, lat);
      return;
    }
    for (const child of node) visit(child);
  };
  visit(polygon.coordinates);
  return maxLon > minLon ? [minLon, minLat, maxLon, maxLat] : undefined;
}

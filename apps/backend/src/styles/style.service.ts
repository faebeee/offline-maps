import { Injectable } from "@nestjs/common";
import { layers, namedFlavor } from "@protomaps/basemaps";
import type { Region, Theme } from "@offline-maps/shared";

@Injectable()
export class StyleService {
  /**
   * Builds a MapLibre style for one region. Every URL points back at this
   * server, so the viewer never needs a CDN.
   */
  build(region: Region, theme: Theme, origin: string) {
    const flavor = namedFlavor(theme);
    return {
      version: 8 as const,
      name: `${region.label} (${theme})`,
      glyphs: `${origin}/fonts/{fontstack}/{range}.pbf`,
      sprite: `${origin}/sprites/${theme}`,
      sources: {
        protomaps: {
          type: "vector" as const,
          tiles: [`${origin}/tiles/${region.name}/{z}/{x}/{y}.mvt`],
          minzoom: region.minzoom,
          maxzoom: region.maxzoom,
          bounds: region.bbox,
          attribution:
            '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
        },
      },
      layers: [
        {
          id: "background",
          type: "background" as const,
          paint: { "background-color": flavor.background },
        },
        ...layers("protomaps", flavor, { lang: "en" }).filter((l) => l.id !== "background"),
      ],
    };
  }
}

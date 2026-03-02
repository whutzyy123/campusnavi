/**
 * Type declaration for @turf/turf.
 * The package has types at index.d.ts but they are not resolved when respecting
 * package.json "exports". This declaration provides type support until the
 * library updates its package.json.
 */
declare module "@turf/turf" {
  import type { Feature, Polygon, Point } from "geojson";

  export function centroid(feature: Feature | Feature[]): Feature<Point>;
  export function polygon(
    coordinates: number[][][],
    properties?: Record<string, unknown>
  ): Feature<Polygon>;
  export function booleanPointInPolygon(
    point: number[] | Feature<Point>,
    polygon: Feature<Polygon> | Polygon
  ): boolean;
}

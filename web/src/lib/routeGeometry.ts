export type LngLat = [number, number];

const EARTH_R = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Bearing in degrees (0 = north, clockwise) from `a` to `b`. */
export function bearing(a: LngLat, b: LngLat): number {
  const phi1 = toRad(a[1]);
  const phi2 = toRad(b[1]);
  const dLng = toRad(b[0] - a[0]);
  const y = Math.sin(dLng) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * A driving route as a polyline, with the geometry an Uber-style tracker needs:
 * project a live GPS ping onto the line (so the car snaps *onto* the road
 * instead of floating beside it), walk the car to any distance-along, read the
 * heading there, and slice off the path still ahead so the traveled part can be
 * dropped behind the car.
 *
 * All internal distance math runs in a local equirectangular projection (meters)
 * around the route's midpoint latitude — accurate to well under a meter over the
 * few-km scale of a city trip, and far cheaper than per-call geodesic length.
 */
export class RoutePath {
  readonly coords: LngLat[];
  readonly length: number;
  private readonly xy: [number, number][];
  private readonly cum: number[];
  private readonly cosRef: number;

  constructor(coords: LngLat[]) {
    this.coords = coords;
    const lats = coords.map((c) => c[1]);
    const refLatRad = toRad(lats.length ? (Math.min(...lats) + Math.max(...lats)) / 2 : 0);
    this.cosRef = Math.cos(refLatRad);
    this.xy = coords.map(([lng, lat]) => [EARTH_R * toRad(lng) * this.cosRef, EARTH_R * toRad(lat)]);
    this.cum = [0];
    for (let i = 1; i < this.xy.length; i++) {
      const dx = this.xy[i][0] - this.xy[i - 1][0];
      const dy = this.xy[i][1] - this.xy[i - 1][1];
      this.cum.push(this.cum[i - 1] + Math.hypot(dx, dy));
    }
    this.length = this.cum[this.cum.length - 1] ?? 0;
  }

  private unproject(x: number, y: number): LngLat {
    return [toDeg(x / (EARTH_R * this.cosRef)), toDeg(y / EARTH_R)];
  }

  /** Index of the segment [i, i+1] that contains distance-along `d`. */
  private segmentAt(d: number): number {
    const dist = clamp(d, 0, this.length);
    for (let i = 0; i < this.cum.length - 1; i++) {
      if (dist <= this.cum[i + 1]) return i;
    }
    return Math.max(0, this.cum.length - 2);
  }

  /** [lng,lat] at distance-along `d` (clamped to the route). */
  pointAt(d: number): LngLat {
    if (this.coords.length === 1) return this.coords[0];
    const dist = clamp(d, 0, this.length);
    const i = this.segmentAt(dist);
    const segLen = this.cum[i + 1] - this.cum[i];
    const t = segLen > 0 ? (dist - this.cum[i]) / segLen : 0;
    const [x0, y0] = this.xy[i];
    const [x1, y1] = this.xy[i + 1];
    return this.unproject(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
  }

  /** Heading (deg) the vehicle faces at distance-along `d`. */
  bearingAt(d: number): number {
    if (this.coords.length < 2) return 0;
    const i = this.segmentAt(clamp(d, 0, this.length));
    return bearing(this.coords[i], this.coords[i + 1]);
  }

  /** Sub-polyline from `fromD` to `toD` (distances-along), with interpolated
   *  endpoints and every original vertex between them. Returns a single point
   *  for a zero/degenerate span (caller renders nothing for < 2 points). */
  slice(fromD: number, toD: number): LngLat[] {
    const a = clamp(Math.min(fromD, toD), 0, this.length);
    const b = clamp(Math.max(fromD, toD), 0, this.length);
    if (this.coords.length < 2 || b - a < 1e-6) return [this.pointAt(a)];
    const out: LngLat[] = [this.pointAt(a)];
    for (let i = 0; i < this.coords.length; i++) {
      if (this.cum[i] > a && this.cum[i] < b) out.push(this.coords[i]);
    }
    out.push(this.pointAt(b));
    return out;
  }

  /** Project a live GPS point onto the route. Returns the distance-along of the
   *  nearest point and the perpendicular `offset` from the route (meters) — the
   *  offset tells the caller whether the technician strayed off the planned
   *  route (took a wrong turn / got rerouted) and a fresh route is warranted. */
  project(point: LngLat): { along: number; offset: number } {
    const px = EARTH_R * toRad(point[0]) * this.cosRef;
    const py = EARTH_R * toRad(point[1]);
    if (this.coords.length === 1) {
      const [x0, y0] = this.xy[0];
      return { along: 0, offset: Math.hypot(px - x0, py - y0) };
    }
    let best = { along: 0, offset: Infinity };
    for (let i = 0; i < this.xy.length - 1; i++) {
      const [x0, y0] = this.xy[i];
      const [x1, y1] = this.xy[i + 1];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const segLenSq = dx * dx + dy * dy;
      const t = segLenSq > 0 ? clamp(((px - x0) * dx + (py - y0) * dy) / segLenSq, 0, 1) : 0;
      const offset = Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
      if (offset < best.offset) best = { along: this.cum[i] + t * Math.sqrt(segLenSq), offset };
    }
    return best;
  }
}

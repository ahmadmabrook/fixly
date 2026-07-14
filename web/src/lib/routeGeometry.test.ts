import { describe, it, expect } from 'vitest';
import { RoutePath, bearing, type LngLat } from './routeGeometry';

// A short L-shaped route in Amman: east along a parallel, then north along a
// meridian. Using axis-aligned legs keeps the expected geometry easy to reason
// about while still exercising the projection math.
const A: LngLat = [35.90, 31.95];
const B: LngLat = [35.92, 31.95]; // ~1.9 km east of A
const C: LngLat = [35.92, 31.96]; // ~1.1 km north of B
const route = new RoutePath([A, B, C]);

describe('bearing', () => {
  it('is ~90° due east', () => {
    expect(bearing(A, B)).toBeCloseTo(90, 0);
  });
  it('is ~0° due north', () => {
    expect(bearing(B, C)).toBeCloseTo(0, 0);
  });
});

describe('RoutePath.length', () => {
  it('sums the leg distances (~3 km total)', () => {
    expect(route.length).toBeGreaterThan(2_900);
    expect(route.length).toBeLessThan(3_200);
  });
});

describe('RoutePath.pointAt', () => {
  it('returns the first vertex at distance 0', () => {
    const [lng, lat] = route.pointAt(0);
    expect(lng).toBeCloseTo(A[0], 5);
    expect(lat).toBeCloseTo(A[1], 5);
  });
  it('returns the last vertex at (and past) the full length', () => {
    const [lng, lat] = route.pointAt(route.length);
    expect(lng).toBeCloseTo(C[0], 5);
    expect(lat).toBeCloseTo(C[1], 5);
    // clamps beyond the end
    const [lng2, lat2] = route.pointAt(route.length + 5_000);
    expect(lng2).toBeCloseTo(C[0], 5);
    expect(lat2).toBeCloseTo(C[1], 5);
  });
  it('interpolates along the first (east-west) leg', () => {
    const legLen = new RoutePath([A, B]).length;
    const [lng, lat] = route.pointAt(legLen / 2);
    expect(lat).toBeCloseTo(A[1], 4); // still on the parallel
    expect(lng).toBeGreaterThan(A[0]);
    expect(lng).toBeLessThan(B[0]);
  });
});

describe('RoutePath.bearingAt', () => {
  it('faces east on the first leg and north on the second', () => {
    expect(route.bearingAt(10)).toBeCloseTo(90, 0);
    expect(route.bearingAt(route.length - 10)).toBeCloseTo(0, 0);
  });
});

describe('RoutePath.project', () => {
  it('a point exactly on the route has ~0 offset and the right distance-along', () => {
    const midFirstLeg: LngLat = [35.91, 31.95];
    const { along, offset } = route.project(midFirstLeg);
    expect(offset).toBeLessThan(1);
    const firstLeg = new RoutePath([A, B]).length;
    expect(along).toBeCloseTo(firstLeg / 2, -1); // within ~10m
  });

  it('reports a large offset when the technician is well off the route', () => {
    const offRoute: LngLat = [35.91, 31.97]; // well north of the route
    const { offset } = route.project(offRoute);
    expect(offset).toBeGreaterThan(1_000);
  });

  it('never moves the projection backward past the start', () => {
    const beforeStart: LngLat = [35.89, 31.95]; // west of A
    const { along } = route.project(beforeStart);
    expect(along).toBeGreaterThanOrEqual(0);
  });
});

describe('RoutePath.slice', () => {
  it('the remaining slice from the midpoint keeps the far vertex + endpoint', () => {
    const half = route.length / 2;
    const remaining = route.slice(half, route.length);
    // ends exactly at C
    const last = remaining[remaining.length - 1];
    expect(last[0]).toBeCloseTo(C[0], 5);
    expect(last[1]).toBeCloseTo(C[1], 5);
    // includes the corner vertex B (which lies past the midpoint)
    expect(remaining.some(([lng, lat]) => Math.abs(lng - B[0]) < 1e-6 && Math.abs(lat - B[1]) < 1e-6)).toBe(true);
  });

  it('collapses a zero-length span to a single point (nothing to draw)', () => {
    expect(route.slice(100, 100)).toHaveLength(1);
  });

  it('the full slice reproduces the whole route end to end', () => {
    const full = route.slice(0, route.length);
    expect(full[0][0]).toBeCloseTo(A[0], 5);
    expect(full[full.length - 1][0]).toBeCloseTo(C[0], 5);
  });
});

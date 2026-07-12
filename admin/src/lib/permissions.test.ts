import { describe, it, expect } from 'vitest';
import { ADMIN_ROUTES, canAccessRoles, canAccessRoute, rolesForPath } from './permissions';

describe('canAccessRoles (least-privilege role check)', () => {
  it('allows everyone when roles is undefined (unrestricted)', () => {
    expect(canAccessRoles(undefined, undefined)).toBe(true);
    expect(canAccessRoles('SUPPORT', undefined)).toBe(true);
  });

  it('only allows SUPER_ADMIN when roles is an empty array', () => {
    expect(canAccessRoles('SUPER_ADMIN', [])).toBe(true);
    expect(canAccessRoles('OPS', [])).toBe(false);
    expect(canAccessRoles(undefined, [])).toBe(false);
  });

  it('allows an exact role match', () => {
    expect(canAccessRoles('FINANCE', ['FINANCE'])).toBe(true);
    expect(canAccessRoles('OPS', ['FINANCE'])).toBe(false);
  });

  it('SUPER_ADMIN always passes regardless of the roles list', () => {
    expect(canAccessRoles('SUPER_ADMIN', ['FINANCE'])).toBe(true);
    expect(canAccessRoles('SUPER_ADMIN', ['SUPPORT', 'OPS'])).toBe(true);
  });

  it('an unknown/missing role is denied for any restricted route', () => {
    expect(canAccessRoles(undefined, ['OPS'])).toBe(false);
  });
});

describe('rolesForPath / canAccessRoute', () => {
  it('resolves the roles registered in ADMIN_ROUTES', () => {
    expect(rolesForPath('/payouts')).toEqual(['FINANCE']);
    expect(rolesForPath('/dashboard')).toBeUndefined();
    expect(rolesForPath('/admins')).toEqual([]);
  });

  it('treats an unknown path as unrestricted (defaults to undefined roles)', () => {
    expect(rolesForPath('/not-a-real-route')).toBeUndefined();
    expect(canAccessRoute(undefined, '/not-a-real-route')).toBe(true);
  });

  it('every restricted route in the map denies at least one real role', () => {
    // Sanity check that the map actually encodes *some* restriction for
    // every entry that isn't explicitly unrestricted — guards against a
    // future edit accidentally widening a route to `roles: undefined`.
    const restricted = ADMIN_ROUTES.filter((r) => r.roles !== undefined);
    expect(restricted.length).toBeGreaterThan(0);
    for (const route of restricted) {
      expect(canAccessRoute('SUPER_ADMIN', route.to)).toBe(true);
    }
  });

  it('matches the FINANCE/OPS/SUPPORT boundaries used across the admin panel', () => {
    expect(canAccessRoute('FINANCE', '/payouts')).toBe(true);
    expect(canAccessRoute('OPS', '/payouts')).toBe(false);
    expect(canAccessRoute('SUPPORT', '/support')).toBe(true);
    expect(canAccessRoute('OPS', '/support')).toBe(false);
    expect(canAccessRoute('OPS', '/customers')).toBe(true);
    expect(canAccessRoute('SUPPORT', '/customers')).toBe(true);
    expect(canAccessRoute('FINANCE', '/customers')).toBe(false);
  });
});

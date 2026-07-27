/**
 * Barrel re-export for the shared UI primitives used across pages. The
 * implementations live in ./shared/* (split by concern so no single file
 * grows unwieldy); this file exists so every existing
 * `import { X } from '../components/shared'` call site keeps working
 * unchanged.
 */
export * from './shared/skeletons';
export * from './shared/badges';
export * from './shared/dialogs';
export * from './shared/misc';
export * from './shared/domain';
export * from './shared/upload';

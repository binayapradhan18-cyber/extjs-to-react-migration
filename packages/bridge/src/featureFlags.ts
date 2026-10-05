export type UiMode = 'legacy' | 'react';

export interface ModuleRollout {
  default: UiMode;
  /** False until the React module reaches parity; forces legacy regardless of overrides. */
  reactAvailable: boolean;
  /** Operational rollback: forces legacy for everyone, overriding URL and storage. */
  killSwitch?: boolean;
}

export type RolloutConfig<M extends string = string> = Record<M, ModuleRollout>;

export type ResolveReason = 'kill-switch' | 'not-available' | 'url-module' | 'url-global' | 'storage' | 'default';

export interface UiResolution {
  mode: UiMode;
  reason: ResolveReason;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface FlagSources {
  search: string;
  storage: StorageLike | null;
  storagePrefix?: string;
}

const isUiMode = (value: unknown): value is UiMode => value === 'legacy' || value === 'react';

function safeGet(storage: StorageLike | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/**
 * Precedence: kill switch > availability > `?ui.<module>=` > `?ui=` > localStorage > rollout default.
 * The reason is returned so the shell can log which path each user took.
 */
export function resolveModuleUi(moduleId: string, rollout: ModuleRollout | undefined, sources: FlagSources): UiResolution {
  if (!rollout) return { mode: 'legacy', reason: 'not-available' };
  if (rollout.killSwitch) return { mode: 'legacy', reason: 'kill-switch' };
  if (!rollout.reactAvailable) return { mode: 'legacy', reason: 'not-available' };
  const params = new URLSearchParams(sources.search);
  const perModule = params.get(`ui.${moduleId}`);
  if (isUiMode(perModule)) return { mode: perModule, reason: 'url-module' };
  const global = params.get('ui');
  if (isUiMode(global)) return { mode: global, reason: 'url-global' };
  const stored = safeGet(sources.storage, `${sources.storagePrefix ?? 'ui:'}${moduleId}`);
  if (isUiMode(stored)) return { mode: stored, reason: 'storage' };
  return { mode: rollout.default, reason: 'default' };
}

export interface FeatureRouterOptions {
  search?: () => string;
  storage?: StorageLike | null;
  storagePrefix?: string;
  onResolve?: (moduleId: string, resolution: UiResolution) => void;
}

export interface FeatureRouter<M extends string> {
  resolve(moduleId: M): UiResolution;
  /** Persists a per-user choice; `null` clears it back to the rollout default. */
  set(moduleId: M, mode: UiMode | null): void;
  select<T>(moduleId: M, views: Record<UiMode, () => T>): T;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function createFeatureRouter<M extends string>(
  rollout: RolloutConfig<M>,
  options: FeatureRouterOptions = {},
): FeatureRouter<M> {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const prefix = options.storagePrefix ?? 'ui:';
  const search = options.search ?? (() => (typeof window === 'undefined' ? '' : window.location.search));

  const resolve = (moduleId: M): UiResolution => {
    const resolution = resolveModuleUi(moduleId, rollout[moduleId], { search: search(), storage, storagePrefix: prefix });
    options.onResolve?.(moduleId, resolution);
    return resolution;
  };

  return {
    resolve,
    set(moduleId, mode) {
      try {
        if (mode) storage?.setItem(`${prefix}${moduleId}`, mode);
        else storage?.removeItem(`${prefix}${moduleId}`);
      } catch {
        // Storage can be unavailable (privacy mode, quota); the choice simply won't persist.
      }
    },
    select(moduleId, views) {
      return views[resolve(moduleId).mode]();
    },
  };
}

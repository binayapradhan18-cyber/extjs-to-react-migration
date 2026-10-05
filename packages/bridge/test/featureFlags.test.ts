import { describe, expect, it, vi } from 'vitest';
import { createFeatureRouter, resolveModuleUi, type RolloutConfig, type StorageLike } from '../src/featureFlags';

function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const rollout: RolloutConfig<'tasks' | 'dashboard' | 'reports'> = {
  tasks: { default: 'legacy', reactAvailable: true },
  dashboard: { default: 'react', reactAvailable: true },
  reports: { default: 'legacy', reactAvailable: false },
};

describe('resolveModuleUi', () => {
  it('falls back to the rollout default', () => {
    expect(resolveModuleUi('tasks', rollout.tasks, { search: '', storage: null })).toEqual({ mode: 'legacy', reason: 'default' });
    expect(resolveModuleUi('dashboard', rollout.dashboard, { search: '', storage: null })).toEqual({ mode: 'react', reason: 'default' });
  });

  it('applies precedence: per-module URL > global URL > storage > default', () => {
    const storage = memoryStorage({ 'ui:tasks': 'react' });
    expect(resolveModuleUi('tasks', rollout.tasks, { search: '', storage }).reason).toBe('storage');
    expect(resolveModuleUi('tasks', rollout.tasks, { search: '?ui=legacy', storage })).toEqual({ mode: 'legacy', reason: 'url-global' });
    expect(resolveModuleUi('tasks', rollout.tasks, { search: '?ui=legacy&ui.tasks=react', storage })).toEqual({
      mode: 'react',
      reason: 'url-module',
    });
  });

  it('ignores invalid values', () => {
    expect(resolveModuleUi('tasks', rollout.tasks, { search: '?ui=vue', storage: memoryStorage({ 'ui:tasks': 'angular' }) }).reason).toBe(
      'default',
    );
  });

  it('never mounts React for unmigrated modules or when the kill switch is on', () => {
    expect(resolveModuleUi('reports', rollout.reports, { search: '?ui=react', storage: null })).toEqual({
      mode: 'legacy',
      reason: 'not-available',
    });
    const killed = { ...rollout.dashboard, killSwitch: true };
    expect(resolveModuleUi('dashboard', killed, { search: '?ui.dashboard=react', storage: null })).toEqual({
      mode: 'legacy',
      reason: 'kill-switch',
    });
  });

  it('survives storage that throws (privacy mode)', () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(resolveModuleUi('tasks', rollout.tasks, { search: '', storage }).mode).toBe('legacy');
  });
});

describe('createFeatureRouter', () => {
  it('persists per-module choices, reports resolutions and selects the matching view', () => {
    const onResolve = vi.fn();
    const storage = memoryStorage();
    const router = createFeatureRouter(rollout, { storage, search: () => '', onResolve });

    router.set('tasks', 'react');
    expect(router.select('tasks', { legacy: () => 'ext-grid', react: () => 'react-grid' })).toBe('react-grid');
    expect(router.resolve('dashboard').mode).toBe('react');
    expect(onResolve).toHaveBeenCalledWith('tasks', { mode: 'react', reason: 'storage' });

    router.set('tasks', null);
    expect(router.resolve('tasks')).toEqual({ mode: 'legacy', reason: 'default' });
  });
});

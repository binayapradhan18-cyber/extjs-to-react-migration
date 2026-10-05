import { createEventBus, createTranslator, type BridgeEvent, type HostContext } from '@migration/bridge';
import en from '@migration/bridge/locales/en.json';

/** What the Ext shell would normally provide, for running the React module on its own. */
export function createStandaloneHost(overrides: Partial<HostContext> = {}): HostContext {
  let z = 1000;
  return {
    bus: createEventBus<BridgeEvent>(),
    session: { userId: 'dev', displayName: 'Standalone Developer', token: 'dev-token', projectId: 'P-100' },
    locale: 'en',
    t: createTranslator(en),
    apiBaseUrl: import.meta.env.BASE_URL,
    zIndex: { next: () => (z += 10) },
    ...overrides,
  };
}

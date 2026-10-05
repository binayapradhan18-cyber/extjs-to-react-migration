import type { EventBus } from '../eventBus';
import type { Translate } from '../i18n';
import type { BridgeEvent } from './events';

export interface SessionInfo {
  userId: string;
  displayName: string;
  /** Issued by the legacy login; React never authenticates on its own. */
  token: string;
  projectId: string;
}

export interface LegacyRecordLike {
  getData(): Record<string, unknown>;
}

export type StoreListener = (...args: unknown[]) => void;

export interface ExtStoreLike<R = unknown> {
  getRange(): R[];
  on(eventName: string, fn: StoreListener): unknown;
  un(eventName: string, fn: StoreListener): unknown;
}

/** Everything a React widget may receive from the host. Passed in, never read from globals. */
export interface HostContext {
  bus: EventBus<BridgeEvent>;
  session: SessionInfo;
  locale: string;
  t: Translate;
  apiBaseUrl: string;
  /** Ext's z-index manager; React portals take their stacking order from it. */
  zIndex: { next(): number };
  legacyStores?: {
    tasks?: ExtStoreLike<LegacyRecordLike> | undefined;
  };
}

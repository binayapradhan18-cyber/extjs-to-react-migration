import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useHost } from '../host/HostProvider';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

interface PendingConfirm extends ConfirmOptions {
  zIndex: number;
  resolve: (value: boolean) => void;
}

const ConfirmCtx = createContext<Confirm | null>(null);

/** The React counterpart of Ext.Msg.confirm, stacked through the host's z-index manager. */
export function ModalProvider({ children }: { children: ReactNode }) {
  const { zIndex } = useHost();
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);

  const settle = useCallback((value: boolean) => {
    pendingRef.current?.resolve(value);
    pendingRef.current = null;
    setPending(null);
  }, []);

  const confirm = useCallback<Confirm>(
    (options) =>
      new Promise<boolean>((resolve) => {
        pendingRef.current?.resolve(false);
        const next = { ...options, resolve, zIndex: zIndex.next() };
        pendingRef.current = next;
        setPending(next);
      }),
    [zIndex],
  );

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {pending ? createPortal(<ConfirmDialog request={pending} onSettle={settle} />, document.body) : null}
    </ConfirmCtx.Provider>
  );
}

function ConfirmDialog({ request, onSettle }: { request: PendingConfirm; onSettle: (value: boolean) => void }) {
  const { t } = useHost();
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => confirmRef.current?.focus(), []);

  // Portals render outside the widget root, so they re-apply the scoping class to keep styles isolated.
  return (
    <div className="rw-root rw-modal-layer" style={{ zIndex: request.zIndex }}>
      <div className="rw-modal-backdrop" onClick={() => onSettle(false)} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="rw-confirm-title"
        aria-describedby="rw-confirm-message"
        className="rw-modal"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onSettle(false);
        }}
      >
        <h3 id="rw-confirm-title">{request.title}</h3>
        <p id="rw-confirm-message">{request.message}</p>
        <div className="rw-modal__actions">
          <button type="button" className="rw-btn rw-btn--secondary" onClick={() => onSettle(false)}>
            {request.cancelLabel ?? t('common.cancel')}
          </button>
          <button type="button" className="rw-btn rw-btn--danger" ref={confirmRef} onClick={() => onSettle(true)}>
            {request.confirmLabel ?? t('common.discard')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmCtx);
  if (!confirm) throw new Error('useConfirm() must be used inside <ModalProvider>');
  return confirm;
}

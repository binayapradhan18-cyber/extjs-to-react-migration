import type { HostContext } from '@migration/bridge';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { TaskApi } from './api/taskApi';
import { HostProvider } from './host/HostProvider';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { ModalProvider } from './ui/ModalProvider';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    },
  });
}

interface WidgetRootProps {
  host: HostContext;
  widget: string;
  api?: TaskApi;
  queryClient?: QueryClient;
  children: ReactNode;
}

/** Providers every embedded module gets. Each mount owns its QueryClient, so widgets never share cache by accident. */
export function WidgetRoot({ host, widget, api, queryClient, children }: WidgetRootProps) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <HostProvider host={host} api={api}>
      <QueryClientProvider client={client}>
        <ModalProvider>
          <div className="rw-root" lang={host.locale} data-widget={widget}>
            <ErrorBoundary
              onError={(error) => host.bus.emit({ type: 'widget:error', widget, message: error.message, source: 'react' })}
              fallback={(reset) => (
                <div role="alert" className="rw-error">
                  <p>{host.t('widget.error')}</p>
                  <button type="button" className="rw-btn" onClick={reset}>
                    {host.t('widget.retry')}
                  </button>
                </div>
              )}
            >
              {children}
            </ErrorBoundary>
          </div>
        </ModalProvider>
      </QueryClientProvider>
    </HostProvider>
  );
}

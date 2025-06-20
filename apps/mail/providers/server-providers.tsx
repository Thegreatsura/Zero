import { LocaleCacheProvider } from '@/components/context/locale-cache-context';
import { CachedIntlProvider } from '@/components/context/cached-intl-provider';
import type { IntlMessages, Locale } from '@/i18n/config';
import { QueryProvider } from './query-provider';
import { AutumnProvider } from 'autumn-js/react';
import type { PropsWithChildren } from 'react';

export function ServerProviders({
  children,
  messages,
  locale,
  connectionId,
}: PropsWithChildren<{ messages: IntlMessages; locale: Locale; connectionId: string | null }>) {
  return (
    <AutumnProvider backendUrl={import.meta.env.VITE_PUBLIC_BACKEND_URL}>
      <LocaleCacheProvider initialMessages={messages} locale={locale}>
        <CachedIntlProvider>
          <QueryProvider connectionId={connectionId}>{children}</QueryProvider>
        </CachedIntlProvider>
      </LocaleCacheProvider>
    </AutumnProvider>
  );
}

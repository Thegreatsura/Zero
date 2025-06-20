'use client';

import { useLocaleCache } from './locale-cache-context';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';
import { Loader2 } from 'lucide-react';

export function CachedIntlProvider({ children }: PropsWithChildren) {
  const { messages, locale, isLoading, error } = useLocaleCache();

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin" />
      </div>
    );
  }

  if (error || !messages) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="text-center">
          <p className="text-red-500">Failed to load language resources</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <IntlProvider messages={messages} locale={locale} timeZone={'UTC'}>
      {children}
    </IntlProvider>
  );
}

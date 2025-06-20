'use client';

import { createContext, useContext, type PropsWithChildren } from 'react';
import type { IntlMessages, Locale } from '@/i18n/config';
import { useQuery } from '@tanstack/react-query';

interface LocaleCacheContextType {
  messages: IntlMessages | null;
  locale: Locale;
  isLoading: boolean;
  error: Error | null;
}

const LocaleCacheContext = createContext<LocaleCacheContextType | undefined>(undefined);

const CACHE_KEY_PREFIX = 'zero-mail-locale-';
const CACHE_VERSION = '1.0.0';
const CACHE_EXPIRY_HOURS = 24;

interface CachedMessages {
  messages: IntlMessages;
  version: string;
  timestamp: number;
}

const localStoragePersister = {
  get: (key: string): CachedMessages | null => {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const parsedCache: CachedMessages = JSON.parse(cached);
      const isExpired = Date.now() - parsedCache.timestamp > CACHE_EXPIRY_HOURS * 60 * 60 * 1000;
      const isWrongVersion = parsedCache.version !== CACHE_VERSION;

      if (isExpired || isWrongVersion) {
        localStorage.removeItem(key);
        return null;
      }

      return parsedCache;
    } catch (e) {
      console.warn('Failed to load cached locale messages:', e);
      return null;
    }
  },
  set: (key: string, messages: IntlMessages): void => {
    try {
      const cacheData: CachedMessages = {
        messages,
        version: CACHE_VERSION,
        timestamp: Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(cacheData));
    } catch (e) {
      console.warn('Failed to cache locale messages:', e);
    }
  },
};

async function fetchLocaleMessages(locale: Locale): Promise<IntlMessages> {
  const res = await fetch(`/api/locale/${locale}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch locale: ${res.statusText}`);
  }
  return res.json();
}

export function LocaleCacheProvider({
  children,
  initialMessages,
  locale,
}: PropsWithChildren<{ initialMessages?: IntlMessages; locale: Locale }>) {
  const cacheKey = `${CACHE_KEY_PREFIX}${locale}`;

  const {
    data: messages,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['locale', locale],
    queryFn: () => fetchLocaleMessages(locale),
    enabled: !initialMessages,
    initialData: () => {
      if (initialMessages) {
        localStoragePersister.set(cacheKey, initialMessages);
        return initialMessages;
      }

      const cached = localStoragePersister.get(cacheKey);
      return cached?.messages || undefined;
    },
    staleTime: CACHE_EXPIRY_HOURS * 60 * 60 * 1000,
    gcTime: CACHE_EXPIRY_HOURS * 60 * 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    meta: {
      noGlobalError: true,
    },
  });

  if (messages && !initialMessages) {
    localStoragePersister.set(cacheKey, messages);
  }

  return (
    <LocaleCacheContext.Provider
      value={{
        messages: messages || initialMessages || null,
        locale,
        isLoading: isLoading && !initialMessages,
        error: error as Error | null,
      }}
    >
      {children}
    </LocaleCacheContext.Provider>
  );
}

export function useLocaleCache() {
  const context = useContext(LocaleCacheContext);
  if (!context) {
    throw new Error('useLocaleCache must be used within LocaleCacheProvider');
  }
  return context;
}

export function clearLocaleCache(locale?: Locale) {
  if (locale) {
    localStorage.removeItem(`${CACHE_KEY_PREFIX}${locale}`);
  } else {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(CACHE_KEY_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  }
}

'use client';

import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import type { IntlMessages, Locale } from '@/i18n/config';

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

export function LocaleCacheProvider({
  children,
  initialMessages,
  locale,
}: PropsWithChildren<{ initialMessages?: IntlMessages; locale: Locale }>) {
  const [messages, setMessages] = useState<IntlMessages | null>(initialMessages || null);
  const [isLoading, setIsLoading] = useState(!initialMessages);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const cacheKey = `${CACHE_KEY_PREFIX}${locale}`;

    if (initialMessages) {
      const cacheData: CachedMessages = {
        messages: initialMessages,
        version: CACHE_VERSION,
        timestamp: Date.now(),
      };
      try {
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
      } catch (e) {
        console.warn('Failed to cache locale messages:', e);
      }
      return;
    }

    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsedCache: CachedMessages = JSON.parse(cached);
        const isExpired = Date.now() - parsedCache.timestamp > CACHE_EXPIRY_HOURS * 60 * 60 * 1000;
        const isWrongVersion = parsedCache.version !== CACHE_VERSION;

        if (!isExpired && !isWrongVersion) {
          setMessages(parsedCache.messages);
          setIsLoading(false);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to load cached locale messages:', e);
    }

    setIsLoading(true);
    setError(null);

    fetch(`/api/locale/${locale}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch locale: ${res.statusText}`);
        return res.json() as Promise<IntlMessages>;
      })
      .then((fetchedMessages) => {
        setMessages(fetchedMessages);

        const cacheData: CachedMessages = {
          messages: fetchedMessages,
          version: CACHE_VERSION,
          timestamp: Date.now(),
        };
        try {
          localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } catch (e) {
          console.warn('Failed to cache locale messages:', e);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch locale messages:', err);
        setError(err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [locale, initialMessages]);

  return (
    <LocaleCacheContext.Provider value={{ messages, locale, isLoading, error }}>
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

import type { Route } from './+types/api.locale.$locale';
import { getMessages } from '@/i18n/request';

export async function loader({ params }: Route.LoaderArgs) {
  const locale = params.locale || 'en';

  try {
    const messages = await getMessages(locale);

    return Response.json(messages, {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400', // Cache for 1 hour client-side, 24 hours CDN
      },
    });
  } catch (error) {
    console.error('Failed to load messages for locale:', locale, error);

    const fallbackMessages = await getMessages('en');
    return Response.json(fallbackMessages, {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    });
  }
}

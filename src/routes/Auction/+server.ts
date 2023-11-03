import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
  return new Response(null, {
    status: 301,
    headers: {
      'Location': '/auctions'
    }
  });
};
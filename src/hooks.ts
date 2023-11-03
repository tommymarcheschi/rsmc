import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ request, resolve }) => {
  if (request.path === '/Auction') {
    return Response.redirect('/auctions', 301);
  }

  const response = await resolve(request);
  return response;
};
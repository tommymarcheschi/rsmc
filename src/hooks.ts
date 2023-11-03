import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ request, resolve }) => {
  if (request.path === '/Auction') {
    return Response.redirect('/auctions', 301);
  }
  console.log('Redirecting from /Auction to /auctions');

  const response = await resolve(request);
  return response;
};
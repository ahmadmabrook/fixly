/**
 * Cloudflare Pages Function — reverse proxy /api/* to the Fly.io backend.
 * Preserves headers (including cookies for httpOnly refresh tokens) and
 * streams the response back. This makes the backend same-origin from the
 * browser's perspective, so credentials:'include' + CORS work seamlessly.
 */
const BACKEND = 'https://fixly.fly.dev';

export const onRequest: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, BACKEND);

  const headers = new Headers(request.headers);
  headers.set('X-Forwarded-Host', url.hostname);

  const res = await fetch(target.toString(), {
    method: request.method,
    headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    redirect: 'manual',
  });

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
};

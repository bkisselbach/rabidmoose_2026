// Vercel Edge Middleware: HTTP Basic Auth in front of the whole site (pages and assets alike).
// Free-plan substitute for Vercel's paid Password Protection. The password lives in the
// SITE_PASSWORD env var (Vercel dashboard → Settings → Environment Variables); any username is
// accepted. Unset SITE_PASSWORD to open the site back up. Runs only on Vercel -- `vite dev`
// locally is unaffected.
export const config = { matcher: '/(.*)' };

export default function middleware(request: Request): Response | undefined {
  const password = process.env.SITE_PASSWORD;
  if (!password) return undefined;

  const header = request.headers.get('authorization') ?? '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    try {
      // Everything after the first ':' is the password -- usernames may not contain ':'.
      const supplied = atob(encoded).split(':').slice(1).join(':');
      if (supplied === password) return undefined;
    } catch {
      // Malformed base64 falls through to the 401.
    }
  }

  return new Response('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="RabidMoose"' },
  });
}

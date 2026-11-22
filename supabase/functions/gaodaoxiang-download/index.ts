const installer = 'GaodaoXiang-1.2.0-Windows-x64-Setup.exe';
const length = 32_599_091;
const partSize = 2 * 1024 * 1024;
const allowedOrigins = new Set(['https://qingxia.aixiaolv.icu', 'https://qingxia.vercel.app']);

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  });
  if (origin && allowedOrigins.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set(
      'Access-Control-Allow-Headers',
      'authorization, apikey, content-type, x-client-info',
    );
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET') return new Response(null, { status: 405, headers });
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer [\w.-]{1,4096}$/.test(authorization))
    return new Response(null, { status: 401, headers });
  const part = new URL(request.url).searchParams.get('part');
  if (part !== null && (!/^\d{1,2}$/.test(part) || Number(part) >= Math.ceil(length / partSize)))
    return new Response(null, { status: 416, headers });
  const start = part === null ? 0 : Number(part) * partSize;
  const end = part === null ? length - 1 : Math.min(start + partSize, length) - 1;
  const bytes = end - start + 1;

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    const key =
      keys.default ??
      Object.values(keys).find(
        (value) => typeof value === 'string' && value.startsWith('sb_secret_'),
      );
    if (!url || typeof key !== 'string') return new Response(null, { status: 503, headers });
    const auth = await fetch(url + '/auth/v1/user', {
      headers: { apikey: key, Authorization: authorization },
      signal: AbortSignal.timeout(10000),
    });
    if (!auth.ok) return new Response(null, { status: auth.status >= 500 ? 502 : 401, headers });
    const user = await auth.json();
    if (!user.email_confirmed_at || user.is_anonymous)
      return new Response(null, { status: 401, headers });

    const fileHeaders = new Headers({ apikey: key, Authorization: 'Bearer ' + key });
    if (part !== null) fileHeaders.set('Range', `bytes=${start}-${end}`);
    const file = await fetch(url + '/storage/v1/object/desktop-installers/' + installer, {
      headers: fileHeaders,
      signal: request.signal,
    });
    if (
      file.status !== (part === null ? 200 : 206) ||
      !file.body ||
      Number(file.headers.get('content-length')) !== bytes ||
      (part !== null && file.headers.get('content-range') !== `bytes ${start}-${end}/${length}`)
    ) {
      await file.body?.cancel();
      return new Response(null, { status: 502, headers });
    }
    headers.set('Content-Type', 'application/octet-stream');
    headers.set('Content-Disposition', 'attachment; filename="' + installer + '"');
    headers.set('Content-Length', String(bytes));
    return new Response(file.body, { status: 200, headers });
  } catch {
    return new Response(null, { status: 502, headers });
  }
});

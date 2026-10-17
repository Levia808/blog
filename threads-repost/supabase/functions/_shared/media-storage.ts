// R2 credentials stay in the Worker; Edge Functions use a separate service secret.
export function mediaStorage(fallback: any) {
  const configured = Deno.env.get('BLOG_MEDIA_ORIGIN');
  if (!configured) return fallback;
  const token = Deno.env.get('BLOG_MEDIA_TOKEN');
  const endpoint = new URL(configured);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash || !token) throw new Error('R2 media gateway is not configured');
  const origin = endpoint.origin;
  return {
    from(bucket: string) {
      async function call(path: string, method: string, body: BodyInit, headers: Record<string, string> = {}) {
        try {
          const response = await fetch(origin + '/object/' + path, { method, body, redirect: 'error', headers: { ...headers, 'X-Blog-Internal-Token': token! } });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'R2 operation failed');
          return { data, error: null };
        } catch (error) { return { data: null, error }; }
      }
      return {
        getPublicUrl(path: string) { return { data: { publicUrl: origin + '/object/public/' + bucket + '/' + path.split('/').map(encodeURIComponent).join('/') } }; },
        upload(path: string, body: BodyInit, options: any = {}) {
          return call(bucket + '/' + path.split('/').map(encodeURIComponent).join('/'), 'PUT', body, {
            'Content-Type': options.contentType || 'application/octet-stream', 'X-Upsert': options.upsert ? 'true' : 'false'
          });
        },
        list(prefix: string, options: any = {}) { return call('list/' + bucket, 'POST', JSON.stringify({ ...options, prefix }), { 'Content-Type': 'application/json' }); },
        remove(paths: string[]) { return call(bucket, 'DELETE', JSON.stringify({ prefixes: paths }), { 'Content-Type': 'application/json' }); }
      };
    }
  };
}

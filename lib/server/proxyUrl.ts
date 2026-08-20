export const maxProxyQueryLength = 2_048;

export function buildProxyUpstreamUrl(baseUrl: string, backendPath: string, search: string) {
  if (search.length > maxProxyQueryLength) return null;
  const upstream = new URL(`${baseUrl.replace(/\/$/, "")}${backendPath}`);
  upstream.search = search;
  return upstream.toString();
}

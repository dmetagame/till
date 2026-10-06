/** Pin transport URLs behind the host's HTTPS proxy, without changing checkout rules. */
export function configuredPublicOrigin(value) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PUBLIC_ORIGIN must be an HTTPS origin.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("PUBLIC_ORIGIN must be an HTTPS origin.");
  }
  return url.origin;
}

export function pinPublicOrigin(request, origin) {
  if (!origin) return request;
  const incoming = new URL(request.url);
  // Preserve the original request/body/runtime context. Do not trust arbitrary
  // forwarded hosts; only the host-configured origin can become a return URL.
  Object.defineProperty(request, "url", {
    value: `${origin}${incoming.pathname}${incoming.search}`,
    configurable: true,
  });
  return request;
}

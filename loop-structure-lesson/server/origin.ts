import type { IncomingMessage } from "node:http";

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Browser Fetch Metadata survives TLS termination and Host rewriting at a proxy.
 * Sec-Fetch-* cannot be set by page scripts. For older browsers use explicit
 * public origins or the transport origin, never blindly trust forwarded hosts.
 */
export function allowedOrigin(
  req: IncomingMessage,
  options: {
    publicOrigin?: string;
    trustProxy?: boolean;
    requireOrigin?: boolean;
  } = {},
): boolean {
  const origin = req.headers.origin;
  if (!origin) return !options.requireOrigin;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  const configured = (options.publicOrigin || "")
    .split(",")
    .map((v) => normalizeOrigin(v.trim()))
    .filter(Boolean);
  if (configured.includes(normalized)) return true;
  if (req.headers["sec-fetch-site"] === "same-origin") return true;
  // A same-site subdomain is not same-origin; do not grant it ambient cookies.
  if (
    req.headers["sec-fetch-site"] === "cross-site" ||
    req.headers["sec-fetch-site"] === "same-site"
  )
    return false;
  const forwarded = req.headers["x-forwarded-proto"];
  const protocol =
    options.trustProxy && typeof forwarded === "string"
      ? forwarded.split(",")[0].trim()
      : (req.socket as typeof req.socket & { encrypted?: boolean }).encrypted
        ? "https"
        : "http";
  const transportOrigin = normalizeOrigin(`${protocol}://${req.headers.host}`);
  return !!transportOrigin && normalized === transportOrigin;
}

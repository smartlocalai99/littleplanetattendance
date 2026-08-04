import { getAdminSessionSecret, isProduction } from "@/lib/env";

export const ADMIN_SESSION_COOKIE = "admin_session";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

function toBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

async function getSigningKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getAdminSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signPayload(payload) {
  const key = await getSigningKey();
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  let binary = "";

  new Uint8Array(signature).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function getAdminSessionMaxAge() {
  return SESSION_MAX_AGE_SECONDS;
}

export async function createAdminSessionToken(admin) {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = toBase64Url(JSON.stringify({ ...admin, expiresAt }));
  const signature = await signPayload(payload);

  return `${payload}.${signature}`;
}

export async function verifyAdminSessionToken(token) {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = await signPayload(payload);

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const session = JSON.parse(fromBase64Url(payload));

    if (!session.id || !session.name || !session.role || session.expiresAt < Date.now()) {
      return null;
    }

    return {
      id: session.id,
      name: session.name,
      role: session.role,
    };
  } catch {
    return null;
  }
}

export function serializeAdminCookie(value, options = {}) {
  const parts = [`${ADMIN_SESSION_COOKIE}=${value}`];

  parts.push("Path=/");
  parts.push("HttpOnly");
  parts.push("SameSite=Lax");

  if (isProduction()) {
    parts.push("Secure");
  }

  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  return parts.join("; ");
}

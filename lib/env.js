const DEVELOPMENT_ADMIN_SESSION_SECRET = "development-secret";

let databaseUrlLogged = false;
let adminSessionSecretLogged = false;

/*
Environment variables required in both .env.local and Vercel Environment Variables:

DATABASE_URL=your_neon_connection_string
ADMIN_SESSION_SECRET=your_long_random_secret

Generate a secure ADMIN_SESSION_SECRET with:
openssl rand -base64 32
*/

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function logLoaded(name, isFallback = false) {
  const suffix = isFallback ? " (development fallback)" : "";
  console.log(`✓ ${name} loaded${suffix}`);
}

export function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!databaseUrlLogged) {
    logLoaded("DATABASE_URL");
    databaseUrlLogged = true;
  }

  return databaseUrl;
}

export function getAdminSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (secret) {
    if (!adminSessionSecretLogged) {
      logLoaded("ADMIN_SESSION_SECRET");
      adminSessionSecretLogged = true;
    }

    return secret;
  }

  if (isProduction()) {
    throw new Error("ADMIN_SESSION_SECRET is required in production");
  }

  if (!adminSessionSecretLogged) {
    logLoaded("ADMIN_SESSION_SECRET", true);
    adminSessionSecretLogged = true;
  }

  return DEVELOPMENT_ADMIN_SESSION_SECRET;
}

export { isProduction };

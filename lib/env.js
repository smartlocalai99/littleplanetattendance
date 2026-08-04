const DEVELOPMENT_ADMIN_SESSION_SECRET = "development-secret";

let databaseUrlLogged = false;
let adminSessionSecretLogged = false;

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function logLoaded(name, isFallback = false) {
  const suffix = isFallback ? " (fallback)" : "";
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
  const configuredSecret = process.env.ADMIN_SESSION_SECRET;
  const databaseDerivedSecret = process.env.DATABASE_URL
    ? `smartattendance-admin-session:${process.env.DATABASE_URL}`
    : null;
  const secret =
    configuredSecret ||
    databaseDerivedSecret ||
    DEVELOPMENT_ADMIN_SESSION_SECRET;

  if (!adminSessionSecretLogged) {
    logLoaded("ADMIN_SESSION_SECRET", !configuredSecret);
    adminSessionSecretLogged = true;
  }

  return secret;
}

export { isProduction };

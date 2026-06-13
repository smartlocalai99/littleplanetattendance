import { neon } from "@neondatabase/serverless";

let sqlClient = null;

export function getSql() {
  if (sqlClient) {
    return sqlClient;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  sqlClient = neon(databaseUrl);
  return sqlClient;
}

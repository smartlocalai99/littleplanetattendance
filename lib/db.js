import { neon } from "@neondatabase/serverless";

import { getDatabaseUrl } from "@/lib/env";

let sqlClient = null;

export function getSql() {
  if (sqlClient) {
    return sqlClient;
  }

  sqlClient = neon(getDatabaseUrl());
  return sqlClient;
}

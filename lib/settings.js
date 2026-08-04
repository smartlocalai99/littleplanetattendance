import { getSql } from "./db";

export async function getSchoolSettings(sqlInput) {
  const sql = sqlInput || getSql();
  try {
    const rows = await sql`
      SELECT key, value FROM settings
      WHERE key IN ('school_start_time', 'school_end_time')
    `;
    const settings = {
      school_start_time: "08:30",
      school_end_time: "16:30",
    };
    for (const row of rows) {
      if (row.key === "school_start_time") {
        settings.school_start_time = row.value;
      } else if (row.key === "school_end_time") {
        settings.school_end_time = row.value;
      }
    }
    return settings;
  } catch (error) {
    console.error("Failed to load school settings from DB, using defaults:", error);
    return {
      school_start_time: "08:30",
      school_end_time: "16:30",
    };
  }
}

export async function updateSchoolSettings(sqlInput, startTime, endTime) {
  const sql = sqlInput || getSql();
  await sql.transaction([
    sql`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('school_start_time', ${startTime}, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
    `,
    sql`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('school_end_time', ${endTime}, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
    `,
  ]);
}

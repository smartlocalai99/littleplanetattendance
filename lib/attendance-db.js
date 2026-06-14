let attendanceTableReadyPromise = null;

export async function ensureAttendanceTable(sql) {
  if (!attendanceTableReadyPromise) {
    attendanceTableReadyPromise = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS attendance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id UUID REFERENCES staff(id),
        attendance_date DATE NOT NULL,
        check_in TIMESTAMPTZ,
        check_out TIMESTAMPTZ,
        status VARCHAR(20) DEFAULT 'Present',
        confidence NUMERIC(5,4),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )`;

      // Previous releases stored UTC wall-clock values in timestamp columns.
      // Convert them once to real UTC instants so timezone formatting is reliable.
      await sql`DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'attendance'
            AND column_name = 'check_in'
            AND data_type = 'timestamp without time zone'
        ) THEN
          ALTER TABLE attendance
            ALTER COLUMN check_in TYPE TIMESTAMPTZ
              USING check_in AT TIME ZONE 'UTC',
            ALTER COLUMN check_out TYPE TIMESTAMPTZ
              USING check_out AT TIME ZONE 'UTC',
            ALTER COLUMN created_at TYPE TIMESTAMPTZ
              USING created_at AT TIME ZONE 'UTC',
            ALTER COLUMN updated_at TYPE TIMESTAMPTZ
              USING updated_at AT TIME ZONE 'UTC';
        END IF;
      END $$`;

      await sql`ALTER TABLE attendance ALTER COLUMN id SET DEFAULT gen_random_uuid()`;
      await sql`ALTER TABLE attendance ALTER COLUMN status SET DEFAULT 'Present'`;
      await sql`ALTER TABLE attendance ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP`;
      await sql`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS confidence NUMERIC(5,4)`;
      await sql`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS attendance_staff_date_unique
        ON attendance (staff_id, attendance_date)`;
      await sql`CREATE INDEX IF NOT EXISTS attendance_date_index
        ON attendance (attendance_date DESC)`;
    })().catch((error) => {
      attendanceTableReadyPromise = null;
      throw error;
    });
  }

  return attendanceTableReadyPromise;
}

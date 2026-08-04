import bcrypt from "bcrypt";

let coreSchemaReadyPromise = null;

const SAMPLE_ADMIN_PASSWORD = "admin123";
const SAMPLE_TEACHERS = [
  {
    teacher_id: "T001",
    full_name: "Anita Sharma",
    subject: "Mathematics",
  },
  {
    teacher_id: "T002",
    full_name: "Ravi Kumar",
    subject: "Science",
  },
  {
    teacher_id: "T003",
    full_name: "Meera Rao",
    subject: "English",
  },
];

async function recordMigration(sql, name) {
  await sql`
    INSERT INTO schema_migrations (name)
    VALUES (${name})
    ON CONFLICT (name) DO NOTHING
  `;
}

// Each of these idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING) DDL
// batches is sent to Neon as a single sql.transaction([...]) call instead of
// one HTTP round trip per statement, since the neon() serverless driver pays
// a full HTTP request per un-batched query. This only affects a cold
// serverless instance's first request (ensureCoreSchema is memoized per
// warm process) but that cost was previously ~20+ sequential round trips.
async function createCoreSchema(sql) {
  await sql.transaction([
    sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`,
    sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS admins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'admin',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS staff (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        teacher_id VARCHAR(32) NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        subject TEXT NOT NULL,
        salary NUMERIC(12,2),
        photo_url TEXT,
        fingerprint_template TEXT,
        is_enrolled BOOLEAN NOT NULL DEFAULT false,
        fingerprint_enrolled_at TIMESTAMPTZ,
        fingerprint_updated_at TIMESTAMPTZ,
        fingerprint_device_serial TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `,
    sql`
      CREATE TABLE IF NOT EXISTS attendance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id UUID REFERENCES staff(id),
        attendance_date DATE NOT NULL,
        check_in TIMESTAMPTZ,
        check_out TIMESTAMPTZ,
        status VARCHAR(20) DEFAULT 'Present',
        confidence NUMERIC(5,4),
        device_id TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `,
    sql`
      INSERT INTO schema_migrations (name)
      VALUES ('001_core_schema')
      ON CONFLICT (name) DO NOTHING
    `,
  ]);
}

async function addFingerprintColumns(sql) {
  await sql.transaction([
    sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS fingerprint_template TEXT`,
    sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS is_enrolled BOOLEAN NOT NULL DEFAULT false`,
    sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS fingerprint_enrolled_at TIMESTAMPTZ`,
    sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS fingerprint_updated_at TIMESTAMPTZ`,
    sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS fingerprint_device_serial TEXT`,
    sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`,
    sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`,
    sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS photo_url TEXT`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS staff_teacher_id_unique ON staff (teacher_id)`,
    sql`CREATE INDEX IF NOT EXISTS staff_is_enrolled_index ON staff (is_enrolled)`,
    sql`CREATE INDEX IF NOT EXISTS staff_is_active_index ON staff (is_active)`,
    sql`
      INSERT INTO schema_migrations (name)
      VALUES ('002_fingerprint_columns')
      ON CONFLICT (name) DO NOTHING
    `,
  ]);
}

async function addAttendanceConstraints(sql) {
  await sql.transaction([
    sql`ALTER TABLE attendance ALTER COLUMN id SET DEFAULT gen_random_uuid()`,
    sql`ALTER TABLE attendance ALTER COLUMN status SET DEFAULT 'Present'`,
    sql`ALTER TABLE attendance ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP`,
    sql`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS confidence NUMERIC(5,4)`,
    sql`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS device_id TEXT`,
    sql`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`,
    sql`
      CREATE UNIQUE INDEX IF NOT EXISTS attendance_staff_date_unique
      ON attendance (staff_id, attendance_date)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS attendance_date_index
      ON attendance (attendance_date DESC)
    `,
    sql`
      CREATE INDEX IF NOT EXISTS staff_enrolled_active_index
      ON staff (is_enrolled, is_active)
      WHERE is_enrolled = true AND COALESCE(is_active, true) = true
    `,
    sql`
      INSERT INTO schema_migrations (name)
      VALUES ('003_attendance_constraints')
      ON CONFLICT (name) DO NOTHING
    `,
  ]);
}

async function addAttendanceStaffName(sql) {
  await sql.transaction([
    sql`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS staff_name TEXT`,
    sql`
      UPDATE attendance
      SET staff_name = staff.full_name
      FROM staff
      WHERE attendance.staff_id = staff.id
        AND attendance.staff_name IS NULL
    `,
    sql`
      INSERT INTO schema_migrations (name)
      VALUES ('005_attendance_staff_name')
      ON CONFLICT (name) DO NOTHING
    `,
  ]);
}

async function addFaceColumns(sql) {
  await sql.transaction([
    sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS face_embedding JSONB`,
    sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS face_registered BOOLEAN NOT NULL DEFAULT false`,
    sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS face_registered_at TIMESTAMPTZ`,
    sql`
      CREATE INDEX IF NOT EXISTS staff_face_registered_active_index
      ON staff (face_registered, is_active)
      WHERE face_registered = true AND COALESCE(is_active, true) = true
    `,
    sql`
      INSERT INTO schema_migrations (name)
      VALUES ('006_face_columns')
      ON CONFLICT (name) DO NOTHING
    `,
  ]);
}

async function addStaffSalaryColumn(sql) {
  await sql.transaction([
    sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS salary NUMERIC(12,2)`,
    sql`
      INSERT INTO schema_migrations (name)
      VALUES ('007_staff_salary')
      ON CONFLICT (name) DO NOTHING
    `,
  ]);
}

async function addStaffPinColumn(sql) {
  await sql.transaction([
    sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS pin_hash TEXT`,
    sql`
      INSERT INTO schema_migrations (name)
      VALUES ('008_staff_pin')
      ON CONFLICT (name) DO NOTHING
    `,
  ]);
}

async function addStaffDeviceColumns(sql) {
  await sql.transaction([
    sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS device_token_hash TEXT`,
    sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS device_registered_at TIMESTAMPTZ`,
    sql`
      INSERT INTO schema_migrations (name)
      VALUES ('009_staff_device_credential')
      ON CONFLICT (name) DO NOTHING
    `,
  ]);
}

async function seedDevelopmentData(sql) {
  const adminRows = await sql`SELECT COUNT(*)::int AS count FROM admins`;

  if (Number(adminRows[0]?.count || 0) === 0) {
    const passwordHash = await bcrypt.hash(SAMPLE_ADMIN_PASSWORD, 10);

    await sql`
      INSERT INTO admins (name, password_hash, role, is_active)
      VALUES ('admin', ${passwordHash}, 'admin', true)
      ON CONFLICT (name) DO NOTHING
    `;
  }

  const staffRows = await sql`SELECT COUNT(*)::int AS count FROM staff`;

  if (Number(staffRows[0]?.count || 0) === 0) {
    for (const teacher of SAMPLE_TEACHERS) {
      await sql`
        INSERT INTO staff (
          teacher_id,
          full_name,
          subject,
          is_active
        )
        VALUES (
          ${teacher.teacher_id},
          ${teacher.full_name},
          ${teacher.subject},
          true
        )
        ON CONFLICT (teacher_id) DO NOTHING
      `;
    }
  }

  await recordMigration(sql, "004_seed_development_data");
}

async function wakeUpDatabase(sql, retries = 3, delay = 1000) {
  try {
    await sql`SELECT 1`;
  } catch (error) {
    const isRetryable =
      error?.rawError?.["neon:retryable"] === true ||
      error?.["neon:retryable"] === true ||
      error?.message?.includes("Control plane request failed") ||
      error?.message?.includes("retryable");

    if (isRetryable && retries > 0) {
      console.warn(
        `[DB] Database wake up / probe failed. Retrying in ${delay}ms... (Remaining retries: ${retries})`,
        error.message
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return wakeUpDatabase(sql, retries - 1, delay * 1.5);
    }
    throw error;
  }
}

export async function ensureCoreSchema(sql) {
  if (!coreSchemaReadyPromise) {
    coreSchemaReadyPromise = (async () => {
      await wakeUpDatabase(sql);
      await createCoreSchema(sql);
      await addFingerprintColumns(sql);
      await addAttendanceConstraints(sql);
      await addAttendanceStaffName(sql);
      await addFaceColumns(sql);
      await addStaffSalaryColumn(sql);
      await addStaffPinColumn(sql);
      await addStaffDeviceColumns(sql);
      await seedDevelopmentData(sql);
    })().catch((error) => {
      coreSchemaReadyPromise = null;
      throw error;
    });
  }

  return coreSchemaReadyPromise;
}

export { SAMPLE_ADMIN_PASSWORD, SAMPLE_TEACHERS };

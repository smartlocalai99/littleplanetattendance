ALTER TABLE attendance ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE attendance ALTER COLUMN status SET DEFAULT 'Present';
ALTER TABLE attendance ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS confidence NUMERIC(5,4);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_staff_date_unique
  ON attendance (staff_id, attendance_date);

CREATE INDEX IF NOT EXISTS attendance_date_index
  ON attendance (attendance_date DESC);

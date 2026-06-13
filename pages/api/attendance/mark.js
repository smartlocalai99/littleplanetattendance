import { getSql } from "@/lib/db";

const CHECKOUT_DELAY_HOURS = 4;

let attendanceTableReadyPromise = null;

function normalizeConfidence(value) {
  const confidence = Number(value);

  if (!Number.isFinite(confidence)) {
    return null;
  }

  return Math.min(1, Math.max(0, confidence));
}

async function ensureAttendanceTable(sql) {
  if (!attendanceTableReadyPromise) {
    attendanceTableReadyPromise = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS attendance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id UUID REFERENCES staff(id),
        attendance_date DATE NOT NULL,
        check_in TIMESTAMP,
        check_out TIMESTAMP,
        status VARCHAR(20) DEFAULT 'Present',
        confidence NUMERIC(5,4),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`;
      await sql`ALTER TABLE attendance ALTER COLUMN id SET DEFAULT gen_random_uuid()`;
      await sql`ALTER TABLE attendance ALTER COLUMN status SET DEFAULT 'Present'`;
      await sql`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS confidence NUMERIC(5,4)`;
      await sql`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS attendance_staff_date_unique ON attendance (staff_id, attendance_date)`;
    })();
  }

  return attendanceTableReadyPromise;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const staffId = typeof req.body?.staff_id === "string" ? req.body.staff_id.trim() : "";
  const confidence = normalizeConfidence(req.body?.confidence);

  if (!staffId) {
    return res.status(400).json({ success: false, message: "staff_id is required" });
  }

  try {
    const sql = getSql();
    await ensureAttendanceTable(sql);

    const staffRows = await sql`
      SELECT id, teacher_id, full_name, subject
      FROM staff
      WHERE id = ${staffId}
        AND face_registered = true
        AND face_embedding IS NOT NULL
      LIMIT 1
    `;
    const staff = staffRows[0];

    if (!staff) {
      return res.status(404).json({ success: false, message: "Registered staff not found" });
    }

    const attendanceRows = await sql`
      SELECT id, check_in, check_out, status, confidence
      FROM attendance
      WHERE staff_id = ${staffId}
        AND attendance_date = CURRENT_DATE
      LIMIT 1
    `;
    const attendance = attendanceRows[0];

    if (!attendance) {
      const inserted = await sql`
        INSERT INTO attendance (staff_id, attendance_date, check_in, status, confidence)
        VALUES (${staffId}, CURRENT_DATE, NOW(), 'Present', ${confidence})
        RETURNING id, attendance_date, check_in, check_out, status, confidence
      `;

      return res.status(200).json({
        success: true,
        type: "check_in",
        staff,
        confidence,
        attendance: inserted[0],
      });
    }

    const checkoutRows = await sql`
      UPDATE attendance
      SET check_out = NOW(),
          confidence = COALESCE(${confidence}, confidence),
          updated_at = NOW()
      WHERE id = ${attendance.id}
        AND check_in IS NOT NULL
        AND NOW() >= check_in + (${CHECKOUT_DELAY_HOURS} * INTERVAL '1 hour')
      RETURNING id, attendance_date, check_in, check_out, status, confidence
    `;

    if (checkoutRows.length > 0) {
      return res.status(200).json({
        success: true,
        type: "check_out",
        staff,
        confidence,
        attendance: checkoutRows[0],
      });
    }

    return res.status(200).json({
      success: true,
      type: "ignored",
      staff,
      confidence,
      message: "Check-out ignored until 4 hours after check-in.",
      attendance,
    });
  } catch (error) {
    console.error("Mark attendance failed:", error);
    attendanceTableReadyPromise = null;

    return res.status(500).json({
      success: false,
      message: "Unable to mark attendance",
    });
  }
}

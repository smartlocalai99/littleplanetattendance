import { ensureAttendanceTable } from "@/lib/attendance-db";
import { getSql } from "@/lib/db";

const CHECKOUT_DELAY_HOURS = 4;

function normalizeConfidence(value) {
  const confidence = Number(value);

  if (!Number.isFinite(confidence)) {
    return null;
  }

  return Math.min(1, Math.max(0, confidence));
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
    res.setHeader("Cache-Control", "no-store");

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

    const inserted = await sql`
      INSERT INTO attendance (
        staff_id,
        attendance_date,
        check_in,
        status,
        confidence
      )
      VALUES (
        ${staffId},
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date,
        CURRENT_TIMESTAMP,
        'Present',
        ${confidence}
      )
      ON CONFLICT (staff_id, attendance_date) DO NOTHING
      RETURNING id, attendance_date, check_in, check_out, status, confidence
    `;

    if (inserted.length > 0) {
      return res.status(200).json({
        success: true,
        type: "check_in",
        staff,
        confidence,
        attendance: inserted[0],
        recorded_at: inserted[0].check_in,
      });
    }

    const checkoutRows = await sql`
      UPDATE attendance
      SET check_out = CURRENT_TIMESTAMP,
          confidence = COALESCE(${confidence}, confidence),
          updated_at = CURRENT_TIMESTAMP
      WHERE staff_id = ${staffId}
        AND attendance_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
        AND check_in IS NOT NULL
        AND check_out IS NULL
        AND CURRENT_TIMESTAMP >= check_in + (${CHECKOUT_DELAY_HOURS} * INTERVAL '1 hour')
      RETURNING id, attendance_date, check_in, check_out, status, confidence
    `;

    if (checkoutRows.length > 0) {
      return res.status(200).json({
        success: true,
        type: "check_out",
        staff,
        confidence,
        attendance: checkoutRows[0],
        recorded_at: checkoutRows[0].check_out,
      });
    }

    const attendanceRows = await sql`
      SELECT id, attendance_date, check_in, check_out, status, confidence
      FROM attendance
      WHERE staff_id = ${staffId}
        AND attendance_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
      LIMIT 1
    `;
    const attendance = attendanceRows[0];
    const type = attendance?.check_out ? "completed" : "ignored";

    return res.status(200).json({
      success: true,
      type,
      staff,
      confidence,
      message:
        type === "completed"
          ? "Attendance is already complete for today."
          : `Check-out is available ${CHECKOUT_DELAY_HOURS} hours after check-in.`,
      attendance,
    });
  } catch (error) {
    console.error("Mark attendance failed:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to mark attendance",
    });
  }
}

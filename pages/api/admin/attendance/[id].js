import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session";
import { getSql } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/migrations";

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Returns undefined for an invalid timestamp, null for "clear this field".
function parseTimestamp(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export default async function handler(req, res) {
  if (!["PATCH", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "PATCH, DELETE");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const admin = await verifyAdminSessionToken(req.cookies?.[ADMIN_SESSION_COOKIE]);

  if (!admin) {
    return res.status(401).json({ success: false, message: "Unauthorized. Please login again." });
  }

  const attendanceId = cleanText(req.query.id);

  if (!attendanceId) {
    return res.status(400).json({ success: false, message: "Attendance ID is required" });
  }

  try {
    const sql = getSql();
    await ensureCoreSchema(sql);

    if (req.method === "DELETE") {
      const field = cleanText(req.body?.field);

      if (field !== "check_in" && field !== "check_out") {
        return res.status(400).json({
          success: false,
          message: "field must be check_in or check_out",
        });
      }

      const existingRows = await sql`
        SELECT check_in, check_out FROM attendance WHERE id = ${attendanceId} LIMIT 1
      `;
      const existing = existingRows[0];

      if (!existing) {
        return res.status(404).json({ success: false, message: "Attendance record not found" });
      }

      const otherFieldHasValue =
        field === "check_in" ? Boolean(existing.check_out) : Boolean(existing.check_in);

      if (!otherFieldHasValue) {
        // Clearing the only remaining punch time - remove the whole row so
        // the staff member can punch in fresh for this date instead of being
        // blocked by the (staff_id, attendance_date) unique index.
        await sql`DELETE FROM attendance WHERE id = ${attendanceId}`;
        return res.status(200).json({ success: true, deleted: true });
      }

      const updatedRows =
        field === "check_in"
          ? await sql`
              UPDATE attendance SET check_in = NULL, updated_at = CURRENT_TIMESTAMP
              WHERE id = ${attendanceId}
              RETURNING id, check_in, check_out
            `
          : await sql`
              UPDATE attendance SET check_out = NULL, updated_at = CURRENT_TIMESTAMP
              WHERE id = ${attendanceId}
              RETURNING id, check_in, check_out
            `;

      return res.status(200).json({ success: true, deleted: false, attendance: updatedRows[0] });
    }

    const checkIn = parseTimestamp(req.body?.check_in);
    const checkOut = parseTimestamp(req.body?.check_out);

    if (checkIn === undefined || checkOut === undefined) {
      return res.status(400).json({ success: false, message: "Invalid check-in or check-out time" });
    }

    if (checkIn && checkOut && new Date(checkOut) < new Date(checkIn)) {
      return res.status(400).json({ success: false, message: "Check-out must be after check-in" });
    }

    if (!checkIn && !checkOut) {
      await sql`DELETE FROM attendance WHERE id = ${attendanceId}`;
      return res.status(200).json({ success: true, deleted: true });
    }

    const rows = await sql`
      UPDATE attendance
      SET check_in = ${checkIn},
          check_out = ${checkOut},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${attendanceId}
      RETURNING id, check_in, check_out, status
    `;

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Attendance record not found" });
    }

    return res.status(200).json({ success: true, deleted: false, attendance: rows[0] });
  } catch (error) {
    console.error("Admin attendance update failed:", error);

    if (error?.code === "22P02") {
      return res.status(400).json({ success: false, message: "Invalid attendance ID" });
    }

    return res.status(500).json({
      success: false,
      message: error?.message || "Unable to update attendance",
    });
  }
}

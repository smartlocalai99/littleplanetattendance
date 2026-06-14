import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session";
import { getSql } from "@/lib/db";

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export default async function handler(req, res) {
  try {
    if (!["PATCH", "DELETE"].includes(req.method)) {
      res.setHeader("Allow", "PATCH, DELETE");
      return res.status(405).json({
        success: false,
        message: "Method not allowed",
      });
    }

    const admin = await verifyAdminSessionToken(req.cookies?.[ADMIN_SESSION_COOKIE]);

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Please login again.",
      });
    }

    const staffId = cleanText(req.query.id);

    if (!staffId) {
      return res.status(400).json({
        success: false,
        message: "Staff ID is required",
      });
    }

    const sql = getSql();

    if (req.method === "DELETE") {
      const rows = await sql`
        UPDATE staff
        SET
          is_active = false,
          face_registered = false,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${staffId}
        RETURNING id, teacher_id, full_name, subject, is_active
      `;

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Staff not found",
        });
      }

      return res.status(200).json({
        success: true,
        staff: rows[0],
      });
    }

    const teacherId = cleanText(req.body?.teacher_id).toUpperCase();
    const fullName = cleanText(req.body?.full_name);
    const subject = cleanText(req.body?.subject);
    const isActive = req.body?.is_active !== false;

    if (!teacherId || !fullName || !subject) {
      return res.status(400).json({
        success: false,
        message: "Teacher ID, name, and subject are required",
      });
    }

    const rows = await sql`
      UPDATE staff
      SET
        teacher_id = ${teacherId},
        full_name = ${fullName},
        subject = ${subject},
        is_active = ${isActive},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${staffId}
      RETURNING
        id,
        teacher_id,
        full_name,
        subject,
        is_active,
        face_registered
    `;

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Staff not found",
      });
    }

    return res.status(200).json({
      success: true,
      staff: rows[0],
    });
  } catch (error) {
    console.error("Staff API failed:", error);

    if (error?.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "That Teacher ID is already in use",
      });
    }

    if (error?.code === "22P02") {
      return res.status(400).json({
        success: false,
        message: "Invalid staff ID",
      });
    }

    return res.status(500).json({
      success: false,
      message: error?.message || "Unable to update staff",
    });
  }
}
import bcrypt from "bcrypt";

import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session";
import { getSql } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/migrations";

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const admin = await verifyAdminSessionToken(req.cookies?.[ADMIN_SESSION_COOKIE]);

  if (!admin) {
    return res.status(401).json({ success: false, message: "Unauthorized. Please login again." });
  }

  const staffId = cleanText(req.body?.staff_id);
  const pin = cleanText(req.body?.pin);

  if (!staffId) {
    return res.status(400).json({ success: false, message: "Staff ID is required" });
  }

  if (!/^\d{4}$/.test(pin)) {
    return res.status(400).json({ success: false, message: "PIN must be exactly 4 digits" });
  }

  try {
    const sql = getSql();
    await ensureCoreSchema(sql);

    const pinHash = await bcrypt.hash(pin, 10);

    const rows = await sql`
      UPDATE staff
      SET pin_hash = ${pinHash},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${staffId}
      RETURNING id, teacher_id, full_name
    `;

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Staff not found" });
    }

    return res.status(200).json({ success: true, staff: rows[0] });
  } catch (error) {
    console.error("Set staff PIN failed:", error);

    if (error?.code === "22P02") {
      return res.status(400).json({ success: false, message: "Invalid staff ID" });
    }

    return res.status(500).json({
      success: false,
      message: error?.message || "Unable to set PIN",
    });
  }
}

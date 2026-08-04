import bcrypt from "bcrypt";

import { SCHOOL_ATTENDANCE_QR_VALUE } from "@/lib/attendance-qr";
import { generateDeviceToken } from "@/lib/device-credential";
import { getSql } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/migrations";

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * POST /api/attendance/qr/register-device
 *
 * Registers the calling device as the one-and-only device for a staff
 * member. Independently re-validates the QR value, Staff ID, and PIN -
 * never trusts that a prior /api/attendance/qr/mark call already did so,
 * since these are separate HTTP requests.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const qrValue = cleanText(req.body?.qr_value);
  const teacherId = cleanText(req.body?.teacher_id).toUpperCase();
  const pin = cleanText(req.body?.pin);

  if (qrValue !== SCHOOL_ATTENDANCE_QR_VALUE) {
    return res.status(400).json({ success: false, message: "Invalid attendance QR code" });
  }

  if (!teacherId || !pin) {
    return res.status(400).json({ success: false, message: "Staff ID and PIN are required" });
  }

  try {
    const sql = getSql();
    await ensureCoreSchema(sql);

    const staffRows = await sql`
      SELECT id, teacher_id, full_name, subject, photo_url, pin_hash, device_token_hash
      FROM staff
      WHERE teacher_id = ${teacherId}
        AND COALESCE(is_active, true) = true
      LIMIT 1
    `;
    const staff = staffRows[0];

    if (!staff) {
      return res.status(404).json({ success: false, message: "Invalid Staff ID or PIN" });
    }

    if (!staff.pin_hash) {
      return res.status(400).json({
        success: false,
        message: "PIN not set for this staff member. Contact the administrator.",
      });
    }

    const pinMatches = await bcrypt.compare(pin, staff.pin_hash);

    if (!pinMatches) {
      return res.status(401).json({ success: false, message: "Invalid Staff ID or PIN" });
    }

    if (staff.device_token_hash) {
      return res.status(409).json({
        success: false,
        message: "Device already registered. Contact the administrator.",
      });
    }

    const deviceToken = generateDeviceToken();
    const deviceTokenHash = await bcrypt.hash(deviceToken, 10);

    const updatedRows = await sql`
      UPDATE staff
      SET device_token_hash = ${deviceTokenHash},
          device_registered_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${staff.id}
        AND device_token_hash IS NULL
      RETURNING id, teacher_id, full_name, subject, photo_url
    `;

    if (updatedRows.length === 0) {
      // Race: another device registered for this staff member between our
      // SELECT and UPDATE above.
      return res.status(409).json({
        success: false,
        message: "Device already registered. Contact the administrator.",
      });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      success: true,
      device_token: deviceToken,
      staff: updatedRows[0],
    });
  } catch (error) {
    console.error("[attendance:qr:register-device] Failed", error);

    return res.status(500).json({
      success: false,
      message: error?.message || "Unable to register device",
    });
  }
}

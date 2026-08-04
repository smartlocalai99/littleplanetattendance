import bcrypt from "bcrypt";

import { markAttendanceForStaff } from "@/lib/attendance-service";
import { SCHOOL_ATTENDANCE_QR_VALUE } from "@/lib/attendance-qr";
import { getSql } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/migrations";

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * POST /api/attendance/qr/mark
 *
 * Kiosk-facing endpoint for the QR Attendance flow. The rear-camera QR scan
 * only gates access to this form (proof of physical presence at the kiosk);
 * the real identity check is the Staff ID + PIN pair, verified here.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const qrValue = cleanText(req.body?.qr_value);
  const teacherId = cleanText(req.body?.teacher_id).toUpperCase();
  const pin = cleanText(req.body?.pin);
  const action = cleanText(req.body?.action);

  if (qrValue !== SCHOOL_ATTENDANCE_QR_VALUE) {
    return res.status(400).json({ success: false, message: "Invalid attendance QR code" });
  }

  if (!teacherId || !pin) {
    return res.status(400).json({ success: false, message: "Staff ID and PIN are required" });
  }

  if (action !== "check_in" && action !== "check_out") {
    return res.status(400).json({ success: false, message: "Invalid action" });
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

    if (!staff.device_token_hash) {
      return res.status(200).json({
        success: false,
        needs_device_registration: true,
        message: "Register this device to continue.",
      });
    }

    const deviceToken = cleanText(req.body?.device_token);
    const deviceMatches = deviceToken && (await bcrypt.compare(deviceToken, staff.device_token_hash));

    if (!deviceMatches) {
      return res.status(403).json({
        success: false,
        device_not_authorised: true,
        message: "Please use your registered device.",
      });
    }

    const result = await markAttendanceForStaff({
      sql,
      staffId: staff.id,
      staff,
      deviceId: "QR-KIOSK",
      action,
    });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(result);
  } catch (error) {
    console.error("[attendance:qr:mark] Failed", error);

    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || "Unable to mark attendance",
    });
  }
}

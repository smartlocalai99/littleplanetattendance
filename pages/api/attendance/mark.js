import { markAttendanceForStaff } from "@/lib/attendance-service";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-session";
import { getSql } from "@/lib/db";

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
    return res.status(403).json({
      success: false,
      message: "Attendance can only be marked after QR Attendance verification",
    });
  }

  try {
    const sql = getSql();
    const result = await markAttendanceForStaff({
      sql,
      staffId: cleanText(req.body?.staff_id || req.body?.staffId),
      confidence: req.body?.confidence,
      deviceId: cleanText(req.body?.device_id || req.body?.deviceId),
    });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(result);
  } catch (error) {
    console.error("[attendance:mark] Failed", error);

    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || "Unable to mark attendance",
    });
  }
}

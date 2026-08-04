import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session";
import { getSql } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/migrations";
import { getSchoolSettings, updateSchoolSettings } from "@/lib/settings";

function isValidTimeStr(val) {
  return typeof val === "string" && /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(val);
}

export default async function handler(req, res) {
  if (!["GET", "POST", "PUT"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, PUT");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const admin = await verifyAdminSessionToken(req.cookies?.[ADMIN_SESSION_COOKIE]);

  if (!admin) {
    return res.status(401).json({ success: false, message: "Unauthorized. Please login again." });
  }

  try {
    const sql = getSql();
    await ensureCoreSchema(sql);

    if (req.method === "GET") {
      const settings = await getSchoolSettings(sql);
      return res.status(200).json({ success: true, settings });
    }

    // POST / PUT: Update settings
    const startTime = req.body?.school_start_time;
    const endTime = req.body?.school_end_time;

    if (!isValidTimeStr(startTime) || !isValidTimeStr(endTime)) {
      return res.status(400).json({
        success: false,
        message: "Invalid start or end time format. Expected HH:MM (e.g. 08:30).",
      });
    }

    await updateSchoolSettings(sql, startTime, endTime);

    return res.status(200).json({
      success: true,
      message: "School settings updated successfully.",
    });
  } catch (error) {
    console.error("Admin settings API failed:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Internal server error.",
    });
  }
}

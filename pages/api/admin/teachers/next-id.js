import { getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session";

function formatTeacherId(value) {
  return `T${String(value).padStart(3, "0")}`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const admin = await verifyAdminSessionToken(req.cookies?.[ADMIN_SESSION_COOKIE]);

  if (!admin) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT teacher_id
      FROM staff
      WHERE teacher_id ~ '^T[0-9]+$'
      ORDER BY CAST(SUBSTRING(teacher_id FROM 2) AS INTEGER) DESC
      LIMIT 1
    `;
    const lastNumber = rows[0]?.teacher_id
      ? Number.parseInt(rows[0].teacher_id.slice(1), 10)
      : 0;

    return res.status(200).json({
      success: true,
      teacher_id: formatTeacherId(Number.isFinite(lastNumber) ? lastNumber + 1 : 1),
    });
  } catch (error) {
    console.error("Next teacher ID failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to generate teacher ID",
    });
  }
}

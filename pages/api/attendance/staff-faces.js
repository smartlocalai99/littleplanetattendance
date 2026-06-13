import { getSql } from "@/lib/db";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, teacher_id, full_name, subject, face_embedding
      FROM staff
      WHERE face_registered = true
        AND face_embedding IS NOT NULL
      ORDER BY full_name ASC
    `;

    return res.status(200).json({
      success: true,
      staff: rows,
    });
  } catch (error) {
    console.error("Fetch registered staff failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load registered staff",
    });
  }
}

import { getSql } from "@/lib/db";
import { normalizeStoredFaceDescriptor } from "@/lib/face-recognition";

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
        AND COALESCE(is_active, true) = true
        AND jsonb_typeof(face_embedding) = 'object'
        AND face_embedding ->> 'version' = '2'
      ORDER BY full_name ASC
    `;
    const staff = rows
      .map((row) => ({
        ...row,
        face_embedding: normalizeStoredFaceDescriptor(row.face_embedding),
      }))
      .filter((row) => row.face_embedding);

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      success: true,
      staff,
    });
  } catch (error) {
    console.error("Fetch registered staff failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load registered staff",
    });
  }
}

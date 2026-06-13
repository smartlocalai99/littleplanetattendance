import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session";
import { getSql } from "@/lib/db";

function normalizeEmbedding(value) {
  const embedding = Array.isArray(value) ? value : null;

  if (
    !embedding ||
    embedding.length === 0 ||
    embedding.some((item) => typeof item !== "number" || Number.isNaN(item))
  ) {
    return null;
  }

  return embedding;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const admin = await verifyAdminSessionToken(req.cookies?.[ADMIN_SESSION_COOKIE]);

  if (!admin) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const teacherId = String(req.body?.teacher_id || "").trim();
  const fullName = String(req.body?.full_name || "").trim();
  const subject = String(req.body?.subject || "").trim();
  const faceEmbedding = normalizeEmbedding(req.body?.face_embedding);

  if (!teacherId) {
    return res.status(400).json({ success: false, message: "Teacher ID is required" });
  }

  if (!fullName) {
    return res.status(400).json({ success: false, message: "Teacher name is required" });
  }

  if (!subject) {
    return res.status(400).json({ success: false, message: "Subject is required" });
  }

  if (!faceEmbedding) {
    return res.status(400).json({ success: false, message: "Face registration is required" });
  }

  try {
    const sql = getSql();
    const rows = await sql`
      INSERT INTO staff (teacher_id, full_name, subject, photo_url, face_embedding, face_registered)
      VALUES (${teacherId}, ${fullName}, ${subject}, ${null}, ${JSON.stringify(faceEmbedding)}::jsonb, true)
      RETURNING id, teacher_id, full_name, subject, photo_url, face_registered, created_at
    `;

    return res.status(201).json({
      success: true,
      teacher: rows[0],
    });
  } catch (error) {
    console.error("Create teacher failed:", error);

    if (error?.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Duplicate Teacher ID",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to save teacher",
    });
  }
}

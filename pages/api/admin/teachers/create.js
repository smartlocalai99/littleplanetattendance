import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session";
import { getSql } from "@/lib/db";
import {
  faceDescriptorDistance,
  normalizeStoredFaceDescriptor,
} from "@/lib/face-recognition";

function normalizeEmbedding(value) {
  return normalizeStoredFaceDescriptor(value);
}

function formatTeacherId(value) {
  return `T${String(value).padStart(3, "0")}`;
}

async function getTeacherIdState(sql, requestedTeacherId) {
  const existingRows = await sql`
    SELECT id, teacher_id, full_name
    FROM staff
    WHERE teacher_id = ${requestedTeacherId}
    LIMIT 1
  `;

  if (existingRows.length === 0) {
    return {
      assignedTeacherId: requestedTeacherId,
      existingTeacher: null,
    };
  }

  const rows = await sql`
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(teacher_id FROM 2) AS INTEGER)),
      0
    )::int AS last_number
    FROM staff
    WHERE teacher_id ~ '^T[0-9]+$'
  `;

  return {
    assignedTeacherId: formatTeacherId(Number(rows[0]?.last_number || 0) + 1),
    existingTeacher: existingRows[0],
  };
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
    const teacherIdState = await getTeacherIdState(sql, teacherId);
    const isExistingTeacher =
      teacherIdState.existingTeacher &&
      teacherIdState.existingTeacher.full_name.trim().toLowerCase() ===
        fullName.toLowerCase();
    const registeredFaces = await sql`
      SELECT id, teacher_id, full_name, face_embedding
      FROM staff
      WHERE face_registered = true
        AND face_embedding IS NOT NULL
        AND jsonb_typeof(face_embedding) = 'object'
        AND face_embedding ->> 'version' = '2'
    `;
    const duplicateFace = registeredFaces.find(
      (staff) =>
        staff.id !== teacherIdState.existingTeacher?.id &&
        faceDescriptorDistance(faceEmbedding, staff.face_embedding) < 0.018,
    );

    if (duplicateFace) {
      return res.status(409).json({
        success: false,
        message: `This face is already registered for ${duplicateFace.full_name}.`,
      });
    }

    if (isExistingTeacher) {
      const updatedRows = await sql`
        UPDATE staff
        SET subject = ${subject},
            face_embedding = ${JSON.stringify(faceEmbedding)}::jsonb,
            face_registered = true,
            face_registered_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${teacherIdState.existingTeacher.id}
        RETURNING id, teacher_id, full_name, subject, photo_url, face_registered, created_at
      `;

      res.setHeader("Cache-Control", "no-store");

      return res.status(200).json({
        success: true,
        teacher: updatedRows[0],
        teacher_updated: true,
        teacher_id_changed: false,
      });
    }

    const assignedTeacherId = teacherIdState.assignedTeacherId;
    const rows = await sql`
      INSERT INTO staff (
        teacher_id,
        full_name,
        subject,
        photo_url,
        face_embedding,
        face_registered,
        face_registered_at
      )
      VALUES (
        ${assignedTeacherId},
        ${fullName},
        ${subject},
        ${null},
        ${JSON.stringify(faceEmbedding)}::jsonb,
        true,
        CURRENT_TIMESTAMP
      )
      RETURNING id, teacher_id, full_name, subject, photo_url, face_registered, created_at
    `;

    res.setHeader("Cache-Control", "no-store");

    return res.status(201).json({
      success: true,
      teacher: rows[0],
      teacher_id_changed: assignedTeacherId !== teacherId,
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

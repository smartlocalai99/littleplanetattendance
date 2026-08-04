import bcrypt from "bcrypt";

import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session";
import { getSql } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/migrations";
import { normalizeSalary } from "@/lib/staff-salary.mjs";

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
  const staffId = String(req.body?.staff_id || "").trim();
  const fullName = String(req.body?.full_name || "").trim();
  const subject = String(req.body?.subject || "").trim();
  const pin = String(req.body?.pin || "").trim();

  if (!teacherId) {
    return res.status(400).json({ success: false, message: "Teacher ID is required" });
  }

  if (!fullName) {
    return res.status(400).json({ success: false, message: "Teacher name is required" });
  }

  if (!subject) {
    return res.status(400).json({ success: false, message: "Subject is required" });
  }

  // A brand-new teacher (no staff_id yet) must get a PIN immediately since
  // they have no other way to authenticate at the kiosk. An existing
  // teacher being edited may leave the PIN field blank to keep their
  // current PIN unchanged (resetting it is also available separately via
  // the Staff page's "Set/Reset PIN" action).
  if (!staffId && !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ success: false, message: "A 4-digit PIN is required" });
  }

  if (pin && !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ success: false, message: "PIN must be exactly 4 digits" });
  }

  try {
    const salary = normalizeSalary(req.body?.salary);
    const sql = getSql();
    await ensureCoreSchema(sql);
    const teacherIdState = await getTeacherIdState(sql, teacherId);
    const targetRows = staffId
      ? await sql`
          SELECT id, teacher_id, full_name
          FROM staff
          WHERE id = ${staffId}
          LIMIT 1
        `
      : [];
    const targetTeacher = targetRows[0] || null;
    const isExistingTeacher = Boolean(targetTeacher) ||
      (
        teacherIdState.existingTeacher &&
        teacherIdState.existingTeacher.full_name.trim().toLowerCase() ===
          fullName.toLowerCase()
      );
    const existingTeacher = targetTeacher || teacherIdState.existingTeacher;

    if (isExistingTeacher) {
      const pinHash = pin ? await bcrypt.hash(pin, 10) : null;
      const updatedRows = pinHash
        ? await sql`
            UPDATE staff
            SET teacher_id = ${teacherId},
                full_name = ${fullName},
                subject = ${subject},
                salary = ${salary},
                pin_hash = ${pinHash},
                is_active = true,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${existingTeacher.id}
            RETURNING id, teacher_id, full_name, subject, salary, photo_url, created_at
          `
        : await sql`
            UPDATE staff
            SET teacher_id = ${teacherId},
                full_name = ${fullName},
                subject = ${subject},
                salary = ${salary},
                is_active = true,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${existingTeacher.id}
            RETURNING id, teacher_id, full_name, subject, salary, photo_url, created_at
          `;

      res.setHeader("Cache-Control", "no-store");

      return res.status(200).json({
        success: true,
        teacher: updatedRows[0],
        teacher_updated: true,
        teacher_id_changed: false,
      });
    }

    const pinHash = await bcrypt.hash(pin, 10);
    const assignedTeacherId = teacherIdState.assignedTeacherId;
    const rows = await sql`
      INSERT INTO staff (
        teacher_id,
        full_name,
        subject,
        salary,
        photo_url,
        pin_hash
      )
      VALUES (
        ${assignedTeacherId},
        ${fullName},
        ${subject},
        ${salary},
        ${null},
        ${pinHash}
      )
      RETURNING id, teacher_id, full_name, subject, salary, photo_url, created_at
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

    if (error?.message === "Salary must be zero or a positive number") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to save teacher",
    });
  }
}

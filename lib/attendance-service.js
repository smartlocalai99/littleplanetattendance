// Attendance table is guaranteed by ensureCoreSchema (called in API handlers).

// Scans within this window of the last punch are treated as accidental
// re-scans (lingering in front of the camera, a quick step away) and
// ignored. Anything longer is treated as a genuine check-out, even if
// it's only a couple of hours after check-in.
const DEFAULT_DUPLICATE_WINDOW_SECONDS = 30 * 60;

function normalizeConfidence(value) {
  const confidence = Number(value);

  if (!Number.isFinite(confidence)) {
    return null;
  }

  return Math.min(1, Math.max(0, confidence));
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getDuplicateWindowSeconds() {
  const seconds = Number(process.env.ATTENDANCE_DUPLICATE_WINDOW_SECONDS);
  return Number.isFinite(seconds) && seconds >= 0
    ? seconds
    : DEFAULT_DUPLICATE_WINDOW_SECONDS;
}

function serializeStaff(row) {
  return {
    id: row.id,
    teacher_id: row.teacher_id || "",
    full_name: row.full_name || "",
    subject: row.subject || "",
    department: row.department || row.subject || "",
    photo_url: row.photo_url || "",
  };
}

export async function markAttendanceForStaff({
  sql,
  staffId,
  staff: providedStaff = null,
  confidence,
  deviceId = "",
  action = null,
}) {
  const cleanStaffId = cleanText(staffId);
  const cleanDeviceId = cleanText(deviceId);
  const normalizedConfidence = normalizeConfidence(confidence);
  const duplicateWindowSeconds = getDuplicateWindowSeconds();

  console.log("[attendance:service] Mark request", {
    staffId: cleanStaffId,
    confidence: normalizedConfidence,
    deviceId: cleanDeviceId,
    duplicateWindowSeconds,
  });

  if (!cleanStaffId) {
    const error = new Error("staff_id is required");
    error.statusCode = 400;
    throw error;
  }

  // Callers that already fetched+validated the staff row (e.g. the QR/PIN
  // mark endpoint, after PIN + device verification) can pass it in directly
  // to skip this redundant round trip. Table guaranteed by ensureCoreSchema.
  let staff = providedStaff;

  if (!staff) {
    const staffRows = await sql`
      SELECT id, teacher_id, full_name, subject, photo_url
      FROM staff
      WHERE id = ${cleanStaffId}
        AND face_registered = true
        AND face_embedding IS NOT NULL
        AND COALESCE(is_active, true) = true
      LIMIT 1
    `;
    staff = staffRows[0];
  }

  if (!staff) {
    console.warn("[attendance:service] Enrolled staff not found", {
      staffId: cleanStaffId,
    });
    const error = new Error("Enrolled staff not found");
    error.statusCode = 404;
    throw error;
  }

  console.log("[attendance:service] Teacher identified", {
    staffId: staff.id,
    teacherId: staff.teacher_id,
    name: staff.full_name,
  });

  // QR/PIN attendance is a deliberate button press (CHECK IN vs CHECK OUT),
  // not a passive repeated camera scan, so it gets its own explicit branch
  // rather than the auto-alternating logic below (which exists to guess
  // intent from an unattended scanner and stays untouched for callers that
  // don't pass an action).
  if (action === "check_in" || action === "check_out") {
    const todayRows = await sql`
      SELECT id, staff_name, attendance_date, check_in, check_out, status, confidence, device_id
      FROM attendance
      WHERE staff_id = ${cleanStaffId}
        AND attendance_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
      LIMIT 1
    `;
    const today = todayRows[0] || null;

    if (action === "check_in") {
      if (today) {
        return {
          success: true,
          type: "already_checked_in",
          punch_type: "Punch In",
          message: "Already checked in today",
          staff: serializeStaff(staff),
          confidence: normalizedConfidence,
          attendance: today,
          recorded_at: today.check_in,
        };
      }

      const insertedRows = await sql`
        INSERT INTO attendance (
          staff_id,
          staff_name,
          attendance_date,
          check_in,
          status,
          confidence,
          device_id,
          updated_at
        )
        VALUES (
          ${cleanStaffId},
          ${staff.full_name},
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date,
          CURRENT_TIMESTAMP,
          'Present',
          ${normalizedConfidence},
          ${cleanDeviceId || null},
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (staff_id, attendance_date) DO NOTHING
        RETURNING id, staff_name, attendance_date, check_in, check_out, status, confidence, device_id
      `;

      if (insertedRows.length === 0) {
        // Race: another request checked this staff member in between our
        // SELECT and INSERT above.
        const raceRows = await sql`
          SELECT id, staff_name, attendance_date, check_in, check_out, status, confidence, device_id
          FROM attendance
          WHERE staff_id = ${cleanStaffId}
            AND attendance_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
          LIMIT 1
        `;

        return {
          success: true,
          type: "already_checked_in",
          punch_type: "Punch In",
          message: "Already checked in today",
          staff: serializeStaff(staff),
          confidence: normalizedConfidence,
          attendance: raceRows[0],
          recorded_at: raceRows[0]?.check_in,
        };
      }

      return {
        success: true,
        type: "check_in",
        punch_type: "Punch In",
        message: "Attendance Recorded",
        staff: serializeStaff(staff),
        confidence: normalizedConfidence,
        attendance: insertedRows[0],
        recorded_at: insertedRows[0].check_in,
      };
    }

    // action === "check_out"
    if (!today || !today.check_in) {
      const error = new Error("Please check in first");
      error.statusCode = 400;
      throw error;
    }

    if (today.check_out) {
      return {
        success: true,
        type: "already_checked_out",
        punch_type: "Punch Out",
        message: "Already checked out today",
        staff: serializeStaff(staff),
        confidence: normalizedConfidence,
        attendance: today,
        recorded_at: today.check_out,
      };
    }

    const updatedRows = await sql`
      UPDATE attendance
      SET check_out = CURRENT_TIMESTAMP,
          confidence = COALESCE(${normalizedConfidence}, confidence),
          device_id = COALESCE(${cleanDeviceId || null}, device_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${today.id}
        AND check_out IS NULL
      RETURNING id, staff_name, attendance_date, check_in, check_out, status, confidence, device_id
    `;

    if (updatedRows.length === 0) {
      // Race: already checked out between our SELECT and UPDATE above.
      return {
        success: true,
        type: "already_checked_out",
        punch_type: "Punch Out",
        message: "Already checked out today",
        staff: serializeStaff(staff),
        confidence: normalizedConfidence,
        attendance: today,
        recorded_at: today.check_out,
      };
    }

    return {
      success: true,
      type: "check_out",
      punch_type: "Punch Out",
      message: "Attendance Recorded",
      staff: serializeStaff(staff),
      confidence: normalizedConfidence,
      attendance: updatedRows[0],
      recorded_at: updatedRows[0].check_out,
    };
  }

  const inserted = await sql`
    INSERT INTO attendance (
      staff_id,
      staff_name,
      attendance_date,
      check_in,
      status,
      confidence,
      device_id,
      updated_at
    )
    VALUES (
      ${cleanStaffId},
      ${staff.full_name},
      (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date,
      CURRENT_TIMESTAMP,
      'Present',
      ${normalizedConfidence},
      ${cleanDeviceId || null},
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (staff_id, attendance_date) DO NOTHING
    RETURNING id, staff_name, attendance_date, check_in, check_out, status, confidence, device_id
  `;

  if (inserted.length > 0) {
    console.log("[attendance:service] Punch In saved", {
      staffId: cleanStaffId,
      attendanceId: inserted[0].id,
      recordedAt: inserted[0].check_in,
    });

    return {
      success: true,
      type: "check_in",
      punch_type: "Punch In",
      message: "Attendance Recorded",
      staff: serializeStaff(staff),
      confidence: normalizedConfidence,
      attendance: inserted[0],
      recorded_at: inserted[0].check_in,
    };
  }

  const existingRows = await sql`
    SELECT id, staff_name, attendance_date, check_in, check_out, status, confidence, device_id, updated_at,
      (CURRENT_TIMESTAMP - COALESCE(check_out, check_in)) < (${duplicateWindowSeconds} * INTERVAL '1 second') AS is_duplicate
    FROM attendance
    WHERE staff_id = ${cleanStaffId}
      AND attendance_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
    LIMIT 1
  `;
  const existing = existingRows[0];

  if (!existing) {
    console.error("[attendance:service] Conflict occurred but row was not found", {
      staffId: cleanStaffId,
    });
    throw new Error("Unable to load existing attendance record");
  }

  const isDuplicate = Boolean(existing.is_duplicate);

  if (isDuplicate) {
    console.log("[attendance:service] Duplicate scan ignored", {
      staffId: cleanStaffId,
      attendanceId: existing.id,
    });

    return {
      success: true,
      type: "duplicate",
      punch_type: existing.check_out ? "Punch Out" : "Punch In",
      message: "Duplicate scan ignored",
      staff: serializeStaff(staff),
      confidence: normalizedConfidence,
      attendance: existing,
      recorded_at: existing.check_out || existing.check_in,
    };
  }

  if (!existing.check_out) {
    const checkoutRows = await sql`
      UPDATE attendance
      SET check_out = CURRENT_TIMESTAMP,
          confidence = COALESCE(${normalizedConfidence}, confidence),
          device_id = COALESCE(${cleanDeviceId || null}, device_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${existing.id}
        AND check_out IS NULL
      RETURNING id, staff_name, attendance_date, check_in, check_out, status, confidence, device_id
    `;

    if (checkoutRows.length > 0) {
      console.log("[attendance:service] Punch Out saved", {
        staffId: cleanStaffId,
        attendanceId: checkoutRows[0].id,
        recordedAt: checkoutRows[0].check_out,
      });

      return {
        success: true,
        type: "check_out",
        punch_type: "Punch Out",
        message: "Attendance Recorded",
        staff: serializeStaff(staff),
        confidence: normalizedConfidence,
        attendance: checkoutRows[0],
        recorded_at: checkoutRows[0].check_out,
      };
    }
  }

  console.log("[attendance:service] Attendance already completed", {
    staffId: cleanStaffId,
    attendanceId: existing.id,
  });

  return {
    success: true,
    type: "completed",
    punch_type: "Completed",
    message: "Attendance already completed for today",
    staff: serializeStaff(staff),
    confidence: normalizedConfidence,
    attendance: existing,
    recorded_at: existing.check_out || existing.check_in,
  };
}

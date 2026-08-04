import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session";
import { getSql } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/migrations";
import { formatInTimeZone } from "date-fns-tz";
import { APP_TIME_ZONE, LATE_AFTER, EARLY_BEFORE, formatDuration } from "@/lib/time";

function escapeCsv(val) {
  if (val === null || val === undefined) {
    return "";
  }
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

function getDayName(year, month, day) {
  const date = new Date(year, month - 1, day);
  const formatter = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: APP_TIME_ZONE });
  return formatter.format(date);
}

function checkIsLate(checkInDate) {
  if (!checkInDate) return false;
  const timeStr = formatInTimeZone(new Date(checkInDate), APP_TIME_ZONE, "HH:mm");
  return timeStr > LATE_AFTER;
}

// EARLY_BEFORE is 16:30. An exit is early if it's before that.
function checkIsEarly(checkOutDate) {
  if (!checkOutDate) return false;
  const timeStr = formatInTimeZone(new Date(checkOutDate), APP_TIME_ZONE, "HH:mm");
  return timeStr < EARLY_BEFORE;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const admin = await verifyAdminSessionToken(req.cookies?.[ADMIN_SESSION_COOKIE]);
  if (!admin) {
    return res.status(401).json({ success: false, message: "Unauthorized. Please login again." });
  }

  const year = parseInt(req.query.year || new Date().getFullYear(), 10);
  const month = parseInt(req.query.month || (new Date().getMonth() + 1), 10);
  const staffId = req.query.staffId || "all";
  const format = req.query.format || "grid";

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return res.status(400).json({ success: false, message: "Invalid year or month parameters" });
  }

  try {
    const sql = getSql();
    await ensureCoreSchema(sql);

    const daysInMonth = new Date(year, month, 0).getDate();
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    const staffRows = staffId !== "all"
      ? await sql`
          SELECT id, teacher_id, full_name, subject
          FROM staff
          WHERE id = ${staffId}
        `
      : await sql`
          SELECT id, teacher_id, full_name, subject
          FROM staff
          WHERE COALESCE(is_active, true) = true
          ORDER BY full_name ASC
        `;

    if (staffId !== "all" && staffRows.length === 0) {
      return res.status(404).json({ success: false, message: "Teacher not found or inactive" });
    }

    const attendanceRows = staffId !== "all"
      ? await sql`
          SELECT
            id,
            staff_id,
            attendance_date::text AS date_key,
            check_in,
            check_out,
            status
          FROM attendance
          WHERE staff_id = ${staffId}
            AND attendance_date >= ${startDate}::date
            AND attendance_date <= ${endDate}::date
        `
      : await sql`
          SELECT
            id,
            staff_id,
            attendance_date::text AS date_key,
            check_in,
            check_out,
            status
          FROM attendance
          WHERE attendance_date >= ${startDate}::date
            AND attendance_date <= ${endDate}::date
        `;

    const attendanceMap = {};
    for (const row of attendanceRows) {
      attendanceMap[`${row.staff_id}_${row.date_key}`] = row;
    }

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const monthName = monthNames[month - 1] || "Month";

    let csvContent = "";
    let filename = "";

    if (staffId !== "all") {
      const staff = staffRows[0];
      filename = `attendance_${staff.teacher_id || "staff"}_${monthName}_${year}.csv`;
      csvContent = "Date,Day,Status,Check-In,Check-Out,Duration,Late Arrival,Early Exit,Remarks\n";

      for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dayName = getDayName(year, month, day);
        const isSunday = dayName === "Sunday";
        const record = attendanceMap[`${staff.id}_${dateKey}`];

        let status = "Absent";
        let checkInStr = "--";
        let checkOutStr = "--";
        let durationStr = "--";
        let lateStr = "No";
        let earlyStr = "No";
        let remarks = "--";

        if (record && record.check_in) {
          status = record.status || "Present";
          checkInStr = formatInTimeZone(new Date(record.check_in), APP_TIME_ZONE, "h:mm a");

          if (record.check_out) {
            checkOutStr = formatInTimeZone(new Date(record.check_out), APP_TIME_ZONE, "h:mm a");
            durationStr = formatDuration(record.check_in, record.check_out);
          }

          const isLate = checkIsLate(record.check_in);
          const isEarly = checkIsEarly(record.check_out);

          lateStr = isLate ? "Yes" : "No";
          earlyStr = isEarly ? "Yes" : "No";

          const remarkList = [];
          if (isLate) remarkList.push("Late Arrival");
          if (isEarly) remarkList.push("Early Exit");
          remarks = remarkList.length > 0 ? remarkList.join(" & ") : "Normal";
        } else {
          if (isSunday) {
            status = "Sunday";
          }
        }

        csvContent += [
          escapeCsv(dateKey),
          escapeCsv(dayName),
          escapeCsv(status),
          escapeCsv(checkInStr),
          escapeCsv(checkOutStr),
          escapeCsv(durationStr),
          escapeCsv(lateStr),
          escapeCsv(earlyStr),
          escapeCsv(remarks)
        ].join(",") + "\n";
      }
    } else if (format === "list") {
      filename = `attendance_all_detailed_${monthName}_${year}.csv`;
      csvContent = "Date,Day,Teacher ID,Teacher Name,Subject,Status,Check-In,Check-Out,Duration,Late Arrival,Early Exit\n";

      for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dayName = getDayName(year, month, day);
        const isSunday = dayName === "Sunday";

        for (const staff of staffRows) {
          const record = attendanceMap[`${staff.id}_${dateKey}`];

          let status = "Absent";
          let checkInStr = "--";
          let checkOutStr = "--";
          let durationStr = "--";
          let lateStr = "No";
          let earlyStr = "No";

          if (record && record.check_in) {
            status = record.status || "Present";
            checkInStr = formatInTimeZone(new Date(record.check_in), APP_TIME_ZONE, "h:mm a");

            if (record.check_out) {
              checkOutStr = formatInTimeZone(new Date(record.check_out), APP_TIME_ZONE, "h:mm a");
              durationStr = formatDuration(record.check_in, record.check_out);
            }

            lateStr = checkIsLate(record.check_in) ? "Yes" : "No";
            earlyStr = checkIsEarly(record.check_out) ? "Yes" : "No";
          } else {
            if (isSunday) {
              status = "Sunday";
            }
          }

          csvContent += [
            escapeCsv(dateKey),
            escapeCsv(dayName),
            escapeCsv(staff.teacher_id),
            escapeCsv(staff.full_name),
            escapeCsv(staff.subject || "Staff"),
            escapeCsv(status),
            escapeCsv(checkInStr),
            escapeCsv(checkOutStr),
            escapeCsv(durationStr),
            escapeCsv(lateStr),
            escapeCsv(earlyStr)
          ].join(",") + "\n";
        }
      }
    } else {
      // Default: grid (matrix) format
      filename = `attendance_all_grid_${monthName}_${year}.csv`;

      const dayHeaders = [];
      for (let day = 1; day <= daysInMonth; day++) {
        dayHeaders.push(String(day));
      }

      csvContent = [
        "Teacher ID",
        "Teacher Name",
        "Subject",
        ...dayHeaders,
        "Total Present",
        "Total Absent",
        "Total Late",
        "Total Early",
        "Attendance %"
      ].map(escapeCsv).join(",") + "\n";

      let workingDaysCount = 0;
      for (let day = 1; day <= daysInMonth; day++) {
        const dayName = getDayName(year, month, day);
        if (dayName !== "Sunday") {
          workingDaysCount++;
        }
      }

      for (const staff of staffRows) {
        const dayValues = [];
        let totalPresent = 0;
        let totalAbsent = 0;
        let totalLate = 0;
        let totalEarly = 0;

        for (let day = 1; day <= daysInMonth; day++) {
          const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayName = getDayName(year, month, day);
          const isSunday = dayName === "Sunday";

          const record = attendanceMap[`${staff.id}_${dateKey}`];

          if (record && record.check_in) {
            const isLate = checkIsLate(record.check_in);
            const isEarly = checkIsEarly(record.check_out);

            let statusSymbol = "P";
            if (isLate && isEarly) {
              statusSymbol = "LE";
              totalLate++;
              totalEarly++;
            } else if (isLate) {
              statusSymbol = "L";
              totalLate++;
            } else if (isEarly) {
              statusSymbol = "E";
              totalEarly++;
            }

            totalPresent++;
            dayValues.push(statusSymbol);
          } else {
            if (isSunday) {
              dayValues.push("S");
            } else {
              dayValues.push("A");
              totalAbsent++;
            }
          }
        }

        const attendanceRate = workingDaysCount > 0
          ? Math.min(Math.round((totalPresent / workingDaysCount) * 100), 100)
          : 0;

        csvContent += [
          escapeCsv(staff.teacher_id),
          escapeCsv(staff.full_name),
          escapeCsv(staff.subject || "Staff"),
          ...dayValues.map(escapeCsv),
          escapeCsv(totalPresent),
          escapeCsv(totalAbsent),
          escapeCsv(totalLate),
          escapeCsv(totalEarly),
          escapeCsv(`${attendanceRate}%`)
        ].join(",") + "\n";
      }
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    console.error("Admin attendance export failed:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Unable to export attendance report",
    });
  }
}

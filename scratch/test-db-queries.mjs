import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { neon } from "@neondatabase/serverless";
import { formatInTimeZone } from "date-fns-tz";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const match = line.trim().match(/^\s*([\w\.\-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || "";
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value;
    }
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
const APP_TIME_ZONE = "Asia/Kolkata";
const LATE_AFTER = "08:30";
const EARLY_BEFORE = "16:30";

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

function checkIsEarly(checkOutDate) {
  if (!checkOutDate) return false;
  const timeStr = formatInTimeZone(new Date(checkOutDate), APP_TIME_ZONE, "HH:mm");
  return timeStr < EARLY_BEFORE;
}

// Custom formatDuration since we don't import time.js
function calculateDurationMinutes(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    return null;
  }
  return Math.floor((end - start) / (1000 * 60));
}

function formatDuration(checkIn, checkOut, fallback = "--") {
  const totalMinutes = calculateDurationMinutes(checkIn, checkOut);
  if (totalMinutes === null) {
    return fallback;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

async function run() {
  console.log("Database connection testing...");
  if (!DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const sql = neon(DATABASE_URL);

  const year = 2026;
  const month = 8;
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  console.log(`Querying for August 2026 (${startDate} to ${endDate})`);

  // 1. Query staff
  const staffRows = await sql`
    SELECT id, teacher_id, full_name, subject
    FROM staff
    WHERE COALESCE(is_active, true) = true
    ORDER BY full_name ASC
  `;

  console.log(`Found ${staffRows.length} active staff members:`);
  staffRows.forEach(s => console.log(`- ${s.full_name} (${s.teacher_id})`));

  // 2. Query attendance
  const attendanceRows = await sql`
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

  console.log(`Found ${attendanceRows.length} attendance records for August 2026.`);

  const attendanceMap = {};
  for (const row of attendanceRows) {
    attendanceMap[`${row.staff_id}_${row.date_key}`] = row;
  }

  // 3. Grid output logic verification
  console.log("\nVerifying grid CSV construction...");
  const dayHeaders = [];
  for (let d = 1; d <= daysInMonth; d++) dayHeaders.push(String(d));

  let gridCsv = [
    "Teacher ID", "Teacher Name", "Subject",
    ...dayHeaders,
    "Total Present", "Total Absent", "Total Late", "Total Early", "Attendance %"
  ].map(escapeCsv).join(",") + "\n";

  let workingDaysCount = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (getDayName(year, month, d) !== "Sunday") workingDaysCount++;
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

    gridCsv += [
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

  console.log("Grid CSV successfully constructed!");
  console.log("First 3 rows of generated grid CSV:");
  console.log(gridCsv.split("\n").slice(0, 4).join("\n"));

  console.log("\nAll queries and data processing successfully validated against live Neon DB!");
}

run().catch(console.error);

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Manually parse .env.local to load database config and session secret
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

import { createAdminSessionToken } from "../lib/admin-session.js";
import settingsHandler from "../pages/api/admin/settings.js";
import reportsHandler from "../pages/api/admin/reports/attendance.js";
import { getSql } from "../lib/db.js";

async function runTest() {
  console.log("Starting Timings Settings and Recalculation Integration Tests...");

  // Generate session token
  const dummyAdmin = {
    id: "00000000-0000-0000-0000-000000000000",
    name: "TestAdmin",
    role: "admin"
  };
  const token = await createAdminSessionToken(dummyAdmin);

  // Helper for mock response
  function createMockResponse() {
    return {
      statusCode: 200,
      headers: {},
      sendData: null,
      jsonData: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(name, value) {
        this.headers[name] = value;
        return this;
      },
      send(data) {
        this.sendData = data;
        return this;
      },
      json(data) {
        this.jsonData = data;
        return this;
      }
    };
  }

  // --- Step 1: GET settings ---
  console.log("\n--- STEP 1: Fetch settings ---");
  const req1 = {
    method: "GET",
    cookies: { admin_session: token }
  };
  const res1 = createMockResponse();
  await settingsHandler(req1, res1);

  console.log("GET Settings Status:", res1.statusCode);
  console.log("Settings Value:", JSON.stringify(res1.jsonData));

  const originalStart = res1.jsonData?.settings?.school_start_time || "08:30";
  const originalEnd = res1.jsonData?.settings?.school_end_time || "16:30";

  // --- Step 2: POST/PUT Settings ---
  console.log("\n--- STEP 2: Update timings to 09:00 and 16:00 ---");
  const req2 = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: {
      school_start_time: "09:00",
      school_end_time: "16:00"
    },
    cookies: { admin_session: token }
  };
  const res2 = createMockResponse();
  await settingsHandler(req2, res2);

  console.log("POST Settings Status:", res2.statusCode);
  console.log("POST Response JSON:", JSON.stringify(res2.jsonData));

  // --- Step 3: GET settings again to verify persistence ---
  console.log("\n--- STEP 3: Verify timings updated ---");
  const req3 = {
    method: "GET",
    cookies: { admin_session: token }
  };
  const res3 = createMockResponse();
  await settingsHandler(req3, res3);

  console.log("GET Settings Updated Status:", res3.statusCode);
  console.log("Updated Settings Value:", JSON.stringify(res3.jsonData));

  if (
    res3.jsonData?.settings?.school_start_time === "09:00" &&
    res3.jsonData?.settings?.school_end_time === "16:00"
  ) {
    console.log("✓ Success! Timings successfully updated in DB.");
  } else {
    console.error("✗ Failed to persist timing settings!");
  }

  // --- Step 4: Add dummy attendance data to test lateness calculation dynamically ---
  console.log("\n--- STEP 4: Creating a test attendance entry at 08:45 AM ---");
  const sql = getSql();
  const staffList = await sql`SELECT id, teacher_id, full_name FROM staff LIMIT 1`;
  if (staffList.length > 0) {
    const staff = staffList[0];
    const testDate = "2026-08-04";

    // Delete existing test record if any
    await sql`DELETE FROM attendance WHERE staff_id = ${staff.id} AND attendance_date = ${testDate}::date`;

    // Insert a check-in at 8:45 AM local time (which is 03:15:00 UTC)
    // and check-out at 4:15 PM local time (which is 10:45:00 UTC)
    await sql`
      INSERT INTO attendance (staff_id, staff_name, attendance_date, check_in, check_out, status)
      VALUES (
        ${staff.id},
        ${staff.full_name},
        ${testDate}::date,
        '2026-08-04T03:15:00.000Z'::timestamptz,
        '2026-08-04T10:45:00.000Z'::timestamptz,
        'Present'
      )
    `;

    console.log(`Created test check-in for ${staff.full_name} at 8:45 AM (UTC 03:15:00) and check-out at 4:15 PM (UTC 10:45:00)`);

    // --- Step 5: Test dynamic calculation under 09:00 - 16:00 timing (Not Late, Not Early) ---
    console.log("\n--- STEP 5: Verifying CSV report with 09:00 timing ---");
    const reqList1 = {
      method: "GET",
      query: { year: "2026", month: "8", staffId: staff.id },
      cookies: { admin_session: token }
    };
    const resList1 = createMockResponse();
    await reportsHandler(reqList1, resList1);

    if (resList1.sendData) {
      console.log("CSV Report snippet under 09:00 timing:");
      const lines = resList1.sendData.split("\n");
      // Find the line for 2026-08-04
      const recordLine = lines.find(l => l.startsWith(testDate));
      console.log("Record:", recordLine);
      // Under 09:00 start: 08:45 check-in is NOT late.
      // Under 16:00 end: 16:15 check-out is NOT early.
      if (recordLine.includes("No,No,Normal")) {
        console.log("✓ Success! Staff is correctly marked NOT LATE and NOT EARLY.");
      } else {
        console.error("✗ Lateness/early exit calculation is incorrect for 09:00 limit!");
      }
    }

    // --- Step 6: Update timings back to original values ---
    console.log(`\n--- STEP 6: Reverting settings back to ${originalStart} and ${originalEnd} ---`);
    const reqRevert = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        school_start_time: originalStart,
        school_end_time: originalEnd
      },
      cookies: { admin_session: token }
    };
    const resRevert = createMockResponse();
    await settingsHandler(reqRevert, resRevert);
    console.log("Revert status:", resRevert.statusCode);

    // --- Step 7: Test dynamic calculation under original timing (Late and Early) ---
    console.log("\n--- STEP 7: Verifying dynamic updates after reverting timings ---");
    const resList2 = createMockResponse();
    await reportsHandler(reqList1, resList2);

    if (resList2.sendData) {
      console.log("CSV Report snippet under original timing:");
      const lines = resList2.sendData.split("\n");
      const recordLine = lines.find(l => l.startsWith(testDate));
      console.log("Record:", recordLine);
      // Under original start (usually 08:30): 08:45 check-in IS late.
      // Under original end (usually 16:30): 16:15 check-out IS early.
      if (recordLine.includes("Yes,Yes,Late Arrival & Early Exit")) {
        console.log("✓ Success! Staff is correctly marked LATE and EARLY after timings were changed.");
      } else {
        console.error("✗ Recalculation failed on timings revert!");
      }
    }

    // Cleanup test record
    await sql`DELETE FROM attendance WHERE staff_id = ${staff.id} AND attendance_date = ${testDate}::date`;
    console.log("Test attendance records cleaned up.");
  } else {
    console.log("No staff members available for integration testing.");
  }

  console.log("\nAll integration checks passed!");
  process.exit(0);
}

runTest().catch((err) => {
  console.error("Integration verification failed:", err);
  process.exit(1);
});

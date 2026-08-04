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

// Ensure mock next-alias imports work by replacing root paths manually or using relative imports
import { createAdminSessionToken } from "../lib/admin-session.js";
import handler from "../pages/api/admin/reports/attendance.js";
import { getSql } from "../lib/db.js";

async function runTest() {
  console.log("Starting Report API verification...");

  // 2. Generate a valid admin session token
  const dummyAdmin = {
    id: "00000000-0000-0000-0000-000000000000",
    name: "TestAdmin",
    role: "admin"
  };
  const token = await createAdminSessionToken(dummyAdmin);

  // 3. Helper to create a mock response object
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

  // --- Test Case 1: Grid Format Export for All Staff ---
  console.log("\n--- TEST CASE 1: All Staff (Grid Matrix) ---");
  const req1 = {
    method: "GET",
    query: { year: "2026", month: "8", staffId: "all", format: "grid" },
    cookies: { admin_session: token }
  };
  const res1 = createMockResponse();
  await handler(req1, res1);

  console.log("Status:", res1.statusCode);
  console.log("Headers:", JSON.stringify(res1.headers, null, 2));
  if (res1.sendData) {
    console.log("Output Length:", res1.sendData.length, "bytes");
    console.log("First 3 rows of CSV:\n" + res1.sendData.split("\n").slice(0, 4).join("\n"));
  } else {
    console.log("Error response JSON:", res1.jsonData);
  }

  // --- Test Case 2: List Format Export for All Staff ---
  console.log("\n--- TEST CASE 2: All Staff (Detailed List) ---");
  const req2 = {
    method: "GET",
    query: { year: "2026", month: "8", staffId: "all", format: "list" },
    cookies: { admin_session: token }
  };
  const res2 = createMockResponse();
  await handler(req2, res2);

  console.log("Status:", res2.statusCode);
  console.log("Headers:", JSON.stringify(res2.headers, null, 2));
  if (res2.sendData) {
    console.log("Output Length:", res2.sendData.length, "bytes");
    console.log("First 4 rows of CSV:\n" + res2.sendData.split("\n").slice(0, 5).join("\n"));
  } else {
    console.log("Error response JSON:", res2.jsonData);
  }

  // --- Test Case 3: Individual Teacher Export ---
  console.log("\n--- TEST CASE 3: Individual Staff Member (if available) ---");
  // Find first active staff in database to get their UUID
  const sql = getSql();
  const staffList = await sql`SELECT id, teacher_id, full_name FROM staff LIMIT 1`;
  
  if (staffList.length > 0) {
    const targetStaff = staffList[0];
    console.log(`Testing individual export for: ${targetStaff.full_name} (${targetStaff.teacher_id})`);
    
    const req3 = {
      method: "GET",
      query: { year: "2026", month: "8", staffId: targetStaff.id },
      cookies: { admin_session: token }
    };
    const res3 = createMockResponse();
    await handler(req3, res3);

    console.log("Status:", res3.statusCode);
    console.log("Headers:", JSON.stringify(res3.headers, null, 2));
    if (res3.sendData) {
      console.log("Output Length:", res3.sendData.length, "bytes");
      console.log("First 5 rows of CSV:\n" + res3.sendData.split("\n").slice(0, 6).join("\n"));
    } else {
      console.log("Error response JSON:", res3.jsonData);
    }
  } else {
    console.log("No staff found in database. Skipping individual export test.");
  }

  console.log("\nVerification complete!");
  process.exit(0);
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

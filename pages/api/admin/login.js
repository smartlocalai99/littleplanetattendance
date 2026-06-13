import bcrypt from "bcrypt";

import {
  createAdminSessionToken,
  getAdminSessionMaxAge,
  serializeAdminCookie,
} from "@/lib/admin-session";
import { getSql } from "@/lib/db";

function sendError(res, message, status = 400) {
  return res.status(status).json({ success: false, message });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendError(res, "Method not allowed", 405);
  }

  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!username || !password) {
    return sendError(res, "Username and password are required");
  }

  try {
    const sql = getSql();
    const admins = await sql`
      SELECT id, name, password_hash, role, is_active
      FROM admins
      WHERE name = ${username}
      LIMIT 1
    `;
    const admin = admins[0];

    if (!admin) {
      return sendError(res, "Invalid username", 401);
    }

    if (!admin.is_active) {
      return sendError(res, "Inactive admin account", 403);
    }

    const passwordMatches = await bcrypt.compare(password, admin.password_hash);

    if (!passwordMatches) {
      return sendError(res, "Invalid password", 401);
    }

    const safeAdmin = {
      id: admin.id,
      name: admin.name,
      role: admin.role,
    };
    const token = await createAdminSessionToken(safeAdmin);

    res.setHeader(
      "Set-Cookie",
      serializeAdminCookie(token, { maxAge: getAdminSessionMaxAge() }),
    );

    return res.status(200).json({ success: true, admin: safeAdmin });
  } catch (error) {
    console.error("Admin login failed:", error);
    return sendError(res, "Unable to login right now", 500);
  }
}

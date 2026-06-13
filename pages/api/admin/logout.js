import { serializeAdminCookie } from "@/lib/admin-session";

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  res.setHeader(
    "Set-Cookie",
    serializeAdminCookie("", { maxAge: 0, expires: new Date(0) }),
  );

  return res.status(200).json({ success: true });
}

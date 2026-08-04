import crypto from "crypto";

// High-entropy, server-issued device credential. Only the bcrypt hash of
// this value is ever stored (see pages/api/attendance/qr/register-device.js)
// - the raw token is returned to the client exactly once and never logged.
export function generateDeviceToken() {
  return crypto.randomBytes(32).toString("base64url");
}

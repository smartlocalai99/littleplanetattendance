// Single permanent value encoded in the school's printed attendance QR code.
// Fixed on purpose - it never rotates or expires. It is not a secret: it
// only gates access to the Staff ID + PIN screen (proof the scanner is
// physically at the kiosk), the real auth boundary is the staff PIN.
export const SCHOOL_ATTENDANCE_QR_VALUE = "LPA-ATTENDANCE-KIOSK-V1";

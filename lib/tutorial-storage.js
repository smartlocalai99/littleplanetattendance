// Client-only "have they seen this onboarding tutorial before" flags.
// Deliberately just a browser-local dismissal flag (no DB/API involved) -
// re-showing an already-seen tutorial is a low-stakes UX annoyance, not
// something that needs server-side tracking per admin/staff account.
export const ADMIN_TUTORIAL_STORAGE_KEY = "qr-attendance-admin-tutorial-seen";
export const STAFF_TUTORIAL_STORAGE_KEY = "qr-attendance-staff-tutorial-seen";

export function hasSeenTutorial(key) {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    // If storage is unavailable, fail safe by not forcing the tutorial.
    return true;
  }
}

export function markTutorialSeen(key) {
  try {
    window.localStorage.setItem(key, "true");
  } catch {
    // Best-effort only.
  }
}

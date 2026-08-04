import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Pencil,
  QrCode,
  Smartphone,
  Trash2,
  Users,
} from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import QRCode from "qrcode";
import { useRouter } from "next/router";
import { memo, useEffect, useState } from "react";
import Swal from "sweetalert2";

import BottomNavigation from "@/components/BottomNavigation";
import TutorialOverlay from "@/components/TutorialOverlay";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session";
import { SCHOOL_ATTENDANCE_QR_VALUE } from "@/lib/attendance-qr";
import { getSql } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/migrations";
import {
  APP_TIME_ZONE,
  EARLY_BEFORE,
  formatDuration,
  formatIstDate,
  formatIstTime,
  getIstDateKey,
  LATE_AFTER,
  serializeTimestamp,
} from "@/lib/time";
import {
  ADMIN_TUTORIAL_STORAGE_KEY,
  hasSeenTutorial,
  markTutorialSeen,
} from "@/lib/tutorial-storage";

const ADMIN_TUTORIAL_STEPS = [
  {
    icon: QrCode,
    title: "Show QR Code",
    description: "Display the school's QR code for staff to scan.",
  },
  {
    icon: Smartphone,
    title: "Staff Scan QR",
    description: "Staff scan the QR using the Attendance app.",
  },
  {
    icon: CheckCircle2,
    title: "Attendance",
    description:
      "Staff enter their Staff ID and PIN, then tap CHECK IN when arriving or CHECK OUT when leaving.",
  },
];

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00+05:30`);
  return !Number.isNaN(date.getTime()) && getIstDateKey(date) === value;
}

function safePhotoUrl(value) {
  if (typeof value !== "string") {
    return "";
  }

  const photoUrl = value.trim();
  return photoUrl.startsWith("/") || photoUrl.startsWith("https://")
    ? photoUrl
    : "";
}

function getInitials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export async function getServerSideProps({ req, query }) {
  const admin = await verifyAdminSessionToken(req.cookies?.[ADMIN_SESSION_COOKIE]);

  if (!admin) {
    return {
      redirect: {
        destination: "/admin/login?from=/admin/attendance",
        permanent: false,
      },
    };
  }

  const today = getIstDateKey();
  const selectedDate =
    typeof query.date === "string" && isValidDateKey(query.date)
      ? query.date
      : today;
  const sql = getSql();
  await ensureCoreSchema(sql);

  const qrDataUrl = await QRCode.toDataURL(SCHOOL_ATTENDANCE_QR_VALUE, {
    margin: 1,
    width: 320,
  });

  const rows = await sql`
    SELECT
      a.id,
      a.status,
      a.check_in,
      a.check_out,
      s.id AS staff_id,
      s.teacher_id,
      s.full_name,
      s.subject,
      s.photo_url,
      CASE
        WHEN a.check_in IS NOT NULL THEN
          a.check_in > (
            (a.attendance_date + ${LATE_AFTER}::time)
            AT TIME ZONE 'Asia/Kolkata'
          )
        ELSE false
      END AS is_late,
      CASE
        WHEN a.check_out IS NOT NULL THEN
          a.check_out < (
            (a.attendance_date + ${EARLY_BEFORE}::time)
            AT TIME ZONE 'Asia/Kolkata'
          )
        ELSE false
      END AS is_early
    FROM attendance a
    INNER JOIN staff s ON s.id = a.staff_id
    WHERE a.attendance_date = ${selectedDate}::date
    ORDER BY a.check_in ASC NULLS LAST, s.full_name ASC
  `;

  return {
    props: {
      selectedDate,
      today,
      qrDataUrl,
      records: rows.map((row) => ({
        id: row.id,
        staffId: row.staff_id,
        teacherId: row.teacher_id || "",
        fullName: row.full_name,
        subject: row.subject || "Staff",
        photoUrl: safePhotoUrl(row.photo_url),
        status: row.status || "Present",
        checkIn: serializeTimestamp(row.check_in),
        checkOut: serializeTimestamp(row.check_out),
        isLate: Boolean(row.is_late),
        isEarly: Boolean(row.is_early),
      })),
    },
  };
}

const StaffAvatar = memo(function StaffAvatar({ name, photoUrl }) {
  if (photoUrl) {
    return (
      <div
        role="img"
        aria-label={`${name} profile`}
        className="h-14 w-14 shrink-0 rounded-full bg-cover bg-center shadow-sm ring-4 ring-white"
        style={{ backgroundImage: `url("${photoUrl.replaceAll('"', "%22")}")` }}
      />
    );
  }

  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg font-black text-emerald-700 ring-4 ring-white">
      {getInitials(name) || "S"}
    </div>
  );
});

const PunchTime = memo(function PunchTime({
  icon: Icon,
  label,
  value,
  emptyText,
  tone,
  onEdit,
  onDelete,
}) {
  const tones = {
    in: "bg-emerald-50 text-emerald-700",
    out: "bg-indigo-50 text-indigo-700",
  };

  return (
    <div className={`rounded-2xl p-3 ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" aria-hidden="true" />
          <p className="text-[11px] font-black uppercase tracking-wider">{label}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${label}`}
            className="rounded-full p-1.5 text-current/70 transition hover:bg-white/60 hover:text-current"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {value ? (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete ${label}`}
              className="rounded-full p-1.5 text-current/70 transition hover:bg-white/60 hover:text-current"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-lg font-black">
        {value ? formatIstTime(value) : emptyText}
      </p>
    </div>
  );
});

export default function AttendanceInOutPage({ records, selectedDate, today, qrDataUrl }) {
  const router = useRouter();
  const completed = records.filter((record) => record.checkOut).length;
  const onSite = records.filter((record) => record.checkIn && !record.checkOut).length;
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    // localStorage isn't available during SSR, so this has to run after
    // mount rather than as a lazy useState initializer - otherwise the
    // client's first render would mismatch the server-rendered markup.
    if (!hasSeenTutorial(ADMIN_TUTORIAL_STORAGE_KEY)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowTutorial(true);
    }
  }, []);

  function closeTutorial() {
    markTutorialSeen(ADMIN_TUTORIAL_STORAGE_KEY);
    setShowTutorial(false);
  }

  useEffect(() => {
    if (selectedDate !== today) {
      return;
    }

    let refreshInFlight = false;

    async function refreshAttendance() {
      if (refreshInFlight) {
        return;
      }

      refreshInFlight = true;

      try {
        await router.replace(router.asPath, undefined, { scroll: false });
      } catch (error) {
        if (!error?.cancelled) {
          console.error("Attendance refresh failed:", error);
        }
      } finally {
        refreshInFlight = false;
      }
    }

    const channel =
      "BroadcastChannel" in window
        ? new BroadcastChannel("attendance-updates")
        : null;

    function handleAttendanceUpdate() {
      if (document.visibilityState === "visible") {
        void refreshAttendance();
      }
    }

    function handleStorage(event) {
      if (event.key === "attendance-updated-at") {
        handleAttendanceUpdate();
      }
    }

    channel?.addEventListener("message", handleAttendanceUpdate);
    window.addEventListener("storage", handleStorage);

    return () => {
      channel?.close();
      window.removeEventListener("storage", handleStorage);
    };
  }, [router, selectedDate, today]);

  async function refreshPage() {
    await router.replace(router.asPath, undefined, { scroll: false });
  }

  // Builds an IST-local ISO instant from the record's attendance date and a
  // "HH:mm" time input value (IST has a fixed +05:30 offset, no DST).
  function buildIstIso(timeValue) {
    return new Date(`${selectedDate}T${timeValue}:00+05:30`).toISOString();
  }

  async function editPunchTime(record, field) {
    const label = field === "check_in" ? "Punch In" : "Punch Out";
    const currentValue = record[field === "check_in" ? "checkIn" : "checkOut"];
    const currentTime = currentValue
      ? formatInTimeZone(currentValue, APP_TIME_ZONE, "HH:mm")
      : "";

    const result = await Swal.fire({
      title: `Edit ${record.fullName}'s ${label}`,
      html: `<input id="swal-time-input" type="time" value="${currentTime}" class="swal2-input" style="width: 60%;" />`,
      showCancelButton: true,
      confirmButtonText: "Save",
      confirmButtonColor: "#059669",
      focusConfirm: false,
      preConfirm: () => {
        const timeValue = document.getElementById("swal-time-input")?.value;

        if (!timeValue) {
          Swal.showValidationMessage("Please choose a time");
          return false;
        }

        return timeValue;
      },
    });

    if (!result.isConfirmed || !result.value) {
      return;
    }

    const otherField = field === "check_in" ? "check_out" : "check_in";
    const otherValue = record[otherField === "check_in" ? "checkIn" : "checkOut"];

    const response = await fetch(`/api/admin/attendance/${record.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        [field]: buildIstIso(result.value),
        [otherField]: otherValue || null,
      }),
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      await Swal.fire({
        icon: "error",
        title: `Unable to Update ${label}`,
        text: data.message || "Please try again",
        confirmButtonColor: "#43A047",
      });
      return;
    }

    await refreshPage();
  }

  async function deletePunchTime(record, field) {
    const label = field === "check_in" ? "Punch In" : "Punch Out";

    const result = await Swal.fire({
      icon: "warning",
      title: `Delete ${record.fullName}'s ${label}?`,
      text: "This removes the recorded time. This cannot be undone.",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc2626",
    });

    if (!result.isConfirmed) {
      return;
    }

    const response = await fetch(`/api/admin/attendance/${record.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field }),
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      await Swal.fire({
        icon: "error",
        title: `Unable to Delete ${label}`,
        text: data.message || "Please try again",
        confirmButtonColor: "#43A047",
      });
      return;
    }

    await refreshPage();
  }

  async function handleDateChange(event) {
    const nextDate = event.target.value;

    if (!nextDate || nextDate === selectedDate) {
      return;
    }

    try {
      await router.push({
        pathname: "/admin/attendance",
        query: { date: nextDate },
      });
    } catch (error) {
      if (!error?.cancelled) {
        console.error("Attendance date navigation failed:", error);
      }
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[#f4f7f5] text-slate-950">
      <header className="bg-emerald-700 px-5 text-white shadow-lg">
        <div
          className="mx-auto max-w-5xl py-5"
          style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}
        >
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-100">
            Attendance register
          </p>
          <h1 className="mt-1 text-3xl font-black">In / Out</h1>
          <p className="mt-1 text-sm font-semibold text-emerald-100">
            Morning and evening punch timings in IST
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-5 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6">
        <section className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
          <label
            htmlFor="attendance-date"
            className="flex items-center gap-2 text-sm font-black text-slate-700"
          >
            <CalendarDays className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            Select attendance date
          </label>
          <input
            id="attendance-date"
            type="date"
            value={selectedDate}
            max={today}
            onChange={handleDateChange}
            className="mt-3 min-h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
          />
          <p className="mt-3 text-sm font-semibold text-slate-500">
            Showing {formatIstDate(`${selectedDate}T00:00:00+05:30`)}
            {selectedDate === today ? " · Today" : ""}
          </p>
        </section>

        <section className="relative mt-4 rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
          <button
            type="button"
            onClick={() => setShowTutorial(true)}
            className="absolute right-4 top-4 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600"
          >
            How to Use
          </button>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt="Permanent school attendance QR code"
              className="h-40 w-40 shrink-0 rounded-2xl ring-1 ring-slate-200/70"
            />
            <div className="text-center sm:text-left">
              <div className="flex items-center justify-center gap-2 sm:justify-start">
                <QrCode className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                <h2 className="text-lg font-black text-slate-900">QR Attendance Code</h2>
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Print and post this at the entrance. It is permanent and does not expire.
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                Staff scan this with the rear camera on the QR Attendance page, then enter their
                Staff ID and PIN to check in or out.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-slate-900 p-4 text-white">
            <Users className="h-5 w-5 text-slate-300" aria-hidden="true" />
            <p className="mt-2 text-2xl font-black">{records.length}</p>
            <p className="text-xs font-bold text-slate-300">Present</p>
          </div>
          <div className="rounded-2xl bg-amber-500 p-4 text-white">
            <Clock3 className="h-5 w-5 text-amber-100" aria-hidden="true" />
            <p className="mt-2 text-2xl font-black">{onSite}</p>
            <p className="text-xs font-bold text-amber-100">On site</p>
          </div>
          <div className="rounded-2xl bg-emerald-600 p-4 text-white">
            <ArrowUpRight className="h-5 w-5 text-emerald-100" aria-hidden="true" />
            <p className="mt-2 text-2xl font-black">{completed}</p>
            <p className="text-xs font-bold text-emerald-100">Completed</p>
          </div>
        </section>

        <section className="mt-5 space-y-4" aria-live="polite">
          {records.length === 0 ? (
            <div className="rounded-[1.75rem] bg-white px-6 py-14 text-center shadow-sm ring-1 ring-slate-200/70">
              <Clock3 className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-black text-slate-800">
                No attendance records
              </h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                No one punched in on this date.
              </p>
            </div>
          ) : (
            records.map((record) => (
              <article
                key={record.id}
                className="rounded-[1.75rem] bg-white p-4 shadow-sm ring-1 ring-slate-200/70"
              >
                <div className="flex items-center gap-4">
                  <StaffAvatar name={record.fullName} photoUrl={record.photoUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-black text-slate-900">
                        {record.fullName}
                      </h2>
                      {record.isLate ? (
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black uppercase text-amber-800">
                          Late
                        </span>
                      ) : null}
                      {record.isEarly ? (
                        <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-black uppercase text-violet-800">
                          Early Exit
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-500">
                      {record.subject}
                    </p>
                    {record.teacherId ? (
                      <p className="mt-1 text-xs font-bold text-slate-400">
                        {record.teacherId}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={[
                      "rounded-full px-3 py-1 text-[11px] font-black",
                      record.checkOut
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700",
                    ].join(" ")}
                  >
                    {record.checkOut ? "Completed" : "On site"}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <PunchTime
                    icon={ArrowDownLeft}
                    label="Morning Punch In"
                    value={record.checkIn}
                    emptyText="Not marked"
                    tone="in"
                    onEdit={() => editPunchTime(record, "check_in")}
                    onDelete={() => deletePunchTime(record, "check_in")}
                  />
                  <PunchTime
                    icon={ArrowUpRight}
                    label="Night Punch Out"
                    value={record.checkOut}
                    emptyText="Still working"
                    tone="out"
                    onEdit={() => editPunchTime(record, "check_out")}
                    onDelete={() => deletePunchTime(record, "check_out")}
                  />
                </div>

                {record.checkIn && record.checkOut ? (
                  <p className="mt-3 text-right text-xs font-bold text-slate-500">
                    Total: {formatDuration(record.checkIn, record.checkOut)}
                  </p>
                ) : null}
              </article>
            ))
          )}
        </section>
      </div>

      <BottomNavigation />

      {showTutorial ? (
        <TutorialOverlay steps={ADMIN_TUTORIAL_STEPS} onDismiss={closeTutorial} />
      ) : null}
    </main>
  );
}

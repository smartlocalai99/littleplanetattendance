import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Users,
} from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";

import BottomNavigation from "@/components/BottomNavigation";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session";
import { getSql } from "@/lib/db";
import {
  formatDuration,
  formatIstDate,
  formatIstTime,
  getIstDateKey,
  serializeTimestamp,
} from "@/lib/time";

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
      s.photo_url
    FROM attendance a
    INNER JOIN staff s ON s.id = a.staff_id
    WHERE a.attendance_date = ${selectedDate}::date
    ORDER BY a.check_in ASC NULLS LAST, s.full_name ASC
  `;

  return {
    props: {
      selectedDate,
      today,
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
      })),
    },
  };
}

function StaffAvatar({ name, photoUrl }) {
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
}

function PunchTime({ icon: Icon, label, value, emptyText, tone }) {
  const tones = {
    in: "bg-emerald-50 text-emerald-700",
    out: "bg-indigo-50 text-indigo-700",
  };

  return (
    <div className={`rounded-2xl p-3 ${tones[tone]}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <p className="text-[11px] font-black uppercase tracking-wider">{label}</p>
      </div>
      <p className="mt-2 text-lg font-black">
        {value ? formatIstTime(value) : emptyText}
      </p>
    </div>
  );
}

export default function AttendanceInOutPage({ records, selectedDate, today }) {
  const router = useRouter();
  const [isLoadingDate, setIsLoadingDate] = useState(false);
  const completed = records.filter((record) => record.checkOut).length;
  const onSite = records.filter((record) => record.checkIn && !record.checkOut).length;

  async function handleDateChange(event) {
    const nextDate = event.target.value;

    if (!nextDate || nextDate === selectedDate) {
      return;
    }

    setIsLoadingDate(true);

    try {
      await router.push({
        pathname: "/admin/attendance",
        query: { date: nextDate },
      });
    } catch (error) {
      if (!error?.cancelled) {
        console.error("Attendance date navigation failed:", error);
      }
    } finally {
      setIsLoadingDate(false);
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
            disabled={isLoadingDate}
            onChange={handleDateChange}
            className="mt-3 min-h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-bold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:opacity-60"
          />
          <p className="mt-3 text-sm font-semibold text-slate-500">
            Showing {formatIstDate(`${selectedDate}T00:00:00+05:30`)}
            {selectedDate === today ? " · Today" : ""}
          </p>
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
                    <h2 className="truncate text-lg font-black text-slate-900">
                      {record.fullName}
                    </h2>
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
                  />
                  <PunchTime
                    icon={ArrowUpRight}
                    label="Night Punch Out"
                    value={record.checkOut}
                    emptyText="Still working"
                    tone="out"
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
    </main>
  );
}

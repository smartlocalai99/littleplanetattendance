import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  LogOut,
  RefreshCw,
  TimerOff,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import BottomNavigation from "@/components/BottomNavigation";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session";
import { getSql } from "@/lib/db";
import {
  EARLY_BEFORE,
  formatDuration,
  formatIstDate,
  formatIstTime,
  formatIstTimeWithSeconds,
  LATE_AFTER,
  serializeTimestamp,
} from "@/lib/time";

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export async function getServerSideProps({ req }) {
  const admin = await verifyAdminSessionToken(req.cookies?.[ADMIN_SESSION_COOKIE]);

  if (!admin) {
    return {
      redirect: {
        destination: "/admin/login",
        permanent: false,
      },
    };
  }

  const sql = getSql();

  const [attendanceRows, weeklyRows] = await Promise.all([
    sql`
      SELECT
        s.id AS staff_id,
        s.teacher_id,
        s.full_name,
        s.subject,
        a.id AS attendance_id,
        a.check_in,
        a.check_out,
        a.status,
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
      FROM staff s
      LEFT JOIN attendance a
        ON a.staff_id = s.id
        AND a.attendance_date =
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
      WHERE COALESCE(s.is_active, true) = true
      ORDER BY
        (a.check_in IS NOT NULL) DESC,
        a.check_in DESC NULLS LAST,
        s.full_name ASC
    `,
    sql`
      WITH days AS (
        SELECT generate_series(
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - 6,
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date,
          INTERVAL '1 day'
        )::date AS attendance_date
      ),
      active_staff AS (
        SELECT id
        FROM staff
        WHERE COALESCE(is_active, true) = true
      ),
      staff_total AS (
        SELECT COUNT(*)::int AS total
        FROM active_staff
      )
      SELECT
        days.attendance_date::text AS date,
        TO_CHAR(days.attendance_date, 'Dy') AS day,
        COUNT(active_staff.id)::int AS present,
        staff_total.total
      FROM days
      CROSS JOIN staff_total
      LEFT JOIN attendance a
        ON a.attendance_date = days.attendance_date
        AND a.check_in IS NOT NULL
      LEFT JOIN active_staff
        ON active_staff.id = a.staff_id
      GROUP BY days.attendance_date, staff_total.total
      ORDER BY days.attendance_date ASC
    `,
  ]);

  const attendance = attendanceRows.map((row) => ({
    staffId: row.staff_id,
    teacherId: row.teacher_id || "",
    fullName: row.full_name,
    subject: row.subject || "Staff",
    checkIn: serializeTimestamp(row.check_in),
    checkOut: serializeTimestamp(row.check_out),
    status: row.check_in ? row.status || "Present" : "Absent",
    isLate: Boolean(row.is_late),
    isEarly: Boolean(row.is_early),
  }));

  const totalStaff = attendance.length;
  const present = attendance.filter((row) => row.checkIn).length;
  const checkedIn = attendance.filter((row) => row.checkIn && !row.checkOut).length;
  const completed = attendance.filter((row) => row.checkOut).length;
  const late = attendance.filter((row) => row.isLate).length;
  const early = attendance.filter((row) => row.isEarly).length;

  return {
    props: {
      admin,
      generatedAt: new Date().toISOString(),
      attendance,
      summary: {
        totalStaff,
        present,
        absent: Math.max(totalStaff - present, 0),
        checkedIn,
        completed,
        late,
        early,
        attendanceRate:
          totalStaff > 0 ? Math.round((present / totalStaff) * 100) : 0,
      },
      weekly: weeklyRows.map((row) => {
        const total = numberValue(row.total);
        const dayPresent = numberValue(row.present);

        return {
          date: row.date,
          day: row.day,
          present: dayPresent,
          rate: total > 0 ? Math.round((dayPresent / total) * 100) : 0,
        };
      }),
    },
  };
}

function SummaryCard({ icon: Icon, label, value, detail, tone }) {
  const tones = {
    green: "bg-emerald-600 text-white",
    blue: "bg-blue-600 text-white",
    red: "bg-rose-500 text-white",
    slate: "bg-slate-900 text-white",
  };

  return (
    <article className={`rounded-[1.75rem] p-5 shadow-lg ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white/75">{label}</p>
          <p className="mt-2 text-4xl font-black tracking-tight">{value}</p>
          <p className="mt-1 text-xs font-semibold text-white/70">{detail}</p>
        </div>
        <span className="rounded-2xl bg-white/15 p-3">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
      </div>
    </article>
  );
}

function StatusPill({ row }) {
  if (!row.checkIn) {
    return (
      <span className="inline-flex rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">
        Absent
      </span>
    );
  }

  if (!row.checkOut) {
    return (
      <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
        Checked in
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
      Completed
    </span>
  );
}

export default function AdminDashboardPage({
  admin,
  attendance,
  generatedAt,
  summary,
  weekly,
}) {
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState(new Date(generatedAt));
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const clockTimer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    const refreshTimer = window.setInterval(async () => {
      if (
        document.visibilityState !== "visible" ||
        router.pathname !== "/admin/dashboard"
      ) {
        return;
      }

      try {
        await router.replace(router.asPath, undefined, { scroll: false });
      } catch (error) {
        if (!error?.cancelled) {
          console.error("Dashboard refresh failed:", error);
        }
      }
    }, 60000);

    return () => {
      window.clearInterval(clockTimer);
      window.clearInterval(refreshTimer);
    };
  }, [router]);

  async function handleRefresh() {
    setIsRefreshing(true);

    try {
      await router.replace(router.asPath, undefined, { scroll: false });
    } catch (error) {
      if (!error?.cancelled) {
        console.error("Dashboard refresh failed:", error);
      }
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleLogout() {
    window.localStorage.removeItem("admin");

    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      router.replace("/admin/login");
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[#f4f7f5] text-slate-950">
      <header className="bg-emerald-700 px-5 text-white shadow-lg">
        <div
          className="mx-auto flex max-w-7xl items-center justify-between gap-4 py-5"
          style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}
        >
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-100">
              Admin dashboard
            </p>
            <h1 className="mt-1 truncate text-2xl font-black">Good day, {admin.name}</h1>
            <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-emerald-100">
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              {formatIstTimeWithSeconds(currentTime)} IST
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Refresh dashboard"
              onClick={handleRefresh}
              className="flex min-h-12 min-w-12 items-center justify-center rounded-2xl bg-white/15 transition active:scale-95"
            >
              <RefreshCw
                className={`h-5 w-5 ${isRefreshing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              aria-label="Log out"
              onClick={handleLogout}
              className="flex min-h-12 min-w-12 items-center justify-center rounded-2xl bg-white/15 transition active:scale-95"
            >
              <LogOut className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-5 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6">
        <section aria-labelledby="today-heading">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 id="today-heading" className="text-xl font-black">
                Today
              </h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                {formatIstDate(currentTime)} · Updated automatically
              </p>
            </div>
            <div className="rounded-full bg-white px-3 py-2 text-sm font-black text-emerald-700 shadow-sm">
              {summary.attendanceRate}%
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard
              icon={Users}
              label="Active staff"
              value={summary.totalStaff}
              detail="Registered"
              tone="slate"
            />
            <SummaryCard
              icon={UserCheck}
              label="Present"
              value={summary.present}
              detail={`${summary.checkedIn} still on site`}
              tone="green"
            />
            <SummaryCard
              icon={UserX}
              label="Absent"
              value={summary.absent}
              detail="No check-in today"
              tone="red"
            />
            <SummaryCard
              icon={CheckCircle2}
              label="Completed"
              value={summary.completed}
              detail="Checked out"
              tone="blue"
            />
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <article className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black">Last 7 days</h2>
                <p className="text-sm text-slate-500">Attendance rate by IST date</p>
              </div>
              <CalendarDays className="h-6 w-6 text-emerald-600" aria-hidden="true" />
            </div>

            <div className="mt-6 flex h-48 items-end gap-2 sm:gap-4">
              {weekly.map((day) => (
                <div key={day.date} className="flex h-full flex-1 flex-col justify-end text-center">
                  <span className="mb-2 text-xs font-bold text-slate-500">{day.rate}%</span>
                  <div className="flex h-32 items-end rounded-2xl bg-emerald-50 p-1">
                    <div
                      className="w-full rounded-xl bg-emerald-500 transition-[height] duration-500"
                      style={{ height: `${Math.max(day.rate, day.present ? 8 : 0)}%` }}
                      title={`${day.present} present`}
                    />
                  </div>
                  <span className="mt-2 text-xs font-bold text-slate-600">{day.day}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
            <h2 className="text-lg font-black">Exceptions</h2>
            <p className="text-sm text-slate-500">
              Schedule: {formatIstTime(`2026-01-01T04:00:00.000Z`)} to{" "}
              {formatIstTime(`2026-01-01T11:00:00.000Z`)} IST
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-amber-50 p-4">
                <Clock3 className="h-5 w-5 text-amber-600" aria-hidden="true" />
                <p className="mt-3 text-3xl font-black text-amber-900">{summary.late}</p>
                <p className="text-sm font-bold text-amber-700">Late arrivals</p>
              </div>
              <div className="rounded-2xl bg-violet-50 p-4">
                <TimerOff className="h-5 w-5 text-violet-600" aria-hidden="true" />
                <p className="mt-3 text-3xl font-black text-violet-900">{summary.early}</p>
                <p className="text-sm font-bold text-violet-700">Early exits</p>
              </div>
            </div>
          </article>
        </section>

        <section className="mt-6">
          <div className="mb-3">
            <h2 className="text-xl font-black">Today&apos;s attendance</h2>
            <p className="text-sm text-slate-500">Live status for all active staff</p>
          </div>

          <div className="overflow-hidden rounded-[1.75rem] bg-white shadow-sm ring-1 ring-slate-200/70">
            {attendance.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <Users className="mx-auto h-9 w-9 text-slate-300" aria-hidden="true" />
                <p className="mt-3 font-bold text-slate-700">No active staff found</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {attendance.map((row) => (
                  <article
                    key={row.staffId}
                    className="grid gap-4 px-5 py-4 sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(90px,0.7fr))] sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-black text-slate-900">{row.fullName}</h3>
                        {row.isLate ? (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black uppercase text-amber-800">
                            Late
                          </span>
                        ) : null}
                        {row.isEarly ? (
                          <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-black uppercase text-violet-800">
                            Early
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-slate-500">
                        {row.teacherId} · {row.subject}
                      </p>
                      <div className="mt-3 sm:hidden">
                        <StatusPill row={row} />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 sm:contents">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                          Check-in
                        </p>
                        <p className="mt-1 text-sm font-black">{formatIstTime(row.checkIn)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                          Check-out
                        </p>
                        <p className="mt-1 text-sm font-black">{formatIstTime(row.checkOut)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                          Duration
                        </p>
                        <p className="mt-1 text-sm font-black">
                          {formatDuration(row.checkIn, row.checkOut)}
                        </p>
                      </div>
                    </div>

                    <div className="hidden sm:block">
                      <StatusPill row={row} />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <BottomNavigation />
    </main>
  );
}

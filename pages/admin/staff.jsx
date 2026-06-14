import {
  Camera,
  CheckCircle2,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import Swal from "sweetalert2";

import BottomNavigation from "@/components/BottomNavigation";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-session";
import { getSql } from "@/lib/db";

const subjects = [
  "Mathematics",
  "Science",
  "English",
  "Social Studies",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Science",
  "Hindi",
  "Telugu",
  "Other",
];

function getInitials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export async function getServerSideProps({ req }) {
  const admin = await verifyAdminSessionToken(
    req.cookies?.[ADMIN_SESSION_COOKIE]
  );

  if (!admin) {
    return {
      redirect: {
        destination: "/admin/login?from=/admin/staff",
        permanent: false,
      },
    };
  }

  const sql = getSql();

  const rows = await sql`
    SELECT
      s.id,
      s.teacher_id,
      s.full_name,
      s.subject,
      s.photo_url,
      COALESCE(s.is_active, true) AS is_active,
      (
        s.face_registered = true
        AND s.face_embedding IS NOT NULL
      ) AS face_ready,
      COUNT(a.id)::int AS attendance_count
    FROM staff s
    LEFT JOIN attendance a ON a.staff_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `;

  return {
    props: {
      staff: rows.map((row) => ({
        id: row.id,
        teacherId: row.teacher_id || "",
        fullName: row.full_name || "",
        subject: row.subject || "",
        photoUrl: row.photo_url || "",
        isActive: Boolean(row.is_active),
        faceReady: Boolean(row.face_ready),
        attendanceCount: Number(row.attendance_count || 0),
      })),
    },
  };
}

export default function StaffPage({ staff = [] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);

  const staffList = Array.isArray(staff) ? staff : [];

  const activeStaff = staffList.filter((person) => person.isActive).length;

  const faceReadyStaff = staffList.filter(
    (person) => person.isActive && person.faceReady
  ).length;

  const normalizedQuery = query.trim().toLowerCase();

  const filteredStaff = normalizedQuery
    ? staffList.filter((person) =>
        [
          person?.fullName || "",
          person?.teacherId || "",
          person?.subject || "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      )
    : staffList;

  async function refreshPage() {
    await router.replace(router.asPath, undefined, {
      scroll: false,
    });
  }

  async function saveStaff(event) {
    event.preventDefault();

    if (!editing?.id) {
      return;
    }

    const response = await fetch(`/api/admin/staff/${editing.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        teacher_id: editing.teacherId || "",
        full_name: editing.fullName || "",
        subject: editing.subject || "",
        is_active: editing.isActive ?? true,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await Swal.fire({
        icon: "error",
        title: "Update Failed",
        text: data.message || "Unable to update staff",
        confirmButtonColor: "#43A047",
      });
      return;
    }

    setEditing(null);
    await refreshPage();
  }

  async function disableStaff(person) {
    const result = await Swal.fire({
      icon: "warning",
      title: `Disable ${person?.fullName || "this staff"}?`,
      text: "They will be removed from face recognition. Attendance history is preserved.",
      showCancelButton: true,
      confirmButtonText: "Disable",
      confirmButtonColor: "#dc2626",
    });

    if (!result.isConfirmed) {
      return;
    }

    const response = await fetch(`/api/admin/staff/${person.id}`, {
      method: "DELETE",
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await Swal.fire({
        icon: "error",
        title: "Unable to Disable",
        text: data.message || "Please try again",
        confirmButtonColor: "#43A047",
      });
      return;
    }

    await refreshPage();
  }

  async function restoreStaff(person) {
    const response = await fetch(`/api/admin/staff/${person.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        teacher_id: person.teacherId || "",
        full_name: person.fullName || "",
        subject: person.subject || "",
        is_active: true,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await Swal.fire({
        icon: "error",
        title: "Unable to Restore",
        text: data.message || "Please try again",
        confirmButtonColor: "#43A047",
      });
      return;
    }

    await refreshPage();
  }

  return (
    <main className="min-h-[100dvh] bg-[#f4f7f5] text-slate-950">
      <header className="bg-emerald-700 px-5 text-white shadow-lg">
        <div
          className="mx-auto max-w-5xl py-5"
          style={{
            paddingTop: "calc(1.25rem + env(safe-area-inset-top))",
          }}
        >
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-100">
            Administration
          </p>
          <h1 className="mt-1 text-3xl font-black">Staff</h1>
          <p className="mt-1 text-sm font-semibold text-emerald-100">
            Manage profiles and face registration
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-5 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6">
        <section className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-slate-900 p-4 text-white">
            <p className="text-3xl font-black">{staffList.length}</p>
            <p className="mt-1 text-xs font-bold text-slate-300">
              Total Staff
            </p>
          </div>

          <div className="rounded-2xl bg-emerald-600 p-4 text-white">
            <p className="text-3xl font-black">{activeStaff}</p>
            <p className="mt-1 text-xs font-bold text-emerald-100">
              Active
            </p>
          </div>

          <div className="rounded-2xl bg-blue-600 p-4 text-white">
            <p className="text-3xl font-black">{faceReadyStaff}</p>
            <p className="mt-1 text-xs font-bold text-blue-100">
              Face Ready
            </p>
          </div>
        </section>

        <div className="relative mt-4">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />

          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search staff"
            className="min-h-14 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 font-semibold outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
          />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm font-bold text-slate-500">
            {filteredStaff.length} staff members
          </p>

          <Link
            href="/admin/teachers/enroll"
            className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white"
          >
            Add Staff
          </Link>
        </div>

        <section className="mt-4 space-y-3">
          {filteredStaff.length === 0 ? (
            <div className="rounded-3xl bg-white px-6 py-14 text-center ring-1 ring-slate-200">
              <Users
                className="mx-auto h-10 w-10 text-slate-300"
                aria-hidden="true"
              />
              <p className="mt-3 font-black text-slate-700">
                No staff found
              </p>
            </div>
          ) : (
            filteredStaff.map((person) => (
              <article
                key={person.id}
                className={`rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 ${
                  person.isActive ? "" : "opacity-65"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg font-black text-emerald-700">
                    {getInitials(person.fullName) || (
                      <UserRound className="h-6 w-6" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-black">
                        {person.fullName || "Unnamed Staff"}
                      </h2>

                      {!person.isActive ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">
                          Disabled
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      {person.teacherId || "No ID"} ·{" "}
                      {person.subject || "No Subject"}
                    </p>

                    <p className="mt-1 text-xs font-bold text-slate-400">
                      {person.attendanceCount} attendance records
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${
                      person.faceReady
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {person.faceReady ? "Face ready" : "Face update required"}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        id: person.id,
                        teacherId: person.teacherId || "",
                        fullName: person.fullName || "",
                        subject: person.subject || "",
                        isActive: person.isActive ?? true,
                      })
                    }
                    className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-100 text-sm font-black text-slate-700"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    Edit
                  </button>

                  <Link
                    href={`/admin/teachers/enroll?staffId=${person.id}`}
                    className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-50 text-sm font-black text-emerald-700"
                  >
                    <Camera className="h-4 w-4" aria-hidden="true" />
                    Face
                  </Link>

                  {person.isActive ? (
                    <button
                      type="button"
                      onClick={() => disableStaff(person)}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-rose-50 text-sm font-black text-rose-700"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Delete
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => restoreStaff(person)}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-50 text-sm font-black text-blue-700"
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      Restore
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </section>
      </div>

      {editing && editing.id ? (
        <div className="fixed inset-0 z-[80] flex items-end bg-slate-950/45 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <form
            onSubmit={saveStaff}
            className="w-full max-w-md rounded-[2rem] bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">Edit Staff</h2>

              <button
                type="button"
                aria-label="Close"
                onClick={() => setEditing(null)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <label className="mt-5 block text-sm font-black text-slate-700">
              Teacher ID
              <input
                value={editing?.teacherId || ""}
                onChange={(event) =>
                  setEditing((current) =>
                    current
                      ? {
                          ...current,
                          teacherId: event.target.value.toUpperCase(),
                        }
                      : current
                  )
                }
                className="mt-2 min-h-13 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-emerald-500"
              />
            </label>

            <label className="mt-4 block text-sm font-black text-slate-700">
              Name
              <input
                value={editing?.fullName || ""}
                onChange={(event) =>
                  setEditing((current) =>
                    current
                      ? {
                          ...current,
                          fullName: event.target.value,
                        }
                      : current
                  )
                }
                className="mt-2 min-h-13 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-emerald-500"
              />
            </label>

            <label className="mt-4 block text-sm font-black text-slate-700">
              Subject
              <select
                value={editing?.subject || ""}
                onChange={(event) =>
                  setEditing((current) =>
                    current
                      ? {
                          ...current,
                          subject: event.target.value,
                        }
                      : current
                  )
                }
                className="mt-2 min-h-13 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-emerald-500"
              >
                {editing?.subject && !subjects.includes(editing.subject) ? (
                  <option value={editing.subject}>{editing.subject}</option>
                ) : null}

                {subjects.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 font-black text-white"
            >
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              Save Changes
            </button>
          </form>
        </div>
      ) : null}

      <BottomNavigation />
    </main>
  );
}
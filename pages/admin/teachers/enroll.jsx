import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";

import BottomNavigation from "@/components/BottomNavigation";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-session";
import { getSql } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/migrations";

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

export async function getServerSideProps({ req, query }) {
  const admin = await verifyAdminSessionToken(
    req.cookies?.[ADMIN_SESSION_COOKIE],
  );

  if (!admin) {
    return {
      redirect: {
        destination: "/admin/login",
        permanent: false,
      },
    };
  }

  const staffId = typeof query.staffId === "string" ? query.staffId : "";

  if (!staffId) {
    return { props: { initialStaff: null } };
  }

  try {
    const sql = getSql();
    await ensureCoreSchema(sql);
    const rows = await sql`
      SELECT id, teacher_id, full_name, subject, salary, pin_hash IS NOT NULL AS pin_set
      FROM staff
      WHERE id = ${staffId}
      LIMIT 1
    `;

    return {
      props: {
        initialStaff: rows[0]
          ? {
              id: rows[0].id,
              teacherId: rows[0].teacher_id,
              fullName: rows[0].full_name,
              subject: rows[0].subject,
              salary:
                rows[0].salary === null || rows[0].salary === undefined
                  ? ""
                  : String(rows[0].salary),
              pinSet: Boolean(rows[0].pin_set),
            }
          : null,
      },
    };
  } catch {
    return {
      redirect: {
        destination: "/admin/staff",
        permanent: false,
      },
    };
  }
}

function getErrorMessage(error) {
  return error?.message || "Something went wrong";
}

export default function EnrollTeacherPage({ initialStaff }) {
  const router = useRouter();
  const photoInputRef = useRef(null);
  const photoPreviewRef = useRef("");

  const [teacherId, setTeacherId] = useState(initialStaff?.teacherId || "");
  const [teacherName, setTeacherName] = useState(initialStaff?.fullName || "");
  const [subject, setSubject] = useState(initialStaff?.subject || "");
  const [salary, setSalary] = useState(initialStaff?.salary || "");
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const isNewTeacher = !initialStaff;
  const pinMatches = pin.length === 4 && pin === confirmPin;
  const isPinValid = isNewTeacher ? pinMatches : pin === "" || pinMatches;

  useEffect(() => {
    async function loadNextTeacherId() {
      if (initialStaff) {
        return;
      }

      try {
        const response = await fetch("/api/admin/teachers/next-id");
        const data = await response.json();

        if (response.ok && data.success) {
          setTeacherId(data.teacher_id);
        }
      } catch {
        setTeacherId("T001");
      }
    }

    loadNextTeacherId();

    return () => {
      if (photoPreviewRef.current) {
        URL.revokeObjectURL(photoPreviewRef.current);
      }
    };
  }, [initialStaff]);

  const generateNextTeacherId = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/teachers/next-id");
      const data = await response.json();

      if (response.ok && data.success) {
        setTeacherId(data.teacher_id);
      }
    } catch {
      setTeacherId("T001");
    }
  }, []);

  function revokePhotoPreview() {
    if (photoPreviewRef.current) {
      URL.revokeObjectURL(photoPreviewRef.current);
      photoPreviewRef.current = "";
    }
  }

  const handlePhotoChange = useCallback((event) => {
    const nextPhoto = event.target.files?.[0] || null;
    const nextPreview = nextPhoto ? URL.createObjectURL(nextPhoto) : "";

    revokePhotoPreview();
    setPhoto(nextPhoto);
    setPhotoPreview(nextPreview);
    photoPreviewRef.current = nextPreview;
  }, []);

  const resetForm = useCallback(() => {
    setTeacherName("");
    setSubject("");
    setSalary("");
    setPhoto(null);
    revokePhotoPreview();
    setPhotoPreview("");
    setPin("");
    setConfirmPin("");

    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }

    generateNextTeacherId();
  }, [generateNextTeacherId]);

  const saveTeacher = useCallback(
    async (event) => {
      event.preventDefault();

      if (!teacherId.trim()) {
        await Swal.fire({
          icon: "error",
          title: "Teacher ID Required",
          text: "Please enter a Teacher ID.",
          confirmButtonColor: "#43A047",
        });
        return;
      }

      if (!teacherName.trim()) {
        await Swal.fire({
          icon: "error",
          title: "Teacher Name Required",
          text: "Please enter the teacher name.",
          confirmButtonColor: "#43A047",
        });
        return;
      }

      if (!subject) {
        await Swal.fire({
          icon: "error",
          title: "Subject Required",
          text: "Please select a subject.",
          confirmButtonColor: "#43A047",
        });
        return;
      }

      if (!isPinValid) {
        await Swal.fire({
          icon: "error",
          title: "PIN Required",
          text: isNewTeacher
            ? "Please enter and confirm a 4-digit PIN."
            : "PIN and confirmation must match (leave both blank to keep the current PIN).",
          confirmButtonColor: "#43A047",
        });
        return;
      }

      setIsSaving(true);

      try {
        const response = await fetch("/api/admin/teachers/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            staff_id: initialStaff?.id || null,
            teacher_id: teacherId.trim(),
            full_name: teacherName.trim(),
            subject,
            salary,
            pin,
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || "Unable to save teacher");
        }

        await Swal.fire({
          icon: "success",
          title: data.teacher_updated ? "Teacher Updated" : "Teacher Enrolled",
          text: data.teacher_updated
            ? `${data.teacher.full_name}'s details were updated.`
            : data.teacher_id_changed
              ? `Teacher registered successfully as ${data.teacher.teacher_id}.`
              : "Teacher registered successfully.",
          confirmButtonColor: "#43A047",
        });

        if (initialStaff) {
          router.replace("/admin/staff");
        } else {
          resetForm();
        }
      } catch (error) {
        await Swal.fire({
          icon: "error",
          title: "Save Failed",
          text: getErrorMessage(error),
          confirmButtonColor: "#43A047",
        });
      } finally {
        setIsSaving(false);
      }
    },
    [
      teacherId,
      teacherName,
      subject,
      salary,
      pin,
      isPinValid,
      isNewTeacher,
      initialStaff,
      router,
      resetForm,
    ],
  );

  return (
    <main className="min-h-[100dvh] bg-[#f4f7f5] text-slate-950 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="bg-emerald-700 px-5 text-white shadow-lg">
        <div
          className="mx-auto max-w-5xl py-5"
          style={{
            paddingTop: "calc(1.25rem + env(safe-area-inset-top))",
          }}
        >
          <button
            onClick={() => router.back()}
            className="mb-3 text-sm font-semibold text-emerald-100 transition hover:text-white"
            type="button"
          >
            ← Back
          </button>

          <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-100">
            {initialStaff ? "Update enrollment" : "New enrollment"}
          </p>
          <h1 className="mt-1 text-3xl font-black">
            {initialStaff ? "Update Teacher" : "Enroll Teacher"}
          </h1>
          <p className="mt-1 text-sm font-semibold text-emerald-100">
            {initialStaff
              ? `Update ${initialStaff.fullName}'s profile`
              : "Register a new teacher for QR Attendance"}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        <form onSubmit={saveTeacher} className="space-y-4">
          {/* Teacher ID */}
          <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
            <label className="mb-2 block text-sm font-black text-slate-700">
              Teacher ID
            </label>
            <input
              type="text"
              value={teacherId}
              readOnly={Boolean(initialStaff)}
              onChange={(event) =>
                setTeacherId(event.target.value.toUpperCase())
              }
              placeholder="T001"
              className="min-h-13 w-full rounded-2xl border border-slate-200 px-5 font-semibold outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 read-only:bg-slate-100 read-only:text-slate-500"
            />
          </div>

          {/* Teacher Name */}
          <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
            <label className="mb-2 block text-sm font-black text-slate-700">
              Teacher Name
            </label>
            <input
              type="text"
              value={teacherName}
              readOnly={Boolean(initialStaff)}
              onChange={(event) => setTeacherName(event.target.value)}
              placeholder="Ramesh Kumar"
              className="min-h-13 w-full rounded-2xl border border-slate-200 px-5 font-semibold outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 read-only:bg-slate-100 read-only:text-slate-500"
            />
          </div>

          {/* Subject */}
          <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
            <label className="mb-2 block text-sm font-black text-slate-700">
              Subject / Department
            </label>
            <select
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="min-h-13 w-full rounded-2xl border border-slate-200 px-5 font-semibold outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            >
              <option value="">Select Subject</option>
              {subjects.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          {/* Salary */}
          <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
            <label className="mb-2 block text-sm font-black text-slate-700">
              Salary
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={salary}
              onChange={(event) => setSalary(event.target.value)}
              placeholder="25000"
              className="min-h-13 w-full rounded-2xl border border-slate-200 px-5 font-semibold outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            />
          </div>

          {/* Photo */}
          <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
            <label className="mb-2 block text-sm font-black text-slate-700">
              Photo (Optional)
            </label>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-emerald-600 file:px-4 file:py-3 file:font-semibold file:text-white"
            />
            {photoPreview ? (
              <div
                aria-label="Teacher preview"
                className="mt-4 h-32 w-32 rounded-2xl bg-cover bg-center ring-1 ring-slate-200"
                style={{ backgroundImage: `url(${photoPreview})` }}
              />
            ) : null}
          </div>

          {/* Staff PIN */}
          <div className="rounded-[1.75rem] bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">
                  Staff PIN
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Used at the QR Attendance kiosk to check in and check out
                </p>
                {initialStaff ? (
                  <p className="mt-2 text-xs font-medium text-slate-400">
                    Leave both fields blank to keep the current PIN.
                  </p>
                ) : null}
              </div>

              {initialStaff?.pinSet ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                  PIN Set
                </span>
              ) : null}
            </div>

            <label className="mb-2 mt-5 block text-sm font-black text-slate-700">
              PIN (4 digits)
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="••••"
              className="min-h-13 w-full rounded-2xl border border-slate-200 px-5 text-center text-xl font-black tracking-[0.5em] outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            />

            <label className="mb-2 mt-4 block text-sm font-black text-slate-700">
              Confirm PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirmPin}
              onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="••••"
              className="min-h-13 w-full rounded-2xl border border-slate-200 px-5 text-center text-xl font-black tracking-[0.5em] outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            />
          </div>

          {/* Save button */}
          <button
            type="submit"
            disabled={!isPinValid || isSaving}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-lg font-black text-white shadow-lg transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            {isSaving ? "Saving Teacher..." : "Save Teacher"}
          </button>
        </form>
      </div>

      <BottomNavigation />
    </main>
  );
}

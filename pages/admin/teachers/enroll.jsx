import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";

import BottomNavigation from "@/components/BottomNavigation";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-session";
import { useFaceRegistration } from "@/hooks/useFaceRegistration";

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

export async function getServerSideProps({ req }) {
  const admin = await verifyAdminSessionToken(
    req.cookies?.[ADMIN_SESSION_COOKIE]
  );

  if (!admin) {
    return {
      redirect: {
        destination: "/admin/login",
        permanent: false,
      },
    };
  }

  return { props: {} };
}

function getErrorMessage(error) {
  return error?.message || "Something went wrong";
}

function getCameraSettingsText() {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const isAppleDevice = /iPhone|iPad|iPod/i.test(userAgent);

  if (isAppleDevice) {
    return "Settings -> Safari -> Camera -> Allow";
  }

  return "Settings -> Permissions -> Camera -> Allow";
}

export default function EnrollTeacherPage() {
  const router = useRouter();
  const photoInputRef = useRef(null);
  const photoPreviewRef = useRef("");

  const [teacherId, setTeacherId] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [subject, setSubject] = useState("");
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const {
    videoRef,
    steps,
    captures,
    capturedPose,
    currentPose,
    faceEmbedding,
    helperText,
    instruction,
    isCameraOpen,
    isComplete,
    isLoadingMediaPipe,
    isOverlayOpen,
    resetFaceRegistration,
    startCamera,
    stopCamera,
  } = useFaceRegistration({
    onComplete: async () => {
      await Swal.fire({
        icon: "success",
        title: "Face Registered",
        text: "Face registration completed successfully.",
        confirmButtonColor: "#43A047",
      });
    },
    onPermissionDenied: async () => {
      await Swal.fire({
        icon: "error",
        title: "Camera Permission Needed",
        text: "Camera access is required for face registration.",
        confirmButtonText: "Open Settings",
        confirmButtonColor: "#43A047",
        footer: getCameraSettingsText(),
      });
    },
    onError: async (error) => {
      await Swal.fire({
        icon: "error",
        title: "Camera Error",
        text: getErrorMessage(error),
        confirmButtonColor: "#43A047",
      });
    },
  });

  useEffect(() => {
    async function loadNextTeacherId() {
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
  }, []);

  async function generateNextTeacherId() {
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

  function revokePhotoPreview() {
    if (photoPreviewRef.current) {
      URL.revokeObjectURL(photoPreviewRef.current);
      photoPreviewRef.current = "";
    }
  }

  function handlePhotoChange(event) {
    const nextPhoto = event.target.files?.[0] || null;
    const nextPreview = nextPhoto ? URL.createObjectURL(nextPhoto) : "";

    revokePhotoPreview();
    setPhoto(nextPhoto);
    setPhotoPreview(nextPreview);
    photoPreviewRef.current = nextPreview;
  }

  function resetForm() {
    setTeacherName("");
    setSubject("");
    setPhoto(null);
    revokePhotoPreview();
    setPhotoPreview("");
    resetFaceRegistration();

    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }

    generateNextTeacherId();
  }

  async function saveTeacher(event) {
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

    if (!isComplete) {
      await Swal.fire({
        icon: "error",
        title: "Face Registration Required",
        text: "Please complete Look Straight, Turn Left, and Turn Right.",
        confirmButtonColor: "#43A047",
      });
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/admin/teachers/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teacher_id: teacherId.trim(),
          full_name: teacherName.trim(),
          subject,
          face_embedding: faceEmbedding,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to save teacher");
      }

      await Swal.fire({
        icon: "success",
        title: data.teacher_updated ? "Face Updated" : "Teacher Enrolled",
        text: data.teacher_updated
          ? `${data.teacher.full_name}'s face registration was updated.`
          : data.teacher_id_changed
            ? `Teacher registered successfully as ${data.teacher.teacher_id}.`
            : "Teacher registered successfully.",
        confirmButtonColor: "#43A047",
      });

      resetForm();
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
  }

  if (isOverlayOpen) {
    const completedCount = steps.filter((step) => captures[step.key]).length;
    const currentStep = steps.find((step) => step.key === currentPose);

    return (
      <main className="fixed inset-0 z-[100] h-screen w-screen overflow-hidden bg-black text-white">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"
        />

        <div className="absolute inset-0 bg-black/55" />

        <header
          className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5"
          style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            onClick={stopCamera}
            className="rounded-full bg-black/50 px-4 py-2 text-sm font-bold backdrop-blur"
          >
            ← Back
          </button>

          <h1 className="text-lg font-bold">Register Face</h1>

          <span className="w-16" />
        </header>

        <section className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6">
          <div className="relative flex h-[340px] w-[340px] items-center justify-center rounded-full">
            <div className="absolute inset-0 rounded-full border-4 border-[#43A047] shadow-[0_0_55px_rgba(67,160,71,0.95)]" />
            <div className="absolute inset-5 rounded-full border border-white/35" />

            {!capturedPose && !isComplete ? (
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-r-[#43A047] border-t-white/90" />
            ) : null}

            {capturedPose ? (
              <div className="absolute flex h-24 w-24 items-center justify-center rounded-full bg-[#43A047] text-5xl font-black text-white shadow-2xl">
                ✓
              </div>
            ) : null}
          </div>

          <div className="mt-8 text-center">
            <p className="text-2xl font-black drop-shadow">
              {isComplete
                ? "Face Registered"
                : capturedPose
                  ? "Captured"
                  : currentStep?.label || "Find Your Face"}
            </p>

            <p className="mt-2 text-sm font-semibold text-white/75">
              {isLoadingMediaPipe
                ? "Preparing camera..."
                : instruction || "Keep your face inside the circle"}
            </p>
          </div>

          <div className="mt-7 flex items-center gap-4">
            {steps.map((step) => {
              const completed = Boolean(captures[step.key]);
              const active = currentPose === step.key && !completed;

              return (
                <div
                  key={step.key}
                  className={[
                    "flex h-12 w-12 items-center justify-center rounded-full text-lg font-black transition-all",
                    completed
                      ? "bg-[#43A047] text-white shadow-[0_0_25px_rgba(67,160,71,0.8)]"
                      : active
                        ? "bg-white text-[#43A047]"
                        : "bg-white/20 text-white backdrop-blur",
                  ].join(" ")}
                >
                  {completed ? "✓" : active ? completedCount + 1 : "○"}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex gap-4 text-xs font-bold text-white/80">
            <span>Straight</span>
            <span>Left</span>
            <span>Right</span>
          </div>

          {helperText ? (
            <p className="mt-5 text-center text-xs font-semibold text-white/60">
              {helperText}
            </p>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f3f8f4] pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="bg-[#43A047] px-6 py-5 text-white shadow-lg">
        <button
          onClick={() => router.back()}
          className="mb-4 text-sm font-medium"
          type="button"
        >
          Back
        </button>

        <h1 className="text-2xl font-bold">Enroll Teacher</h1>
        <p className="mt-1 text-green-100">Register a new teacher</p>
      </header>

      <div className="p-5">
        <form onSubmit={saveTeacher} className="space-y-5">
          <div className="rounded-3xl bg-white p-5 shadow-lg">
            <label className="mb-2 block font-semibold text-slate-700">
              Teacher ID
            </label>

            <input
              type="text"
              value={teacherId}
              onChange={(event) =>
                setTeacherId(event.target.value.toUpperCase())
              }
              placeholder="T001"
              className="h-14 w-full rounded-2xl border border-slate-200 px-5 outline-none focus:border-[#43A047]"
            />
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-lg">
            <label className="mb-2 block font-semibold text-slate-700">
              Teacher Name
            </label>

            <input
              type="text"
              value={teacherName}
              onChange={(event) => setTeacherName(event.target.value)}
              placeholder="Ramesh Kumar"
              className="h-14 w-full rounded-2xl border border-slate-200 px-5 outline-none focus:border-[#43A047]"
            />
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-lg">
            <label className="mb-2 block font-semibold text-slate-700">
              Subject
            </label>

            <select
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="h-14 w-full rounded-2xl border border-slate-200 px-5 outline-none focus:border-[#43A047]"
            >
              <option value="">Select Subject</option>
              {subjects.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-lg">
            <label className="mb-2 block font-semibold text-slate-700">
              Photo (Optional)
            </label>

            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-[#43A047] file:px-4 file:py-3 file:font-semibold file:text-white"
            />

            {photoPreview ? (
              <div
                aria-label="Teacher preview"
                className="mt-4 h-32 w-32 rounded-2xl bg-cover bg-center"
                style={{ backgroundImage: `url(${photoPreview})` }}
              />
            ) : null}
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Face Registration
                </h2>

                <p className="mt-2 text-sm font-semibold text-slate-600">
                  Register face once for attendance recognition.
                </p>
                <p className="mt-2 text-xs font-medium text-slate-500">
                  To update an existing face, enter the same Teacher ID and name,
                  then register again.
                </p>
              </div>

              {isComplete ? (
                <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-bold text-green-700">
                  Face Registered
                </span>
              ) : null}
            </div>

            <div className="mt-5 space-y-3">
              {steps.map((step) => {
                const completed = Boolean(captures[step.key]);

              
              })}
            </div>

            <button
              type="button"
              onClick={startCamera}
              disabled={isLoadingMediaPipe || isCameraOpen || isComplete}
              className="mt-5 w-full rounded-2xl bg-[#43A047] py-4 font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isComplete
                ? "Face Registered"
                : isLoadingMediaPipe
                  ? "Preparing..."
                  : "Register Face"}
            </button>

            {isComplete ? (
              <button
                type="button"
                onClick={resetFaceRegistration}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white py-4 font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Re-register Face
              </button>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={!isComplete || isSaving}
            className="w-full rounded-2xl bg-[#43A047] py-4 text-lg font-bold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Saving Teacher..." : "Save Teacher"}
          </button>
        </form>
      </div>

      <BottomNavigation />
    </main>
  );
}

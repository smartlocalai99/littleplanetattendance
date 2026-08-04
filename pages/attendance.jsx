import jsQR from "jsqr";
import { CheckCircle2, KeyRound, QrCode } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";

import TutorialOverlay from "@/components/TutorialOverlay";
import { SCHOOL_ATTENDANCE_QR_VALUE } from "@/lib/attendance-qr";
import {
  getStoredDeviceToken,
  requestPersistentStorage,
  storeDeviceToken,
} from "@/lib/device-credential-client";
import { formatIstTime, formatIstTimeWithSeconds } from "@/lib/time";
import {
  getManualInstallInstructions,
  triggerPwaInstallPrompt,
  usePwaInstallState,
} from "@/lib/pwa-install";
import {
  hasSeenTutorial,
  markTutorialSeen,
  STAFF_TUTORIAL_STORAGE_KEY,
} from "@/lib/tutorial-storage";

const SUCCESS_DISPLAY_MS = 3000;
// jsQR + getImageData is heavier per-call than the old landmark check, so
// throttle decode attempts rather than running one every animation frame.
const SCAN_INTERVAL_MS = 150;

const STAFF_TUTORIAL_STEPS = [
  {
    icon: QrCode,
    title: "Scan QR",
    description: "Scan the school's QR code.",
  },
  {
    icon: KeyRound,
    title: "Enter Details",
    description: "Enter your Staff ID and PIN.",
  },
  {
    icon: CheckCircle2,
    title: "Mark Attendance",
    description: "Tap CHECK IN when arriving at school or CHECK OUT before leaving.",
  },
];

function getErrorMessage(error) {
  if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
    return "Camera access is blocked";
  }

  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
    return "No rear camera found";
  }

  if (error?.name === "NotReadableError" || error?.name === "TrackStartError") {
    return "Camera is already in use";
  }

  if (error?.message === "CAMERA_REQUIRES_HTTPS") {
    return "Camera requires HTTPS";
  }

  if (error?.message === "CAMERA_NOT_SUPPORTED") {
    return "Camera is not supported";
  }

  return error?.message || "Something went wrong";
}

async function markAttendance({ teacherId, pin, action, deviceToken }) {
  const response = await fetch("/api/attendance/qr/mark", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      qr_value: SCHOOL_ATTENDANCE_QR_VALUE,
      teacher_id: teacherId,
      pin,
      action,
      device_token: deviceToken || "",
    }),
  });
  const data = await response.json();

  if (!response.ok && !data.needs_device_registration && !data.device_not_authorised) {
    throw new Error(data.message || "Unable to mark attendance");
  }

  return data;
}

async function registerDevice({ teacherId, pin }) {
  const response = await fetch("/api/attendance/qr/register-device", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      qr_value: SCHOOL_ATTENDANCE_QR_VALUE,
      teacher_id: teacherId,
      pin,
    }),
  });
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || "Unable to register device");
  }

  return data;
}

async function getCameraPermissionState() {
  if (!navigator.permissions?.query) {
    return "unknown";
  }

  try {
    const permission = await navigator.permissions.query({ name: "camera" });
    return permission.state;
  } catch {
    // Safari does not currently expose camera through the Permissions API.
    return "unknown";
  }
}

function getPunchLabel(type) {
  if (type === "check_in") return "Punch In";
  if (type === "check_out") return "Punch Out";
  if (type === "already_checked_in") return "Already Checked In";
  if (type === "already_checked_out") return "Already Checked Out";
  return "Attendance";
}

export default function AttendanceScannerPage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanFrameIdRef = useRef(null);
  const isProcessingRef = useRef(false);
  const isStartingRef = useRef(false);
  const isMountedRef = useRef(false);
  const shouldContinueScanningRef = useRef(true);
  const lastScanTimeRef = useRef(0);
  const successTimeoutRef = useRef(null);

  const [phase, setPhase] = useState("scanning");
  const [status, setStatus] = useState("Starting scanner...");
  const [subStatus, setSubStatus] = useState("Please wait");
  const [currentTime, setCurrentTime] = useState(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [canRetry, setCanRetry] = useState(false);

  const [teacherId, setTeacherId] = useState("");
  const [pin, setPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { isInstalled } = usePwaInstallState();

  async function handleInstallClick() {
    const result = await triggerPwaInstallPrompt();

    if (result.outcome === "unsupported") {
      await Swal.fire({
        icon: "info",
        title: "Install This App",
        text: getManualInstallInstructions(),
        confirmButtonColor: "#43A047",
      });
    }
  }

  const [matchedStaff, setMatchedStaff] = useState(null);
  const [attendanceType, setAttendanceType] = useState("");
  const [recordedAt, setRecordedAt] = useState(null);
  const [isSuccessVisible, setIsSuccessVisible] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  function closeTutorial() {
    markTutorialSeen(STAFF_TUTORIAL_STORAGE_KEY);
    setShowTutorial(false);
  }

  async function startScannerCamera() {
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      throw new Error("CAMERA_REQUIRES_HTTPS");
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("CAMERA_NOT_SUPPORTED");
    }

    let stream;

    try {
      // Lower capture resolution than a typical camera app: QR decoding only
      // needs enough detail to resolve the code's modules, not visual
      // quality, and smaller frames process noticeably faster on weaker
      // phone CPUs.
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
    } catch (error) {
      if (
        error?.name !== "OverconstrainedError" &&
        error?.name !== "ConstraintNotSatisfiedError"
      ) {
        throw error;
      }

      // Older Android WebViews can reject ideal camera constraints.
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    }

    streamRef.current = stream;
    const videoTrack = stream.getVideoTracks()[0];

    if (videoTrack) {
      videoTrack.addEventListener(
        "ended",
        () => {
          if (!isMountedRef.current || streamRef.current !== stream) {
            return;
          }

          setIsCameraReady(false);
          setCanRetry(true);
          setStatus("Camera stopped");
          setSubStatus("Tap Retry Camera to continue");
        },
        { once: true },
      );
    }

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.setAttribute("playsinline", "");
      await videoRef.current.play();
    }

    window.localStorage.setItem("camera-access-granted", "true");
    setIsCameraReady(true);
  }

  function stopScanner() {
    if (scanFrameIdRef.current) {
      cancelAnimationFrame(scanFrameIdRef.current);
      scanFrameIdRef.current = null;
    }

    if (streamRef.current) {
      const stream = streamRef.current;
      streamRef.current = null;
      stream.getTracks().forEach((track) => track.stop());
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsCameraReady(false);
  }

  function decodeQrFromVideo(video) {
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    if (!width || !height) {
      return null;
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }

    const canvas = canvasRef.current;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(video, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const code = jsQR(imageData.data, width, height);

    return code?.data || null;
  }

  async function startScanLoop() {
    if (isStartingRef.current) {
      return;
    }

    isStartingRef.current = true;
    setCanRetry(false);
    shouldContinueScanningRef.current = true;
    stopScanner();

    try {
      const permissionState = await getCameraPermissionState();
      const previouslyGranted =
        permissionState === "granted" ||
        window.localStorage.getItem("camera-access-granted") === "true";

      if (permissionState === "denied") {
        const permissionError = new Error("Camera permission denied");
        permissionError.name = "NotAllowedError";
        throw permissionError;
      }

      setStatus("Starting camera...");
      setSubStatus(
        previouslyGranted
          ? "Opening your saved camera"
          : "Allow camera access once when asked",
      );

      await startScannerCamera();

      setStatus("Scan the QR Code");
      setSubStatus("Point the rear camera at the school attendance QR");

      isProcessingRef.current = false;
      scanFrameIdRef.current = requestAnimationFrame(scanFrameLoop);
    } catch (error) {
      console.error("QR Attendance scanner startup failed:", error);
      setStatus(getErrorMessage(error));
      setSubStatus("Check camera permission, then retry");
      setCanRetry(true);
      setIsCameraReady(false);
    } finally {
      isStartingRef.current = false;
    }
  }

  function scanFrameLoop() {
    if (!isMountedRef.current || !shouldContinueScanningRef.current) {
      return;
    }

    scanFrame().finally(() => {
      if (isMountedRef.current && shouldContinueScanningRef.current) {
        scanFrameIdRef.current = requestAnimationFrame(scanFrameLoop);
      }
    });
  }

  async function scanFrame() {
    const video = videoRef.current;

    if (!video || video.readyState < 2 || isProcessingRef.current) {
      return;
    }

    const now = performance.now();

    if (now - lastScanTimeRef.current < SCAN_INTERVAL_MS) {
      return;
    }

    lastScanTimeRef.current = now;
    isProcessingRef.current = true;

    try {
      const decoded = decodeQrFromVideo(video);

      if (!decoded) {
        setStatus("Scan the QR Code");
        setSubStatus("Point the rear camera at the school attendance QR");
        return;
      }

      if (decoded !== SCHOOL_ATTENDANCE_QR_VALUE) {
        setStatus("Invalid QR Code");
        setSubStatus("Scan the official school attendance QR");
        return;
      }

      // Valid QR - stop scanning and the camera immediately, move to the
      // Staff ID + PIN form.
      shouldContinueScanningRef.current = false;
      stopScanner();
      setPhase("form");
      setStatus("QR Verified");
      setSubStatus("Enter your Staff ID and PIN");
    } catch (error) {
      setStatus("Scanner error");
      setSubStatus(getErrorMessage(error));
    } finally {
      isProcessingRef.current = false;
    }
  }

  function showSuccess(staff, type, attendanceTime) {
    const formattedTime = attendanceTime
      ? `${formatIstTime(attendanceTime)} IST`
      : "";
    const popup =
      type === "check_in"
        ? {
            icon: "success",
            title: "Check-in Successful",
            text: `${staff.full_name}, your attendance has been marked${
              formattedTime ? ` at ${formattedTime}` : ""
            }.`,
          }
        : type === "check_out"
          ? {
              icon: "success",
              title: "Check-out Successful",
              text: `${staff.full_name}, your check-out has been marked${
                formattedTime ? ` at ${formattedTime}` : ""
              }.`,
            }
          : type === "already_checked_in"
            ? {
                icon: "info",
                title: "Already Checked In",
                text: `${staff.full_name}, you already checked in today${
                  formattedTime ? ` at ${formattedTime}` : ""
                }.`,
              }
            : {
                icon: "info",
                title: "Already Checked Out",
                text: `${staff.full_name}, you already checked out today${
                  formattedTime ? ` at ${formattedTime}` : ""
                }.`,
              };

    setMatchedStaff(staff);
    setAttendanceType(type);
    setRecordedAt(attendanceTime || null);
    setIsSuccessVisible(true);
    setTeacherId("");
    setPin("");

    if (navigator.vibrate) {
      navigator.vibrate(120);
    }

    void Swal.fire({
      ...popup,
      confirmButtonColor: "#43A047",
      timer: SUCCESS_DISPLAY_MS,
      timerProgressBar: true,
    });

    if (successTimeoutRef.current) {
      window.clearTimeout(successTimeoutRef.current);
    }

    successTimeoutRef.current = window.setTimeout(() => {
      // Every attendance action requires a fresh QR scan - rescanQr() also
      // fully re-acquires the camera (stopScanner() + a new getUserMedia()
      // call inside startScanLoop()), it doesn't just resume the stopped
      // stream from the previous scan.
      rescanQr();
    }, SUCCESS_DISPLAY_MS);
  }

  async function submitPunch(action) {
    if (isSubmitting) {
      return;
    }

    const cleanTeacherId = teacherId.trim().toUpperCase();

    if (!cleanTeacherId) {
      await Swal.fire({
        icon: "error",
        title: "Staff ID Required",
        text: "Please enter your Staff ID.",
        confirmButtonColor: "#43A047",
      });
      return;
    }

    if (!/^\d{4}$/.test(pin)) {
      await Swal.fire({
        icon: "error",
        title: "PIN Required",
        text: "Please enter your 4-digit PIN.",
        confirmButtonColor: "#43A047",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const deviceToken = await getStoredDeviceToken(cleanTeacherId);
      const result = await markAttendance({
        teacherId: cleanTeacherId,
        pin,
        action,
        deviceToken,
      });

      if (result.needs_device_registration) {
        setIsSubmitting(false);

        const confirmation = await Swal.fire({
          icon: "info",
          title: "REGISTER YOUR DEVICE",
          text: "This device will be used for your attendance.",
          showCancelButton: true,
          confirmButtonText: "REGISTER THIS DEVICE",
          confirmButtonColor: "#43A047",
        });

        if (!confirmation.isConfirmed) {
          return;
        }

        setIsSubmitting(true);
        const registration = await registerDevice({ teacherId: cleanTeacherId, pin });
        await storeDeviceToken(cleanTeacherId, registration.device_token);

        // Retry the original action now that this device is registered.
        setIsSubmitting(false);
        await submitPunch(action);
        return;
      }

      if (result.device_not_authorised) {
        await Swal.fire({
          icon: "error",
          title: "DEVICE NOT AUTHORISED",
          text: "Please use your registered device.",
          confirmButtonColor: "#43A047",
        });
        return;
      }

      showSuccess(
        result.staff,
        result.type,
        result.recorded_at ||
          result.attendance?.check_out ||
          result.attendance?.check_in,
      );
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: action === "check_in" ? "Check-In Failed" : "Check-Out Failed",
        text: error?.message || "Unable to mark attendance",
        confirmButtonColor: "#43A047",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function rescanQr() {
    setPhase("scanning");
    setMatchedStaff(null);
    setAttendanceType("");
    setRecordedAt(null);
    setIsSuccessVisible(false);
    setTeacherId("");
    setPin("");
    startScanLoop();
  }

  useEffect(() => {
    isMountedRef.current = true;
    void requestPersistentStorage();

    // localStorage isn't available during SSR, so this has to run after
    // mount rather than as a lazy useState initializer - otherwise the
    // client's first render would mismatch the server-rendered markup.
    if (!hasSeenTutorial(STAFF_TUTORIAL_STORAGE_KEY)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowTutorial(true);
    }

    const clockTimer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    const startupTimer = window.setTimeout(() => {
      startScanLoop();
    }, 0);

    return () => {
      isMountedRef.current = false;
      window.clearTimeout(startupTimer);
      window.clearInterval(clockTimer);

      if (successTimeoutRef.current) {
        window.clearTimeout(successTimeoutRef.current);
      }

      stopScanner();
    };
    // Scanner should start once when this public page mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "form") {
    return (
      <main className="fixed inset-0 flex h-[100dvh] w-screen flex-col items-center justify-center overflow-y-auto bg-black px-6 text-white">
        <header
          className="absolute inset-x-0 top-0 px-6 text-center"
          style={{ paddingTop: "calc(2rem + env(safe-area-inset-top))" }}
        >
          <p className="text-sm font-semibold uppercase tracking-[4px] text-white/70">
            Little Planet Attendance
          </p>
          <h1 className="mt-2 text-2xl font-bold">QR Attendance</h1>
          <p className="mt-2 font-mono text-sm font-semibold text-white/75">
            {formatIstTimeWithSeconds(currentTime)} IST
          </p>
        </header>

        <div
          className="absolute right-5 flex flex-col items-end gap-2"
          style={{ top: "calc(2rem + env(safe-area-inset-top))" }}
        >
          {!isInstalled ? (
            <button
              type="button"
              onClick={handleInstallClick}
              className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80 backdrop-blur"
            >
              Install App
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setShowTutorial(true)}
            className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80 backdrop-blur"
          >
            How to Use
          </button>
        </div>

        <div className="w-full max-w-sm rounded-3xl bg-white px-6 py-7 text-slate-950 shadow-2xl">
          {matchedStaff && isSuccessVisible ? (
            <div className="mb-5 rounded-2xl bg-emerald-50 px-4 py-3 text-center">
              <p className="text-xs font-bold uppercase tracking-[3px] text-emerald-600">
                {getPunchLabel(attendanceType)}
              </p>
              <h2 className="mt-1 text-xl font-black">{matchedStaff.full_name}</h2>
              {recordedAt ? (
                <p className="mt-1 text-sm font-bold text-slate-600">
                  {formatIstTime(recordedAt)} IST
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mb-5 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">
                ✓
              </div>
              <p className="mt-3 text-sm font-bold text-slate-500">
                QR Code Verified
              </p>
            </div>
          )}

          <label className="mb-2 block text-sm font-black text-slate-700">
            Staff ID
          </label>
          <input
            type="text"
            value={teacherId}
            onChange={(event) => setTeacherId(event.target.value.toUpperCase())}
            placeholder="T001"
            autoCapitalize="characters"
            className="min-h-14 w-full rounded-2xl border border-slate-200 px-5 text-lg font-bold outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
          />

          <label className="mb-2 mt-4 block text-sm font-black text-slate-700">
            PIN
          </label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="••••"
            className="min-h-14 w-full rounded-2xl border border-slate-200 px-5 text-center text-2xl font-black tracking-[0.5em] outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
          />

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => submitPunch("check_in")}
              disabled={isSubmitting}
              className="flex min-h-14 items-center justify-center rounded-2xl bg-emerald-600 text-base font-black text-white shadow-lg transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              CHECK IN
            </button>
            <button
              type="button"
              onClick={() => submitPunch("check_out")}
              disabled={isSubmitting}
              className="flex min-h-14 items-center justify-center rounded-2xl bg-indigo-600 text-base font-black text-white shadow-lg transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              CHECK OUT
            </button>
          </div>

          <button
            type="button"
            onClick={rescanQr}
            className="mt-4 flex min-h-12 w-full items-center justify-center text-sm font-bold text-slate-400"
          >
            Rescan QR Code
          </button>
        </div>

        {showTutorial ? (
          <TutorialOverlay steps={STAFF_TUTORIAL_STEPS} onDismiss={closeTutorial} />
        ) : null}
      </main>
    );
  }

  return (
    <main className="fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-black text-white">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={[
          "pointer-events-none h-[100dvh] w-screen object-cover transition-opacity duration-300",
          isCameraReady ? "opacity-100" : "opacity-20",
        ].join(" ")}
      />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,transparent_150px,rgba(0,0,0,0.70)_151px,rgba(0,0,0,0.92)_100%)]" />

      <section className="absolute inset-0 flex flex-col items-center justify-center px-6">
        <div className="relative flex h-[300px] w-[300px] items-center justify-center">
          <div className="absolute h-[300px] w-[300px] animate-ping rounded-full border-4 border-emerald-500/45" />
          <div className="absolute h-[300px] w-[300px] animate-pulse rounded-full border-4 border-emerald-500 shadow-[0_0_50px_rgba(16,185,129,0.8)]" />
          <div className="absolute h-[268px] w-[268px] rounded-full border border-white/60" />
        </div>
      </section>

      <header
        className="absolute inset-x-0 top-0 px-6 text-center"
        style={{ paddingTop: "calc(2rem + env(safe-area-inset-top))" }}
      >
        <p className="text-sm font-semibold uppercase tracking-[4px] text-white/70">
          Little Planet Attendance
        </p>
        <h1 className="mt-2 text-2xl font-bold">{status}</h1>
        <p className="mt-2 font-mono text-sm font-semibold text-white/75">
          {formatIstTimeWithSeconds(currentTime)} IST
        </p>
      </header>

      <div
        className="pointer-events-auto absolute right-5 flex flex-col items-end gap-2"
        style={{ top: "calc(2rem + env(safe-area-inset-top))" }}
      >
        {!isInstalled ? (
          <button
            type="button"
            onClick={handleInstallClick}
            className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80 backdrop-blur"
          >
            Install App
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setShowTutorial(true)}
          className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80 backdrop-blur"
        >
          How to Use
        </button>
      </div>

      <footer
        className="absolute inset-x-0 bottom-0 px-6 text-center"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
      >
        <p className="text-xl font-bold drop-shadow">{subStatus}</p>
        {canRetry ? (
          <button
            type="button"
            onClick={startScanLoop}
            className="pointer-events-auto mt-5 min-h-14 rounded-2xl bg-emerald-600 px-8 text-base font-black text-white shadow-2xl active:scale-95"
          >
            Retry Camera
          </button>
        ) : null}
      </footer>

      {showTutorial ? (
        <TutorialOverlay steps={STAFF_TUTORIAL_STEPS} onDismiss={closeTutorial} />
      ) : null}
    </main>
  );
}

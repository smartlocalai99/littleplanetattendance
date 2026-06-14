import { useEffect, useRef, useState } from "react";

import {
  captureEmbedding,
  detectPose,
  isFaceInsideCircle,
  isFaceSizeValid,
  loadMediaPipe,
} from "@/hooks/useFaceRegistration";
import { faceDescriptorDistance } from "@/lib/face-recognition";
import { formatIstTime, formatIstTimeWithSeconds } from "@/lib/time";

const MAX_MATCH_DISTANCE = 0.035;
const MIN_MATCH_MARGIN = 0.02;
const REQUIRED_MATCH_FRAMES = 5;
const SCAN_INTERVAL_MS = 500;
const SUCCESS_DISPLAY_MS = 3000;
const STAFF_COOLDOWN_MS = 60 * 1000;

function getErrorMessage(error) {
  if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
    return "Camera access is blocked";
  }

  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
    return "No front camera found";
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

function findBestMatch(embedding, staffFaces) {
  const matches = staffFaces
    .map((staff) => ({
      staff,
      distance: faceDescriptorDistance(embedding, staff.face_embedding),
    }))
    .filter((match) => Number.isFinite(match.distance))
    .sort((first, second) => first.distance - second.distance);
  const best = matches[0] || null;
  const second = matches[1] || null;

  if (!best || best.distance > MAX_MATCH_DISTANCE) {
    return null;
  }

  if (second && second.distance - best.distance < MIN_MATCH_MARGIN) {
    return null;
  }

  return best;
}

async function fetchRegisteredFaces() {
  const response = await fetch("/api/attendance/staff-faces");
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || "Unable to load registered staff");
  }

  return data.staff || [];
}

async function markAttendance(staffId, confidence) {
  const response = await fetch("/api/attendance/mark", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      staff_id: staffId,
      confidence,
    }),
  });
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || "Unable to mark attendance");
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

export default function AttendanceScannerPage() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const landmarkerRef = useRef(null);
  const staffFacesRef = useRef([]);
  const lastMarkedRef = useRef({});
  const matchCandidateRef = useRef({ staffId: "", frames: 0 });
  const isProcessingRef = useRef(false);
  const isSuccessVisibleRef = useRef(false);
  const isStartingRef = useRef(false);
  const isMountedRef = useRef(false);
  const successTimeoutRef = useRef(null);

  const [status, setStatus] = useState("Starting scanner...");
  const [subStatus, setSubStatus] = useState("Please wait");
  const [matchedStaff, setMatchedStaff] = useState(null);
  const [attendanceType, setAttendanceType] = useState("");
  const [recordedAt, setRecordedAt] = useState(null);
  const [currentTime, setCurrentTime] = useState(null);
  const [isSuccessVisible, setIsSuccessVisible] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [canRetry, setCanRetry] = useState(false);

  async function startScannerCamera() {
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      throw new Error("CAMERA_REQUIRES_HTTPS");
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("CAMERA_NOT_SUPPORTED");
    }

    let stream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
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

  async function startScanLoop() {
    if (isStartingRef.current) {
      return;
    }

    isStartingRef.current = true;
    setCanRetry(false);
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
      setStatus("Preparing face recognition...");
      setSubStatus("Keep this screen open");

      const [staffFaces, faceLandmarker] = await Promise.all([
        fetchRegisteredFaces(),
        loadMediaPipe(),
      ]);

      if (!isMountedRef.current) {
        return;
      }

      if (staffFaces.length === 0) {
        setStatus("No compatible faces found");
        setSubStatus("Re-register staff faces in the admin app");
        return;
      }

      staffFacesRef.current = staffFaces;
      landmarkerRef.current = faceLandmarker;
      setStatus("Scanning...");
      setSubStatus("Position your face inside the circle");

      intervalRef.current = window.setInterval(scanFrame, SCAN_INTERVAL_MS);
    } catch (error) {
      console.error("Attendance scanner startup failed:", error);
      setStatus(getErrorMessage(error));
      setSubStatus("Check camera permission, then retry");
      setCanRetry(true);
      setIsCameraReady(false);
    } finally {
      isStartingRef.current = false;
    }
  }

  function stopScanner() {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (successTimeoutRef.current) {
      window.clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }

    if (streamRef.current) {
      const stream = streamRef.current;
      streamRef.current = null;
      stream.getTracks().forEach((track) => track.stop());
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function showSuccess(staff, type, attendanceTime) {
    setMatchedStaff(staff);
    setAttendanceType(type);
    setRecordedAt(attendanceTime || null);
    isSuccessVisibleRef.current = true;
    setIsSuccessVisible(true);
    setStatus(staff.full_name);

    if (type === "check_in") {
      setSubStatus("Check-in marked");
    } else if (type === "check_out") {
      setSubStatus("Check-out marked");
    } else if (type === "ignored") {
      setSubStatus("Already checked in");
    } else {
      setSubStatus("Attendance already completed");
    }

    if (navigator.vibrate) {
      navigator.vibrate(120);
    }

    if (successTimeoutRef.current) {
      window.clearTimeout(successTimeoutRef.current);
    }

    successTimeoutRef.current = window.setTimeout(() => {
      setMatchedStaff(null);
      setAttendanceType("");
      setRecordedAt(null);
      isSuccessVisibleRef.current = false;
      setIsSuccessVisible(false);
      setStatus("Scanning...");
      setSubStatus("Position your face inside the circle");
    }, SUCCESS_DISPLAY_MS);
  }

  async function scanFrame() {
    const video = videoRef.current;
    const faceLandmarker = landmarkerRef.current;

    if (!video || !faceLandmarker || video.readyState < 2 || isProcessingRef.current) {
      return;
    }

    if (isSuccessVisibleRef.current) {
      return;
    }

    isProcessingRef.current = true;

    try {
      const results = faceLandmarker.detectForVideo(video, performance.now());
      const faces = results.faceLandmarks || [];

      if (faces.length === 0) {
        matchCandidateRef.current = { staffId: "", frames: 0 };
        setStatus("Scanning...");
        setSubStatus("No face detected");
        return;
      }

      if (faces.length > 1) {
        matchCandidateRef.current = { staffId: "", frames: 0 };
        setStatus("Multiple faces detected");
        setSubStatus("Only one person should be visible");
        return;
      }

      const face = faces[0];
      const sizeState = isFaceSizeValid(face);
      const pose = detectPose(face);

      if (!isFaceInsideCircle(face)) {
        matchCandidateRef.current = { staffId: "", frames: 0 };
        setStatus("Center your face");
        setSubStatus("Keep your full face inside the circle");
        return;
      }

      if (!sizeState.valid) {
        matchCandidateRef.current = { staffId: "", frames: 0 };
        setStatus(sizeState.message);
        setSubStatus("Keep your face inside the circle");
        return;
      }

      if (pose.status !== "CENTER") {
        matchCandidateRef.current = { staffId: "", frames: 0 };
        setStatus("Look straight");
        setSubStatus("Face the camera directly");
        return;
      }

      const embedding = captureEmbedding(face);
      const bestMatch = findBestMatch(embedding, staffFacesRef.current);

      if (!bestMatch) {
        matchCandidateRef.current = { staffId: "", frames: 0 };
        setStatus("Unknown face");
        setSubStatus("Please try again");
        return;
      }

      const previousCandidate = matchCandidateRef.current;
      const matchingFrames =
        previousCandidate.staffId === bestMatch.staff.id
          ? previousCandidate.frames + 1
          : 1;

      matchCandidateRef.current = {
        staffId: bestMatch.staff.id,
        frames: matchingFrames,
      };
      setStatus(bestMatch.staff.full_name);
      setSubStatus(
        matchingFrames >= REQUIRED_MATCH_FRAMES
          ? "Identity confirmed"
          : "Hold still for verification",
      );

      if (matchingFrames < REQUIRED_MATCH_FRAMES) {
        return;
      }

      matchCandidateRef.current = { staffId: "", frames: 0 };
      const lastMarkedAt = lastMarkedRef.current[bestMatch.staff.id] || 0;

      if (Date.now() - lastMarkedAt < STAFF_COOLDOWN_MS) {
        setStatus(bestMatch.staff.full_name);
        setSubStatus("Attendance recently marked");
        return;
      }

      lastMarkedRef.current[bestMatch.staff.id] = Date.now();

      const confidence = Math.max(0, Math.min(1, 1 - bestMatch.distance));
      const result = await markAttendance(bestMatch.staff.id, confidence);
      showSuccess(
        result.staff || bestMatch.staff,
        result.type,
        result.recorded_at ||
          result.attendance?.check_out ||
          result.attendance?.check_in,
      );
    } catch (error) {
      setStatus("Scanner error");
      setSubStatus(getErrorMessage(error));
    } finally {
      isProcessingRef.current = false;
    }
  }

  useEffect(() => {
    isMountedRef.current = true;
    const clockTimer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    const startupTimer = window.setTimeout(() => {
      startScanLoop();
    }, 0);
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        streamRef.current &&
        streamRef.current.getVideoTracks().every((track) => track.readyState === "ended")
      ) {
        startScanLoop();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      window.clearTimeout(startupTimer);
      window.clearInterval(clockTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopScanner();
    };
    // Scanner should start once when this public page mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-black text-white">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={[
          "pointer-events-none h-[100dvh] w-screen scale-x-[-1] object-cover transition-opacity duration-300",
          isCameraReady ? "opacity-100" : "opacity-20",
        ].join(" ")}
      />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,transparent_150px,rgba(0,0,0,0.70)_151px,rgba(0,0,0,0.92)_100%)]" />

      <section className="absolute inset-0 flex flex-col items-center justify-center px-6">
        <div className="relative flex h-[300px] w-[300px] items-center justify-center">
          <div className="absolute h-[300px] w-[300px] animate-ping rounded-full border-4 border-[#43A047]/45" />
          <div className="absolute h-[300px] w-[300px] animate-pulse rounded-full border-4 border-[#43A047] shadow-[0_0_50px_rgba(67,160,71,0.8)]" />
          <div className="absolute h-[268px] w-[268px] rounded-full border border-white/60" />

          {isSuccessVisible ? (
            <div className="absolute flex h-28 w-28 items-center justify-center rounded-full bg-[#43A047] text-6xl font-black text-white shadow-2xl">
              ✓
            </div>
          ) : null}
        </div>
      </section>

      <header
        className="absolute inset-x-0 top-0 px-6 text-center"
        style={{ paddingTop: "calc(2rem + env(safe-area-inset-top))" }}
      >
        <p className="text-sm font-semibold uppercase tracking-[4px] text-white/70">
          Smart Attendance
        </p>
        <h1 className="mt-2 text-2xl font-bold">{status}</h1>
        <p className="mt-2 font-mono text-sm font-semibold text-white/75">
          {formatIstTimeWithSeconds(currentTime)} IST
        </p>
      </header>

      <footer
        className="absolute inset-x-0 bottom-0 px-6 text-center"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
      >
        {matchedStaff ? (
          <div className="mx-auto mb-5 max-w-sm rounded-3xl bg-white px-5 py-4 text-slate-950 shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-[3px] text-[#43A047]">
              {attendanceType.replaceAll("_", " ")}
            </p>
            <h2 className="mt-1 text-2xl font-black">{matchedStaff.full_name}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {matchedStaff.teacher_id} • {matchedStaff.subject}
            </p>
            {recordedAt ? (
              <p className="mt-3 text-lg font-black text-slate-900">
                {formatIstTime(recordedAt)} IST
              </p>
            ) : null}
          </div>
        ) : null}

        <p className="text-xl font-bold drop-shadow">{subStatus}</p>
        {canRetry ? (
          <button
            type="button"
            onClick={startScanLoop}
            className="pointer-events-auto mt-5 min-h-14 rounded-2xl bg-[#43A047] px-8 text-base font-black text-white shadow-2xl active:scale-95"
          >
            Retry Camera
          </button>
        ) : null}
      </footer>
    </main>
  );
}

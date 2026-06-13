import { useEffect, useRef, useState } from "react";

import { captureEmbedding, loadMediaPipe } from "@/hooks/useFaceRegistration";

const MATCH_THRESHOLD = 0.82;
const SCAN_INTERVAL_MS = 1500;
const SUCCESS_DISPLAY_MS = 3000;
const STAFF_COOLDOWN_MS = 60 * 1000;

function getErrorMessage(error) {
  if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
    return "Camera permission denied";
  }

  return error?.message || "Something went wrong";
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    magnitudeA += a[index] * a[index];
    magnitudeB += b[index] * b[index];
  }

  if (!magnitudeA || !magnitudeB) {
    return 0;
  }

  return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

function findBestMatch(embedding, staffFaces) {
  return staffFaces.reduce(
    (best, staff) => {
      const similarity = cosineSimilarity(embedding, staff.face_embedding);

      if (similarity > best.similarity) {
        return { staff, similarity };
      }

      return best;
    },
    { staff: null, similarity: 0 },
  );
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

export default function AttendanceScannerPage() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const landmarkerRef = useRef(null);
  const staffFacesRef = useRef([]);
  const lastMarkedRef = useRef({});
  const isProcessingRef = useRef(false);
  const successTimeoutRef = useRef(null);

  const [status, setStatus] = useState("Loading scanner...");
  const [subStatus, setSubStatus] = useState("Please wait");
  const [matchedStaff, setMatchedStaff] = useState(null);
  const [attendanceType, setAttendanceType] = useState("");
  const [isSuccessVisible, setIsSuccessVisible] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);

  async function startScannerCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    streamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }

    setIsCameraReady(true);
  }

  async function startScanLoop() {
    try {
      setStatus("Loading registered faces...");
      const staffFaces = await fetchRegisteredFaces();

      if (staffFaces.length === 0) {
        setStatus("No registered staff found");
        setSubStatus("Enroll teacher faces first");
        return;
      }

      staffFacesRef.current = staffFaces;
      setStatus("Starting camera...");
      landmarkerRef.current = await loadMediaPipe();
      await startScannerCamera();
      setStatus("Scanning...");
      setSubStatus("Position your face inside the circle");

      intervalRef.current = window.setInterval(scanFrame, SCAN_INTERVAL_MS);
    } catch (error) {
      setStatus(getErrorMessage(error));
      setSubStatus("Unable to start attendance scanner");
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
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  function showSuccess(staff, type) {
    setMatchedStaff(staff);
    setAttendanceType(type);
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

    if (isSuccessVisible) {
      return;
    }

    isProcessingRef.current = true;

    try {
      const results = faceLandmarker.detectForVideo(video, performance.now());
      const faces = results.faceLandmarks || [];

      if (faces.length === 0) {
        setStatus("Scanning...");
        setSubStatus("No face detected");
        return;
      }

      if (faces.length > 1) {
        setStatus("Multiple faces detected");
        setSubStatus("Only one person should be visible");
        return;
      }

      setStatus("Face detected");
      setSubStatus("Verifying...");

      const embedding = captureEmbedding(faces[0]);
      const bestMatch = findBestMatch(embedding, staffFacesRef.current);

      if (!bestMatch.staff || bestMatch.similarity < MATCH_THRESHOLD) {
        setStatus("Unknown face");
        setSubStatus("Please try again");
        return;
      }

      const lastMarkedAt = lastMarkedRef.current[bestMatch.staff.id] || 0;

      if (Date.now() - lastMarkedAt < STAFF_COOLDOWN_MS) {
        setStatus(bestMatch.staff.full_name);
        setSubStatus("Attendance recently marked");
        return;
      }

      lastMarkedRef.current[bestMatch.staff.id] = Date.now();

      const result = await markAttendance(bestMatch.staff.id, bestMatch.similarity);
      showSuccess(result.staff || bestMatch.staff, result.type);
    } catch (error) {
      setStatus("Scanner error");
      setSubStatus(getErrorMessage(error));
    } finally {
      isProcessingRef.current = false;
    }
  }

  useEffect(() => {
    const startupTimer = window.setTimeout(() => {
      startScanLoop();
    }, 0);

    return () => {
      window.clearTimeout(startupTimer);
      stopScanner();
    };
    // Scanner should start once when this public page mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="fixed inset-0 h-screen w-screen overflow-hidden bg-black text-white">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={[
          "h-screen w-screen scale-x-[-1] object-cover transition-opacity duration-300",
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
          </div>
        ) : null}

        <p className="text-xl font-bold drop-shadow">{subStatus}</p>
      </footer>
    </main>
  );
}

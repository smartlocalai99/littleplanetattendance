import { useEffect, useRef, useState } from "react";

import { createFaceDescriptor } from "@/lib/face-recognition";

const MEDIAPIPE_WASM_URL = "/mediapipe";
const FACE_LANDMARKER_MODEL_URL = "/mediapipe/face_landmarker.task";

export const FACE_POSE_STEPS = [
  { key: "CENTER", label: "Look Straight" },
  { key: "LEFT", label: "Turn Left" },
  { key: "RIGHT", label: "Turn Right" },
];

let mediaPipeInstance = null;

export async function loadMediaPipe() {
  if (mediaPipeInstance) {
    return mediaPipeInstance;
  }

  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);

  mediaPipeInstance = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: FACE_LANDMARKER_MODEL_URL,
      delegate: "CPU",
    },
    numFaces: 2,
    runningMode: "VIDEO",
  });

  return mediaPipeInstance;
}

export function captureEmbedding(landmarks) {
  return createFaceDescriptor(landmarks);
}

function getNextRequiredPose(captures) {
  return FACE_POSE_STEPS.find((step) => !captures[step.key])?.key || "COMPLETE";
}

function getFaceBounds(landmarks) {
  const xs = landmarks.map((point) => point.x);
  const ys = landmarks.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export function detectPose(landmarks) {
  const nose = landmarks[1];
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];

  if (!nose || !leftEye || !rightEye) {
    return { status: "ADJUST", instruction: "Position your face inside the circle" };
  }

  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeDistance = Math.max(0.001, Math.abs(rightEye.x - leftEye.x));
  const yaw = ((nose.x - eyeMidX) / eyeDistance) * 100;

  if (yaw < -15) {
    return { status: "LEFT", instruction: "Hold left", yaw };
  }

  if (yaw > 15) {
    return { status: "RIGHT", instruction: "Hold right", yaw };
  }

  if (yaw >= -10 && yaw <= 10) {
    return { status: "CENTER", instruction: "Hold straight", yaw };
  }

  return { status: "ADJUST", instruction: "Turn your head slowly", yaw };
}

export function isFaceDetected(faces) {
  return faces.length > 0;
}

export function isSingleFace(faces) {
  return faces.length === 1;
}

export function isFaceInsideCircle(landmarks) {
  const bounds = getFaceBounds(landmarks);
  const circleCenterX = 0.5;
  const circleCenterY = 0.5;
  const circleRadius = 0.32;
  const pointsToCheck = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.minX, y: bounds.maxY },
    { x: bounds.maxX, y: bounds.maxY },
    landmarks[1],
    landmarks[152],
  ].filter(Boolean);

  return pointsToCheck.every((point) => {
    const distance = Math.hypot(point.x - circleCenterX, point.y - circleCenterY);
    return distance <= circleRadius;
  });
}

export function isFaceSizeValid(landmarks) {
  const bounds = getFaceBounds(landmarks);
  const faceWidth = bounds.maxX - bounds.minX;
  const faceHeight = bounds.maxY - bounds.minY;
  const faceSize = Math.max(faceWidth, faceHeight);

  if (faceSize < 0.24) {
    return { valid: false, message: "Move closer" };
  }

  if (faceSize > 0.58) {
    return { valid: false, message: "Move back" };
  }

  return { valid: true, message: "" };
}

function getPoseInstruction(requiredPose) {
  return FACE_POSE_STEPS.find((step) => step.key === requiredPose)?.label ||
    "Position your face inside the circle";
}

export function canCapturePose({ faces, requiredPose }) {
  if (!isFaceDetected(faces)) {
    return {
      canCapture: false,
      face: null,
      instruction: "Position your face inside the circle",
    };
  }

  if (!isSingleFace(faces)) {
    return {
      canCapture: false,
      face: null,
      instruction: "Only one person should be visible",
    };
  }

  const face = faces[0];

  if (!isFaceInsideCircle(face)) {
    return {
      canCapture: false,
      face,
      instruction: "Center your face inside the circle",
    };
  }

  const sizeValid = isFaceSizeValid(face);

  if (!sizeValid.valid) {
    return {
      canCapture: false,
      face,
      instruction: sizeValid.message,
    };
  }

  const pose = detectPose(face);

  if (pose.status !== requiredPose) {
    return {
      canCapture: false,
      face,
      instruction: getPoseInstruction(requiredPose),
    };
  }

  return {
    canCapture: true,
    face,
    instruction: "Hold still...",
  };
}

function isPermissionDenied(error) {
  return error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError";
}

export function useFaceRegistration({ onComplete, onPermissionDenied, onError } = {}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const animationRef = useRef(null);
  const landmarkerRef = useRef(null);
  const processingRef = useRef(false);
  const capturesRef = useRef({});
  const stableStartTimeRef = useRef(null);

  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isLoadingMediaPipe, setIsLoadingMediaPipe] = useState(false);
  const [instruction, setInstruction] = useState("Position your face inside the circle");
  const [helperText, setHelperText] = useState("Turn your head slowly");
  const [captures, setCaptures] = useState({});
  const [faceEmbedding, setFaceEmbedding] = useState(null);
  const [capturedPose, setCapturedPose] = useState("");

  const currentPose = getNextRequiredPose(captures);
  const isComplete = FACE_POSE_STEPS.every((step) => Boolean(captures[step.key])) && faceEmbedding;

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        window.cancelAnimationFrame(animationRef.current);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  function stopScanner() {
    if (animationRef.current) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    processingRef.current = false;
  }

  function stopCamera({ keepOverlay = false } = {}) {
    stopScanner();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsCameraOpen(false);

    if (!keepOverlay) {
      setIsOverlayOpen(false);
    }
  }

  function scheduleScan() {
    animationRef.current = window.requestAnimationFrame(scanFace);
  }

  function startScanner() {
    stopScanner();
    scheduleScan();
  }

  async function startCamera() {
    setIsOverlayOpen(true);
    setIsLoadingMediaPipe(true);
    setInstruction("Position your face inside the circle");
    setHelperText("Preparing Face ID enrollment");

    try {
      const faceLandmarker = await loadMediaPipe();
      landmarkerRef.current = faceLandmarker;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setIsCameraOpen(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setInstruction("Position your face inside the circle");
      setHelperText("Turn your head slowly");
      startScanner();
    } catch (error) {
      stopCamera();

      if (isPermissionDenied(error)) {
        onPermissionDenied?.(error);
      } else {
        onError?.(error);
      }
    } finally {
      setIsLoadingMediaPipe(false);
    }
  }

  function captureCurrentPose(requiredPose, landmarks) {
    if (navigator.vibrate) {
      navigator.vibrate(100);
    }

    const nextCaptures = {
      ...capturesRef.current,
      [requiredPose]: landmarks,
    };

    capturesRef.current = nextCaptures;
    setCaptures(nextCaptures);
    setCapturedPose(requiredPose);
    window.setTimeout(() => setCapturedPose(""), 700);

    const nextRequiredPose = getNextRequiredPose(nextCaptures);

    if (nextRequiredPose === "COMPLETE") {
      // Side poses provide liveness; the centered pose is the stable identity descriptor.
      const faceDescriptor = captureEmbedding(nextCaptures.CENTER);

      if (!faceDescriptor) {
        setInstruction("Face capture failed");
        setHelperText("Please register the face again");
        resetFaceRegistration();
        return;
      }

      setFaceEmbedding(faceDescriptor);
      setInstruction("Face Registration Complete");
      setHelperText("Ready to save teacher");
      stopCamera({ keepOverlay: true });
      window.setTimeout(() => {
        setIsOverlayOpen(false);
        onComplete?.(faceDescriptor);
      }, 850);
      return;
    }

    const nextStep = FACE_POSE_STEPS.find((step) => step.key === nextRequiredPose);
    setInstruction(nextStep?.label || "Position your face inside the circle");
    setHelperText("Turn your head slowly");
  }

  function scanFace(frameTime) {
    const video = videoRef.current;
    const faceLandmarker = landmarkerRef.current;

    if (!video || !faceLandmarker || getNextRequiredPose(capturesRef.current) === "COMPLETE") {
      return;
    }

    if (video.readyState < 2 || processingRef.current) {
      scheduleScan();
      return;
    }

    processingRef.current = true;

    try {
      const result = faceLandmarker.detectForVideo(video, frameTime);
      const faces = result.faceLandmarks || [];
      const requiredPose = getNextRequiredPose(capturesRef.current);
      const captureState = canCapturePose({ faces, requiredPose });

      if (!captureState.canCapture) {
        stableStartTimeRef.current = null;
        setInstruction(captureState.instruction);
        setHelperText("Turn your head slowly");
        return;
      }

      setInstruction("Hold still...");
      setHelperText("Keep your face inside the circle");

      if (stableStartTimeRef.current === null) {
        stableStartTimeRef.current = frameTime;
        return;
      }

      if (frameTime - stableStartTimeRef.current >= 800) {
        stableStartTimeRef.current = null;
        captureCurrentPose(requiredPose, captureState.face);
      }
    } catch (error) {
      setInstruction(error?.message || "Unable to scan face");
      setHelperText("Please try again");
    } finally {
      processingRef.current = false;

      if (getNextRequiredPose(capturesRef.current) !== "COMPLETE") {
        scheduleScan();
      }
    }
  }

  function resetFaceRegistration() {
    stopCamera();
    capturesRef.current = {};
    stableStartTimeRef.current = null;
    setCaptures({});
    setFaceEmbedding(null);
    setCapturedPose("");
    setInstruction("Position your face inside the circle");
    setHelperText("Turn your head slowly");
  }

  return {
    videoRef,
    steps: FACE_POSE_STEPS,
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
  };
}

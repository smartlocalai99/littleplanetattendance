export const FACE_EMBEDDING_VERSION = 2;

const LEFT_EYE_INDEX = 33;
const RIGHT_EYE_INDEX = 263;
const MIN_LANDMARK_COUNT = 468;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function createFaceDescriptor(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length < MIN_LANDMARK_COUNT) {
    return null;
  }

  const leftEye = landmarks[LEFT_EYE_INDEX];
  const rightEye = landmarks[RIGHT_EYE_INDEX];

  if (
    !leftEye ||
    !rightEye ||
    !isFiniteNumber(leftEye.x) ||
    !isFiniteNumber(leftEye.y) ||
    !isFiniteNumber(rightEye.x) ||
    !isFiniteNumber(rightEye.y)
  ) {
    return null;
  }

  const centerX = (leftEye.x + rightEye.x) / 2;
  const centerY = (leftEye.y + rightEye.y) / 2;
  const deltaX = rightEye.x - leftEye.x;
  const deltaY = rightEye.y - leftEye.y;
  const eyeDistance = Math.hypot(deltaX, deltaY);

  if (eyeDistance < 0.01) {
    return null;
  }

  const angle = Math.atan2(deltaY, deltaX);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const vector = [];

  for (const point of landmarks) {
    if (!isFiniteNumber(point.x) || !isFiniteNumber(point.y)) {
      return null;
    }

    const x = point.x - centerX;
    const y = point.y - centerY;
    const rotatedX = (x * cos - y * sin) / eyeDistance;
    const rotatedY = (x * sin + y * cos) / eyeDistance;
    const normalizedZ = (isFiniteNumber(point.z) ? point.z : 0) / eyeDistance;

    vector.push(
      Number(rotatedX.toFixed(6)),
      Number(rotatedY.toFixed(6)),
      Number(normalizedZ.toFixed(6)),
    );
  }

  return {
    version: FACE_EMBEDDING_VERSION,
    vector,
  };
}

export function convertLegacyFaceEmbedding(value) {
  if (
    !Array.isArray(value) ||
    value.length < MIN_LANDMARK_COUNT * 3 ||
    value.length % 3 !== 0 ||
    value.some((item) => !isFiniteNumber(item))
  ) {
    return null;
  }

  const landmarks = [];

  for (let index = 0; index < value.length; index += 3) {
    landmarks.push({
      x: value[index],
      y: value[index + 1],
      z: value[index + 2],
    });
  }

  return createFaceDescriptor(landmarks);
}

export function normalizeStoredFaceDescriptor(value) {
  if (
    !value ||
    value.version !== FACE_EMBEDDING_VERSION ||
    !Array.isArray(value.vector) ||
    value.vector.length < MIN_LANDMARK_COUNT * 3 ||
    value.vector.some((item) => !isFiniteNumber(item))
  ) {
    return null;
  }

  return value;
}

export function normalizeAnyFaceDescriptor(value) {
  return normalizeStoredFaceDescriptor(value) || convertLegacyFaceEmbedding(value);
}

export function faceDescriptorDistance(first, second) {
  const descriptorA = normalizeStoredFaceDescriptor(first);
  const descriptorB = normalizeStoredFaceDescriptor(second);

  if (
    !descriptorA ||
    !descriptorB ||
    descriptorA.vector.length !== descriptorB.vector.length
  ) {
    return Number.POSITIVE_INFINITY;
  }

  let squaredDifference = 0;

  for (let index = 0; index < descriptorA.vector.length; index += 1) {
    const difference = descriptorA.vector[index] - descriptorB.vector[index];
    squaredDifference += difference * difference;
  }

  return Math.sqrt(squaredDifference / descriptorA.vector.length);
}

import { differenceInMinutes, isValid, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const APP_TIME_ZONE = "Asia/Kolkata";
export const LATE_AFTER = "09:30";
export const EARLY_BEFORE = "16:30";

function toDate(value) {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "number") {
    return new Date(value);
  }

  if (typeof value === "string") {
    return parseISO(value);
  }

  return new Date(Number.NaN);
}

export function getCurrentUtcDate() {
  return new Date();
}

export function getCurrentUtcIso() {
  return getCurrentUtcDate().toISOString();
}

export function getIstDateKey(value = getCurrentUtcDate()) {
  const date = toDate(value);
  return isValid(date)
    ? formatInTimeZone(date, APP_TIME_ZONE, "yyyy-MM-dd")
    : "";
}

export function getIstDayBounds(value = getCurrentUtcDate()) {
  const dateKey = getIstDateKey(value);

  if (!dateKey) {
    return null;
  }

  return {
    start: fromZonedTime(`${dateKey} 00:00:00`, APP_TIME_ZONE),
    end: fromZonedTime(`${dateKey} 23:59:59.999`, APP_TIME_ZONE),
  };
}

export function formatIstTime(value, fallback = "--") {
  const date = toDate(value);
  return isValid(date)
    ? formatInTimeZone(date, APP_TIME_ZONE, "h:mm a")
    : fallback;
}

export function formatIstTimeWithSeconds(value, fallback = "--") {
  const date = toDate(value);
  return isValid(date)
    ? formatInTimeZone(date, APP_TIME_ZONE, "h:mm:ss a")
    : fallback;
}

export function formatIstDate(value, fallback = "--") {
  const date = toDate(value);
  return isValid(date)
    ? formatInTimeZone(date, APP_TIME_ZONE, "d MMM yyyy")
    : fallback;
}

export function formatIstDateTime(value, fallback = "--") {
  const date = toDate(value);
  return isValid(date)
    ? formatInTimeZone(date, APP_TIME_ZONE, "d MMM yyyy, h:mm a")
    : fallback;
}

export function calculateDurationMinutes(checkIn, checkOut = getCurrentUtcDate()) {
  const start = toDate(checkIn);
  const end = toDate(checkOut);

  if (!isValid(start) || !isValid(end) || end < start) {
    return null;
  }

  return differenceInMinutes(end, start);
}

export function formatDuration(checkIn, checkOut, fallback = "--") {
  const totalMinutes = calculateDurationMinutes(checkIn, checkOut);

  if (totalMinutes === null) {
    return fallback;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

export function serializeTimestamp(value) {
  if (!value) {
    return null;
  }

  const date = toDate(value);
  return isValid(date) ? date.toISOString() : null;
}

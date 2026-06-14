import { Component } from "react";

const RECOVERY_KEY = "smart-attendance-client-recovery";

function isStaleBuildError(error) {
  const message = String(error?.message || error || "").toLowerCase();

  return [
    "chunkloaderror",
    "loading chunk",
    "failed to fetch dynamically imported module",
    "importing a module script failed",
    "unexpected token '<'",
  ].some((pattern) => message.includes(pattern));
}

async function clearAppCaches() {
  if ("caches" in window) {
    const cacheKeys = await window.caches.keys();
    await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
  }

  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
  }
}

export async function recoverFromStaleBuild(error) {
  if (!isStaleBuildError(error)) {
    return false;
  }

  let alreadyRecovered = false;

  try {
    alreadyRecovered = window.sessionStorage.getItem(RECOVERY_KEY) === "true";
  } catch {
    // Storage can be unavailable in private or restricted browser modes.
  }

  if (alreadyRecovered) {
    return false;
  }

  try {
    window.sessionStorage.setItem(RECOVERY_KEY, "true");
  } catch {
    // Continue with cache recovery even when storage is unavailable.
  }

  await clearAppCaches();
  window.location.reload();
  return true;
}

export class AppErrorBoundary extends Component {
  state = {
    error: null,
  };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Client render failed:", error, info);
    recoverFromStaleBuild(error);
  }

  async handleReload() {
    await clearAppCaches();
    window.location.reload();
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#f4f7f5] p-6 text-slate-950">
        <section className="w-full max-w-sm rounded-[2rem] bg-white p-7 text-center shadow-xl ring-1 ring-slate-200">
          <h1 className="text-2xl font-black">App update needed</h1>
          <p className="mt-3 text-sm font-medium leading-6 text-slate-500">
            A new version is available. Refresh once to continue safely.
          </p>
          <button
            type="button"
            onClick={() => this.handleReload()}
            className="mt-6 min-h-14 w-full rounded-2xl bg-emerald-600 font-black text-white"
          >
            Refresh App
          </button>
        </section>
      </main>
    );
  }
}

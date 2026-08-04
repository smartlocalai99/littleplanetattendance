import { useEffect, useState } from "react";

// Module-level store (not React state) so the `beforeinstallprompt` event -
// which the browser fires once, early, and only if a listener already exists
// at the time - is captured regardless of which page/component happens to be
// mounted. registerPwaInstallListeners() is called once from PwaRegister.jsx,
// which is always mounted in _app.js; usePwaInstallState() lets any page
// subscribe to the result.
let deferredPrompt = null;
let isStandalone = false;
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener());
}

export function detectStandaloneDisplayMode() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    window.navigator?.standalone === true
  );
}

export function registerPwaInstallListeners() {
  if (typeof window === "undefined") {
    return () => {};
  }

  isStandalone = detectStandaloneDisplayMode();

  function handleBeforeInstallPrompt(event) {
    event.preventDefault();
    deferredPrompt = event;
    notify();
  }

  function handleAppInstalled() {
    isStandalone = true;
    deferredPrompt = null;
    notify();
  }

  window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  window.addEventListener("appinstalled", handleAppInstalled);

  return () => {
    window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.removeEventListener("appinstalled", handleAppInstalled);
  };
}

function getSnapshot() {
  return { canPrompt: Boolean(deferredPrompt), isInstalled: isStandalone };
}

// canPrompt/isInstalled depend entirely on browser events unavailable during
// SSR, so components read a safe "installed" default on first render and
// pick up the real value after mount - same pattern used for the tutorial
// seen-flags, avoiding a hydration mismatch.
export function usePwaInstallState() {
  const [state, setState] = useState({ canPrompt: false, isInstalled: true });

  useEffect(() => {
    function handleChange() {
      setState(getSnapshot());
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(getSnapshot());
    listeners.add(handleChange);

    return () => {
      listeners.delete(handleChange);
    };
  }, []);

  return state;
}

export async function triggerPwaInstallPrompt() {
  if (!deferredPrompt) {
    return { outcome: "unsupported" };
  }

  const promptEvent = deferredPrompt;
  deferredPrompt = null;
  notify();

  promptEvent.prompt();
  return promptEvent.userChoice;
}

export function getManualInstallInstructions() {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;

  if (/iPad|iPhone|iPod/.test(userAgent)) {
    return 'Tap the Share icon in your browser, then choose "Add to Home Screen".';
  }

  if (/Android/.test(userAgent)) {
    return 'Open your browser menu and choose "Install app" or "Add to Home screen".';
  }

  return 'Open your browser menu and look for "Install" or "Add to Home screen".';
}

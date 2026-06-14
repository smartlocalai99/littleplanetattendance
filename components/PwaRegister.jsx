import { useEffect } from "react";

import { recoverFromStaleBuild } from "@/components/AppErrorBoundary";

export default function PwaRegister() {
  useEffect(() => {
    let refreshing = false;
    const recoveryResetTimer = window.setTimeout(() => {
      try {
        window.sessionStorage.removeItem("smart-attendance-client-recovery");
      } catch {
        // Storage can be unavailable in private or restricted browser modes.
      }
    }, 10000);

    async function register() {
      if (!("serviceWorker" in navigator)) {
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        await registration.update();
      } catch (error) {
        console.error("Service worker registration failed:", error);
      }
    }

    function handleControllerChange() {
      if (refreshing) {
        return;
      }

      refreshing = true;
      window.location.reload();
    }

    function handleWindowError(event) {
      recoverFromStaleBuild(event.error || event.message);
    }

    function handleUnhandledRejection(event) {
      recoverFromStaleBuild(event.reason);
    }

    navigator.serviceWorker?.addEventListener(
      "controllerchange",
      handleControllerChange,
    );
    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      window.clearTimeout(recoveryResetTimer);
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
      window.removeEventListener("load", register);
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}

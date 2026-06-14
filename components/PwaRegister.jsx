import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    const recoveryResetTimer = window.setTimeout(() => {
      try {
        window.sessionStorage.removeItem("smart-attendance-recovery-at");

        const url = new URL(window.location.href);
        if (url.searchParams.has("__app_refresh")) {
          url.searchParams.delete("__app_refresh");
          window.history.replaceState({}, "", url);
        }
      } catch {
        // Storage and history can be restricted in private browser modes.
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

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      window.clearTimeout(recoveryResetTimer);
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
}

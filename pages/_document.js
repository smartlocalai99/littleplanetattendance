import { Html, Head, Main, NextScript } from "next/document";
import Script from "next/script";

const recoveryScript = `
(function () {
  var RECOVERY_KEY = "smart-attendance-recovery-at";
  var RECOVERY_WINDOW_MS = 30000;

  function errorMessage(error) {
    return String(
      (error && (error.message || error.reason)) ||
      error ||
      ""
    ).toLowerCase();
  }

  function isStaleClientError(error) {
    var message = errorMessage(error);
    return (
      message.indexOf("chunkloaderror") !== -1 ||
      message.indexOf("loading chunk") !== -1 ||
      message.indexOf("failed to load chunk") !== -1 ||
      message.indexOf("dynamically imported module") !== -1 ||
      message.indexOf("module script") !== -1
    );
  }

  async function recover(error) {
    var lastRecovery = 0;

    try {
      lastRecovery = Number(sessionStorage.getItem(RECOVERY_KEY) || 0);
    } catch (_) {}

    if (Date.now() - lastRecovery < RECOVERY_WINDOW_MS) {
      return false;
    }

    try {
      sessionStorage.setItem(RECOVERY_KEY, String(Date.now()));
    } catch (_) {}

    try {
      if ("caches" in window) {
        var cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(function (name) {
          return caches.delete(name);
        }));
      }

      if ("serviceWorker" in navigator) {
        var registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(function (registration) {
          return registration.update();
        }));
      }
    } catch (_) {
      // A hard navigation still refreshes Next.js assets if cache APIs fail.
    }

    var url = new URL(window.location.href);
    url.searchParams.set("__app_refresh", String(Date.now()));
    window.location.replace(url.toString());
    return true;
  }

  window.__recoverSmartAttendance = recover;

  window.addEventListener("error", function (event) {
    var failedScript =
      event.target &&
      event.target.tagName === "SCRIPT" &&
      String(event.target.src || "").indexOf("/_next/static/") !== -1;

    if (failedScript || isStaleClientError(event.error || event.message)) {
      recover(event.error || event.message);
    }
  }, true);

  window.addEventListener("unhandledrejection", function (event) {
    if (isStaleClientError(event.reason)) {
      recover(event.reason);
    }
  });
})();
`;

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
        <Script
          id="smart-attendance-recovery"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: recoveryScript }}
        />
      </body>
    </Html>
  );
}

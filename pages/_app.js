import Head from "next/head";
import { useRouter } from "next/router";

import PwaRegister from "@/components/PwaRegister";
import "@/styles/globals.css";

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const isAttendanceApp = router.pathname === "/attendance";
  const appName = isAttendanceApp ? "Smart Attendance" : "Smart Attendance AI";
  const manifestHref = isAttendanceApp
    ? "/manifest-attendance.webmanifest"
    : "/manifest.webmanifest";
  const themeColor = isAttendanceApp ? "#000000" : "#047857";

  return (
    <>
      <Head>
        <title>{appName}</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
          key="viewport"
        />
        <meta
          name="description"
          content="Face-recognition attendance check-in and administration."
        />
        <meta name="theme-color" content={themeColor} key="theme-color" />
        <meta name="application-name" content={appName} key="application-name" />
        <meta
          name="apple-mobile-web-app-title"
          content={appName}
          key="apple-mobile-web-app-title"
        />
        <link rel="manifest" href={manifestHref} key="manifest" />
      </Head>
      <Component {...pageProps} />
      <PwaRegister />
    </>
  );
}

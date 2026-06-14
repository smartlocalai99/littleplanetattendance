import Head from "next/head";

import PwaRegister from "@/components/PwaRegister";
import "@/styles/globals.css";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Smart Attendance AI</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
          key="viewport"
        />
        <meta
          name="description"
          content="Face-recognition attendance check-in and administration."
        />
      </Head>
      <Component {...pageProps} />
      <PwaRegister />
    </>
  );
}

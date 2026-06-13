import { useRouter } from "next/router";

import BottomNavigation from "@/components/BottomNavigation";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session";

export async function getServerSideProps({ req }) {
  const admin = await verifyAdminSessionToken(req.cookies?.[ADMIN_SESSION_COOKIE]);

  if (!admin) {
    return {
      redirect: {
        destination: "/admin/login",
        permanent: false,
      },
    };
  }

  return {
    props: {
      admin,
    },
  };
}

export default function AdminDashboardPage({ admin }) {
  const router = useRouter();

  async function handleLogout() {
    window.localStorage.removeItem("admin");

    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      router.replace("/admin/login");
    }
  }

 return (
  <main className="min-h-screen bg-[#f3f8f4] text-[#111827]">
    {/* Header */}
    <header className="bg-[#43A047] px-6 py-5 text-white shadow-lg">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[4px] text-green-100">
            Admin Portal
          </p>

          <h1 className="mt-1 text-2xl font-bold">
            Dashboard
          </h1>

          <p className="mt-1 text-sm text-green-100">
            Signed in as {admin.name}
          </p>
        </div>

        <button
          className="rounded-2xl bg-white/20 px-5 py-3 font-semibold text-white backdrop-blur transition hover:bg-white/30"
          onClick={handleLogout}
          type="button"
        >
          Logout
        </button>
      </div>
    </header>

    <div className="mx-auto max-w-7xl p-6 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-3xl bg-gradient-to-br from-green-500 to-green-600 p-6 text-white shadow-lg">
          <p className="text-sm text-white/80">
            Total Teachers
          </p>
          <h2 className="mt-3 text-4xl font-bold">
            20
          </h2>
        </div>

        <div className="rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 text-white shadow-lg">
          <p className="text-sm text-white/80">
            Present Today
          </p>
          <h2 className="mt-3 text-4xl font-bold">
            16
          </h2>
        </div>

        <div className="rounded-3xl bg-gradient-to-br from-red-500 to-red-600 p-6 text-white shadow-lg">
          <p className="text-sm text-white/80">
            Absent Today
          </p>
          <h2 className="mt-3 text-4xl font-bold">
            4
          </h2>
        </div>

        <div className="rounded-3xl bg-gradient-to-br from-blue-500 to-blue-600 p-6 text-white shadow-lg">
          <p className="text-sm text-white/80">
            Attendance %
          </p>
          <h2 className="mt-3 text-4xl font-bold">
            80%
          </h2>
        </div>
      </div>

      {/* Graphs */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl bg-white p-6 shadow-lg">
          <h3 className="mb-6 text-lg font-semibold text-slate-900">
            Weekly Attendance
          </h3>

          <div className="flex h-52 items-end justify-between gap-3">
            {[55, 80, 65, 90, 70, 95, 75].map(
              (height, index) => (
                <div
                  key={index}
                  className="flex flex-1 flex-col items-center"
                >
                  <div
                    className="w-full rounded-t-xl bg-[#43A047]"
                    style={{
                      height: `${height}%`,
                    }}
                  />
                </div>
              )
            )}
          </div>

          <div className="mt-4 grid grid-cols-7 text-center text-xs text-slate-500">
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
            <span>Sun</span>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-lg">
          <h3 className="mb-6 text-lg font-semibold text-slate-900">
          Today&apos;s Attendance Summary
          </h3>

          <div className="flex justify-center">
            <div className="relative flex h-48 w-48 items-center justify-center rounded-full border-[20px] border-[#43A047]">
              <div className="text-center">
                <h2 className="text-4xl font-bold text-slate-900">
                  80%
                </h2>

                <p className="text-sm text-slate-500">
                  Present
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

   
    </div>

    <BottomNavigation />
  </main>
);
}

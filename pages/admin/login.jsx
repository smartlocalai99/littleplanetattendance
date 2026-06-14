import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Image from "next/image";
export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    if (!toastMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setToastMessage(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsLoading(true);
    setToastMessage("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setToastMessage(data.message || "Login failed");
        return;
      }

      window.localStorage.setItem("admin", JSON.stringify(data.admin));
      const requestedPath =
        typeof router.query.from === "string" &&
        router.query.from.startsWith("/admin/")
          ? router.query.from
          : "/admin/dashboard";

      // A full navigation ensures the new HttpOnly session cookie is used
      // immediately in installed PWA mode.
      window.location.replace(requestedPath);
    } catch {
      setToastMessage("Unable to connect to the server");
    } finally {
      setIsLoading(false);
    }
  }

return (
  <main className="min-h-screen bg-[#43A047]">
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-10">
      {/* Logo */}
      <div className="mb-10 flex flex-col items-center">
        <Image
          src="/finallogo.png"
          alt="Smart Attendance AI"
          width={110}
          height={110}
          priority
        />

     
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md rounded-[36px] bg-white p-8 shadow-[0_20px_60px_rgba(0,0,0,0.2)] md:p-10">
        <div className="mb-8 text-center">
           <h1 className="mt-5 text-center text-3xl font-bold tracking-tight text-black">
          Smart Attendance AI
        </h1>

        <p className="mt-2 text-center text-sm text-black">
          Face Recognition Attendance System
        </p> 

        
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-5">
            {/* Username */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Username
              </label>

              <input
                autoComplete="username"
                type="text"
                value={username}
                disabled={isLoading}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 text-slate-900 outline-none transition-all duration-200  "
              />
            </div>

            {/* Password */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Password
              </label>

              <div className="relative">
                <input
                  autoComplete="current-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  disabled={isLoading}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 text-slate-900 outline-none transition-all duration-200  "
                />

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() =>
                    setShowPassword((current) => !current)
                  }
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#43A047]"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-8 h-14 w-full rounded-2xl bg-[#43A047] text-lg font-bold text-white shadow-lg transition-all duration-200 hover:scale-[1.02] hover:bg-[#388E3C] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? "LOGGING IN..." : "LOGIN"}
          </button>
        </form>

        <div className="mt-8 border-t border-slate-100 pt-5 text-center text-xs text-slate-400">
          Secure • Fast • AI Powered
        </div>
      </div>

      {toastMessage ? (
        <div
          role="alert"
          className="fixed right-5 top-5 rounded-2xl bg-slate-900 px-5 py-4 text-sm font-semibold text-white shadow-2xl"
        >
          {toastMessage}
        </div>
      ) : null}
    </div>
  </main>
);
}

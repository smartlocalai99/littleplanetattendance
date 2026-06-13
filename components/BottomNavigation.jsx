import { ClipboardList, Home, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/router";

const navItems = [
  {
    label: "Dashboard",
    route: "/admin/dashboard",
    icon: Home,
  },
  {
    label: "Enroll",
    route: "/admin/teachers/enroll",
    icon: UserPlus,
  },
  {
    label: "Teachers",
    route: "/admin/teachers",
    icon: Users,
  },
  {
    label: "Logs",
    route: "/admin/logs",
    icon: ClipboardList,
  },
];

function isActiveRoute(pathname, route) {
  if (route === "/admin/teachers") {
    return pathname === route;
  }

  return pathname === route || pathname.startsWith(`${route}/`);
}

export default function BottomNavigation() {
  const router = useRouter();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white px-3 pt-2 shadow-[0_-12px_30px_rgba(15,23,42,0.14)]"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
      aria-label="Admin navigation"
    >
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1 rounded-t-3xl">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = isActiveRoute(router.pathname, item.route);

          return (
            <button
              key={item.route}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => router.push(item.route)}
              className={[
                "flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs font-semibold transition-all duration-200 ease-out",
                isActive
                  ? "bg-emerald-50 text-emerald-600"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
              ].join(" ")}
            >
              <Icon
                className={[
                  "h-5 w-5 transition-transform duration-200",
                  isActive ? "scale-110" : "scale-100",
                ].join(" ")}
                strokeWidth={isActive ? 2.6 : 2.2}
                aria-hidden="true"
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

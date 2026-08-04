import { ArrowRightLeft, Home, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useRef } from "react";

const navItems = [
  {
    label: "Dashboard",
    route: "/admin/dashboard",
    icon: Home,
  },
  {
    label: "In / Out",
    route: "/admin/attendance",
    icon: ArrowRightLeft,
  },
  {
    label: "Enroll",
    route: "/admin/teachers/enroll",
    icon: UserPlus,
  },
  {
    label: "Staff",
    route: "/admin/staff",
    icon: Users,
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
  const navRef = useRef(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    const nav = navRef.current;

    if (!viewport || !nav) {
      return;
    }

    // iOS Safari (especially in installed/standalone PWA mode) doesn't
    // reliably recompute `position: fixed` elements when a native <select>
    // picker or the keyboard opens — the bar visibly jumps or detaches from
    // the bottom edge. Actively re-pin it to the real visual viewport bottom
    // instead of trusting CSS fixed positioning alone.
    function pinToViewportBottom() {
      const gap = window.innerHeight - (viewport.height + viewport.offsetTop);
      nav.style.transform = gap > 0 ? `translateY(-${gap}px)` : "";
    }

    viewport.addEventListener("resize", pinToViewportBottom);
    viewport.addEventListener("scroll", pinToViewportBottom);
    pinToViewportBottom();

    return () => {
      viewport.removeEventListener("resize", pinToViewportBottom);
      viewport.removeEventListener("scroll", pinToViewportBottom);
    };
  }, []);

  return (
    <nav
      ref={navRef}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white px-3 pt-2 shadow-[0_-12px_30px_rgba(15,23,42,0.14)]"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
      aria-label="Admin navigation"
    >
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1 rounded-t-3xl">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = isActiveRoute(router.pathname, item.route);

          return (
            <a
              key={item.route}
              href={item.route}
              aria-current={isActive ? "page" : undefined}
              onClick={(event) => {
                if (isActive) {
                  event.preventDefault();
                }
              }}
              className={[
                "flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-semibold transition-all duration-200 ease-out",
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
            </a>
          );
        })}
      </div>
    </nav>
  );
}

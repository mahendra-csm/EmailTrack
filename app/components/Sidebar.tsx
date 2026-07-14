"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type IconName = "campaigns" | "plus" | "database" | "mail" | "chart" | "people" | "award" | "report" | "webinar";

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "campaigns":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "database":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
          <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
        </svg>
      );
    case "mail":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M3 3v18h18" />
          <path d="M7 14l3-4 3 3 4-6" />
        </svg>
      );
    case "people":
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "award":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="6" />
          <path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5" />
        </svg>
      );
    case "report":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );
    case "webinar":
      return (
        <svg {...common}>
          <path d="M15 10l4.55-2.27A1 1 0 0 1 21 8.62v6.76a1 1 0 0 1-1.45.89L15 14" />
          <rect x="3" y="6" width="12" height="12" rx="2" />
        </svg>
      );
  }
}

const NAV: { href: string; label: string; icon: IconName; exact: boolean }[] = [
  { href: "/", label: "Campaigns", icon: "campaigns", exact: true },
  { href: "/upload", label: "New campaign", icon: "plus", exact: false },
  { href: "/webinar", label: "Webinar", icon: "webinar", exact: false },
  { href: "/committee", label: "Scientific Committee", icon: "award", exact: false },
  { href: "/recipients", label: "Recipients", icon: "people", exact: false },
  { href: "/deliverability", label: "Deliverability", icon: "chart", exact: false },
  { href: "/reports", label: "Reports", icon: "report", exact: false },
  { href: "/database", label: "Database", icon: "database", exact: false },
  { href: "/senders", label: "Senders", icon: "mail", exact: false },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <Link href="/" className="brand">
        <span className="logo">✦</span>
        EmailTracking
      </Link>

      <div className="nav-label">Workspace</div>
      <nav>
        {NAV.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${active ? " active" : ""}`}
            >
              <span className="ic">
                <Icon name={item.icon} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="spacer" />
      <div className="foot">Automatic batch sender</div>
    </aside>
  );
}

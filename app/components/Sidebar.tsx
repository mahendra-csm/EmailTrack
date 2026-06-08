"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Campaigns", icon: "▦", exact: true },
  { href: "/upload", label: "New campaign", icon: "＋", exact: false },
  { href: "/database", label: "Database", icon: "🗄", exact: false },
  { href: "/senders", label: "Senders", icon: "✉", exact: false },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <Link href="/" className="brand">
        <span className="logo">✦</span>
        EmailTrackingOne
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
              <span className="ic">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="spacer" />
      <div className="foot">Manual multi-stage sender</div>
    </aside>
  );
}

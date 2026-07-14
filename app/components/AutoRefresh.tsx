"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Drop-in live updater for SERVER pages: periodically calls router.refresh(),
// which re-runs the server component and streams fresh data in without a full
// reload. Pauses while the tab is hidden so we don't poll needlessly.
export default function AutoRefresh({
  seconds = 10,
  label = "Live",
}: {
  seconds?: number;
  label?: string;
}) {
  const router = useRouter();
  const [on, setOn] = useState(true);

  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, Math.max(3, seconds) * 1000);
    return () => clearInterval(id);
  }, [on, seconds, router]);

  return (
    <button
      type="button"
      onClick={() => setOn((v) => !v)}
      className="btn secondary"
      title={on ? "Auto-refreshing — click to pause" : "Paused — click to resume"}
      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: on ? "#16a34a" : "#9ca3af",
          boxShadow: on ? "0 0 0 3px rgba(22,163,74,0.18)" : "none",
          display: "inline-block",
        }}
      />
      {on ? `${label} · every ${seconds}s` : "Paused"}
    </button>
  );
}

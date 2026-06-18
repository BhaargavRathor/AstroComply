"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/utils/mosip-data";
import { User } from "lucide-react";
import { getHealth, getMetricsSummary, type HealthPayload } from "@/utils/api";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [utc, setUtc] = useState("");
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [trackedCount, setTrackedCount] = useState<number | null>(null);
  const [alertCount, setAlertCount] = useState<number | null>(null);

  /* ── Mission Clock — ticks every second ─── */
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setUtc(d.toISOString().replace("T", "  ").slice(0, 19) + " Z");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  /* ── System health + metrics — polls every 30s ─── */
  useEffect(() => {
    let cancelled = false;
    async function loadStatus() {
      try {
        const [healthPayload, metricsPayload] = await Promise.all([
          getHealth(),
          getMetricsSummary(),
        ]);
        if (cancelled) return;
        setHealth(healthPayload);
        setTrackedCount(metricsPayload.total_satellites ?? null);
        setAlertCount(metricsPayload.critical_risk_count ?? null);
      } catch {
        if (!cancelled) setHealth({ status: "degraded" });
      }
    }
    loadStatus();
    const id = setInterval(loadStatus, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const isNominal = health?.status === "ok";

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--c-base)" }}
    >
      {/* ══════════════════════════════════════════════════════
          PERSISTENT LEFT NAV RAIL
          Always visible, icon + label, never collapses on desktop
          ══════════════════════════════════════════════════════ */}
      <aside
        className="fixed left-0 top-0 z-50 flex h-full flex-col"
        style={{
          width: "var(--sidebar-w)",
          background: "var(--c-surface-0)",
          borderRight: "1px solid var(--c-border)",
        }}
      >
        {/* Logo mark */}
        <div
          className="flex h-[var(--topbar-h)] items-center justify-center"
          style={{ borderBottom: "1px solid var(--c-border)" }}
        >
          <div
            className="flex h-[28px] w-[28px] items-center justify-center"
            style={{
              background: "rgba(77,217,245,0.07)",
              border: "1px solid rgba(77,217,245,0.22)",
              borderRadius: "4px",
            }}
          >
            {/* Satellite icon as SVG for precision */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-cyan)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 7L17 3" /><path d="M17 3L21 7" />
              <path d="M11 13L7 17" /><path d="M7 17L3 21" />
              <rect x="8" y="8" width="8" height="8" rx="1" />
              <path d="M8 12H3" /><path d="M16 12H21" />
            </svg>
          </div>
        </div>

        {/* Navigation items */}
        <nav className="flex flex-1 flex-col items-center gap-0.5 py-2 px-1.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className="group relative flex h-9 w-full items-center justify-center rounded transition-all duration-150"
                style={{
                  background: isActive ? "rgba(77,217,245,0.09)" : "transparent",
                  borderLeft: isActive ? "2px solid var(--c-cyan)" : "2px solid transparent",
                }}
              >
                <Icon
                  size={15}
                  style={{
                    color: isActive ? "var(--c-cyan)" : "var(--t-meta)",
                    transition: "color 0.15s",
                  }}
                />
                {/* Tooltip */}
                <div
                  className="pointer-events-none absolute left-full ml-2 hidden whitespace-nowrap rounded px-2 py-1 group-hover:flex"
                  style={{
                    background: "var(--c-surface-1)",
                    border: "1px solid var(--c-border-hi)",
                    zIndex: 100,
                  }}
                >
                  <span className="font-data text-[9px] uppercase tracking-widest" style={{ color: "var(--t-primary)" }}>
                    {item.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Operator identity — bottom of rail */}
        <div
          className="flex items-center justify-center py-3"
          style={{ borderTop: "1px solid var(--c-border)" }}
        >
          <div
            className="flex h-[26px] w-[26px] items-center justify-center rounded-full"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--c-border)",
              color: "var(--t-meta)",
            }}
          >
            <User size={11} />
          </div>
        </div>
      </aside>

      {/* ══════════════════════════════════════════════════════
          MAIN CONTENT AREA
          ══════════════════════════════════════════════════════ */}
      <div
        className="flex flex-1 flex-col"
        style={{ marginLeft: "var(--sidebar-w)" }}
      >
        {/* ── Persistent Top Status Bar ─────────────────────────────────────── */}
        <header
          className="sticky top-0 z-40 flex h-[var(--topbar-h)] items-center justify-between px-5"
          style={{
            background: "rgba(8,12,18,0.96)",
            borderBottom: "1px solid var(--c-border)",
            backdropFilter: "blur(12px)",
          }}
        >
          {/* Left: Platform ID */}
          <div className="flex items-center gap-3">
            <span
              className="font-display tracking-[0.22em] text-[13px]"
              style={{ color: "var(--t-primary)", letterSpacing: "0.22em" }}
            >
              AstroComply AI
            </span>
            <span
              className="hidden sm:block font-data text-[8px] tracking-[0.3em] uppercase"
              style={{ color: "var(--t-meta)" }}
            >
              Automated Space Licensing Platform
            </span>
          </div>

          {/* Center: System instrument readouts */}
          <div className="hidden md:flex items-center gap-5">

            {/* Feed status */}
            <div className="flex items-center gap-1.5">
              <span
                className="pulse-dot"
                style={{ background: isNominal ? "var(--c-nominal)" : "var(--c-elevated)" }}
              />
              <span
                className="font-data text-[9px] uppercase tracking-widest"
                style={{ color: isNominal ? "var(--c-nominal)" : "var(--c-elevated)" }}
              >
                {isNominal ? "FEED  NOMINAL" : "CHECK  HEALTH"}
              </span>
            </div>

            <div className="h-3 w-px" style={{ background: "var(--c-border)" }} />

            {/* Object count */}
            <div className="flex items-center gap-1.5">
              <span className="font-data text-[9px] uppercase tracking-widest" style={{ color: "var(--t-meta)" }}>
                TRACKING
              </span>
              <span className="font-data text-[10px]" style={{ color: "var(--t-primary)" }}>
                {trackedCount != null ? trackedCount.toLocaleString() : "—"}
              </span>
              <span className="font-data text-[9px] uppercase tracking-widest" style={{ color: "var(--t-meta)" }}>
                OBJECTS
              </span>
            </div>

            <div className="h-3 w-px" style={{ background: "var(--c-border)" }} />

            {/* Alert count */}
            <div className="flex items-center gap-1.5">
              <span className="font-data text-[9px] uppercase tracking-widest" style={{ color: "var(--t-meta)" }}>
                ALERTS
              </span>
              <span
                className="font-data text-[10px]"
                style={{ color: (alertCount ?? 0) > 0 ? "var(--c-elevated)" : "var(--t-secondary)" }}
              >
                {alertCount != null ? alertCount : "—"}
              </span>
            </div>

            <div className="h-3 w-px" style={{ background: "var(--c-border)" }} />

            {/* Agents online */}
            <div className="flex items-center gap-1.5">
              <span className="font-data text-[9px] uppercase tracking-widest" style={{ color: "var(--t-meta)" }}>
                AGENTS
              </span>
              <span className="font-data text-[10px]" style={{ color: "var(--c-cyan)" }}>
                8 / 8
              </span>
            </div>
          </div>

          {/* Right: Mission clock */}
          <div
            className="flex items-center gap-2 px-3 py-1 rounded"
            style={{
              background: "var(--c-surface-1)",
              border: "1px solid var(--c-border)",
            }}
          >
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
              <circle cx="5" cy="5" r="4.5" stroke="var(--c-cyan)" strokeOpacity="0.5" />
              <line x1="5" y1="5" x2="5" y2="2" stroke="var(--c-cyan)" strokeWidth="1" />
              <line x1="5" y1="5" x2="7" y2="5" stroke="var(--c-cyan)" strokeWidth="1" strokeOpacity="0.7" />
            </svg>
            <span
              className="font-data text-[10px] tabular-nums"
              style={{ color: "var(--t-primary)", letterSpacing: "0.08em" }}
            >
              {utc}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

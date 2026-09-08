"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCheck, X } from "lucide-react";
import Link from "next/link";
import {
  NOTIFICATIONS_CHANGED_EVENT,
  addInAppNotification,
  clearInAppNotifications,
  markAllInAppNotificationsRead,
  markInAppNotificationRead,
  readInAppNotifications,
  type InAppNotification,
} from "@/lib/notifications";

type EvaluationSource = {
  source?: string;
  matched?: boolean;
  similarity?: number | null;
  direction_agreement?: number | null;
  match_start?: string | null;
  match_end?: string | null;
  reason?: string;
  matches?: Array<{
    name?: string;
    matched?: boolean;
    start_time?: string | null;
    end_time?: string | null;
    detected_at?: string | null;
  }>;
};

type AlertEvaluation = {
  symbol?: string;
  timeframe?: string;
  evaluated_at?: string;
  triggered?: boolean;
  sources?: EvaluationSource[];
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function publishEvaluation(result: AlertEvaluation) {
  if (!result.triggered || !result.symbol || !result.timeframe || !result.sources) return;
  const matchedSources = result.sources.filter((source) => source.matched);
  if (matchedSources.length === 0) return;

  const namedMatches = matchedSources.flatMap((source) => source.matches ?? []).filter((match) => match.matched);
  const firstNamed = namedMatches[0];
  const pattern = firstNamed?.name;
  const detectedAt = firstNamed?.detected_at || matchedSources.find((source) => source.match_end || source.match_start)?.match_end || result.evaluated_at;
  const title = pattern ? `${pattern} detected` : "Pattern alert triggered";
  const message = pattern
    ? `${result.symbol} · ${result.timeframe} · Live chart pattern detected at ${formatDate(detectedAt)}.`
    : `${result.symbol} · ${result.timeframe} · ${matchedSources.map((source) => source.source || "Alert").join(", ")} condition triggered.`;

  // The detection timestamp is the event identity. Repeated 60s evaluations therefore
  // refresh nothing until a genuinely new pattern event appears.
  const eventKey = [
    result.symbol,
    result.timeframe,
    ...matchedSources.map((source) => [
      source.source,
      source.match_start,
      source.match_end,
      ...(source.matches ?? []).filter((match) => match.matched).map((match) => [match.name, match.start_time, match.end_time, match.detected_at]),
    ]),
  ];

  addInAppNotification({
    key: JSON.stringify(eventKey),
    type: "pattern-alert",
    title,
    message,
    symbol: result.symbol,
    timeframe: result.timeframe,
    pattern,
    detectedAt: detectedAt || new Date().toISOString(),
    href: `/alerts?symbol=${encodeURIComponent(result.symbol)}&timeframe=${encodeURIComponent(result.timeframe)}`,
  });
}

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InAppNotification[]>([]);

  useEffect(() => {
    const refresh = () => setItems(readInAppNotifications());
    refresh();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
  }, []);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const input = args[0];
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : "";
      if (url.includes("/api/backend/api/v1/alerts/evaluate")) {
        try {
          publishEvaluation(await response.clone().json() as AlertEvaluation);
        } catch {
          // The Alerts page owns evaluation errors; notification parsing stays silent.
        }
      }
      return response;
    };
    return () => { window.fetch = originalFetch; };
  }, []);

  const unread = items.filter((item) => !item.read).length;

  function openNotification(item: InAppNotification) {
    markInAppNotificationRead(item.id);
    setOpen(false);
  }

  return <div className="relative">
    <button type="button" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="relative flex h-8 w-8 items-center justify-center rounded-md border border-white/8 text-white/45 transition hover:bg-white/[0.04] hover:text-white/80">
      <Bell size={15} />
      {unread > 0 && <span className="absolute -right-1 -top-1 flex min-w-[15px] h-[15px] items-center justify-center rounded-full border border-[#070a0f] bg-amber-200 px-1 text-[8px] font-bold text-black">{unread > 99 ? "99+" : unread}</span>}
    </button>
    {open && <>
      <button type="button" aria-label="Close notifications" onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default" />
      <section className="absolute right-0 top-10 z-50 w-[360px] max-w-[calc(100vw-24px)] overflow-hidden rounded-lg border border-white/10 bg-[#0b1017] shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
          <div><div className="text-xs font-semibold">Notifications</div><div className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-white/25">Pattern alerts</div></div>
          <div className="flex items-center gap-1">
            {unread > 0 && <button type="button" onClick={markAllInAppNotificationsRead} title="Mark all read" className="flex h-7 w-7 items-center justify-center rounded text-white/30 hover:bg-white/5 hover:text-white/70"><CheckCheck size={14} /></button>}
            {items.length > 0 && <button type="button" onClick={clearInAppNotifications} title="Clear notifications" className="flex h-7 w-7 items-center justify-center rounded text-white/30 hover:bg-white/5 hover:text-white/70"><X size={14} /></button>}
          </div>
        </div>
        <div className="max-h-[430px] overflow-y-auto">
          {items.length === 0 ? <div className="px-5 py-10 text-center"><Bell size={20} className="mx-auto text-white/15" /><div className="mt-2 text-xs text-white/35">No alerts yet.</div><div className="mt-1 text-[10px] leading-4 text-white/20">Triggered pattern alerts will appear here.</div></div> : items.map((item) => <Link key={item.id} href={item.href} onClick={() => openNotification(item)} className={`block border-b border-white/6 px-4 py-3 transition hover:bg-white/[0.025] ${item.read ? "opacity-65" : "bg-amber-200/[0.025]"}`}>
            <div className="flex items-start gap-3"><span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.read ? "bg-white/15" : "bg-amber-200"}`} /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="text-xs font-semibold">{item.title}</div><span className="shrink-0 text-[9px] text-white/25">{formatDate(item.createdAt)}</span></div><div className="mt-1 text-[10px] font-medium text-amber-100/70">{item.symbol.replace("USDT", "/USDT")} · {item.timeframe}{item.pattern ? ` · ${item.pattern}` : ""}</div><div className="mt-1 text-[10px] leading-4 text-white/35">{item.message}</div><div className="mt-1 text-[9px] text-white/20">Detected {formatDate(item.detectedAt)} · View alerts →</div></div></div>
          </Link>)}
        </div>
        <div className="border-t border-white/8 px-4 py-2.5 text-[9px] text-white/20">Website notifications are active while this workspace is open.</div>
      </section>
    </>}
  </div>;
}

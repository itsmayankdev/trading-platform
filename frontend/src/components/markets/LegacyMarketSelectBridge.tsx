"use client";

import { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import MarketSelector from "@/components/markets/MarketSelector";
import { MARKET_CONTEXT_EVENT, normalizeMarketSymbol, readGlobalMarket, writeGlobalMarket } from "@/lib/marketContext";

type Bridge = { host: HTMLDivElement; root: Root; select: HTMLSelectElement; onGlobal: (event: Event) => void };

function isLegacyMarketSelect(select: HTMLSelectElement) {
  const values = Array.from(select.options).map((option) => option.value.toUpperCase());
  return ["BTCUSDT", "ETHUSDT", "SOLUSDT"].every((symbol) => values.includes(symbol));
}

export default function LegacyMarketSelectBridge() {
  useEffect(() => {
    const bridges = new Map<HTMLSelectElement, Bridge>();
    let disposed = false;

    const enhanceSelect = (select: HTMLSelectElement) => {
      if (disposed || bridges.has(select) || !isLegacyMarketSelect(select)) return;
      const parent = select.parentElement;
      if (!parent) return;
      const host = document.createElement("div");
      host.className = "mt-1 min-w-[190px] relative";
      parent.insertBefore(host, select);
      select.style.display = "none";

      const syncSelect = (symbol: string) => {
        const normalized = normalizeMarketSymbol(symbol);
        if (!normalized) return;
        if (!Array.from(select.options).some((option) => option.value.toUpperCase() === normalized)) {
          const option = document.createElement("option");
          option.value = normalized;
          option.textContent = normalized;
          select.appendChild(option);
        }
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
        setter?.call(select, normalized);
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const onGlobal = (event: Event) => { const detail = event instanceof CustomEvent ? event.detail as { symbol?: string } : undefined; if (detail?.symbol) syncSelect(detail.symbol); };
      const root = createRoot(host);
      root.render(<MarketSelector value={normalizeMarketSymbol(select.value || readGlobalMarket().symbol)} onChange={(next) => { const normalized = normalizeMarketSymbol(next); if (!normalized) return; writeGlobalMarket(normalized); syncSelect(normalized); }} className="w-full" />);
      window.addEventListener(MARKET_CONTEXT_EVENT, onGlobal);
      bridges.set(select, { host, root, select, onGlobal });
    };

    const cleanupSelect = (select: HTMLSelectElement) => {
      const bridge = bridges.get(select);
      if (!bridge) return;
      window.removeEventListener(MARKET_CONTEXT_EVENT, bridge.onGlobal);
      bridge.root.unmount();
      bridge.host.remove();
      select.style.display = "";
      bridges.delete(select);
    };

    const enhanceAll = () => document.querySelectorAll<HTMLSelectElement>("select").forEach(enhanceSelect);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLSelectElement) enhanceSelect(node);
          else if (node instanceof Element) node.querySelectorAll<HTMLSelectElement>("select").forEach(enhanceSelect);
        });
        record.removedNodes.forEach((node) => {
          if (node instanceof HTMLSelectElement) cleanupSelect(node);
          else if (node instanceof Element) node.querySelectorAll<HTMLSelectElement>("select").forEach(cleanupSelect);
        });
      }
    });

    enhanceAll();
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { disposed = true; observer.disconnect(); bridges.forEach((entry) => { window.removeEventListener(MARKET_CONTEXT_EVENT, entry.onGlobal); entry.root.unmount(); entry.host.remove(); entry.select.style.display = ""; }); bridges.clear(); };
  }, []);
  return null;
}

"use client";

import { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import MarketSelector from "@/components/markets/MarketSelector";
import { MARKET_CONTEXT_EVENT, normalizeMarketSymbol, readGlobalMarket, writeGlobalMarket } from "@/lib/marketContext";

type Bridge = { host: HTMLDivElement; root: Root; select: HTMLSelectElement };

function isLegacyMarketSelect(select: HTMLSelectElement) {
  const values = Array.from(select.options).map((option) => option.value.toUpperCase());
  return ["BTCUSDT", "ETHUSDT", "SOLUSDT"].every((symbol) => values.includes(symbol));
}

export default function LegacyMarketSelectBridge() {
  useEffect(() => {
    const bridges = new Map<HTMLSelectElement, Bridge>();
    let disposed = false;

    const enhance = () => {
      if (disposed) return;
      document.querySelectorAll<HTMLSelectElement>("select").forEach((select) => {
        if (bridges.has(select) || !isLegacyMarketSelect(select)) return;
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

        const root = createRoot(host);
        root.render(
          <MarketSelector
            value={normalizeMarketSymbol(select.value || readGlobalMarket().symbol)}
            onChange={(symbol) => {
              const normalized = normalizeMarketSymbol(symbol);
              if (!normalized) return;
              writeGlobalMarket(normalized);
              syncSelect(normalized);
            }}
            className="w-full"
          />,
        );

        const onGlobal = (event: Event) => {
          const detail = event instanceof CustomEvent ? event.detail as { symbol?: string } : undefined;
          const next = detail?.symbol;
          if (next) syncSelect(next);
        };
        window.addEventListener(MARKET_CONTEXT_EVENT, onGlobal);
        bridges.set(select, { host, root, select });

        // Keep the native React select state synchronized when a page changes it programmatically.
        const observer = new MutationObserver(() => {
          if (!bridges.has(select)) return;
          const current = normalizeMarketSymbol(select.value);
          if (current) writeGlobalMarket(current);
        });
        observer.observe(select, { attributes: true, childList: true, subtree: true });
        (bridges.get(select) as Bridge & { observer?: MutationObserver; onGlobal?: (event: Event) => void }).observer = observer;
        (bridges.get(select) as Bridge & { observer?: MutationObserver; onGlobal?: (event: Event) => void }).onGlobal = onGlobal;
      });
    };

    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    const first = window.requestAnimationFrame(enhance);
    const second = window.setTimeout(enhance, 100);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(first);
      window.clearTimeout(second);
      observer.disconnect();
      bridges.forEach((entry) => {
        const stored = entry as Bridge & { observer?: MutationObserver; onGlobal?: (event: Event) => void };
        stored.observer?.disconnect();
        if (stored.onGlobal) window.removeEventListener(MARKET_CONTEXT_EVENT, stored.onGlobal);
        entry.root.unmount();
        entry.host.remove();
        entry.select.style.display = "";
      });
      bridges.clear();
    };
  }, []);

  return null;
}

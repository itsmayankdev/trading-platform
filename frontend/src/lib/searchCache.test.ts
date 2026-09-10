import { describe, expect, it } from "vitest";
import { SearchResponseCache } from "./searchCache";

describe("SearchResponseCache", () => {
  it("keeps entries bounded and promotes recently read entries", () => {
    const cache = new SearchResponseCache<string>({ ttlMs: 60_000, maxEntries: 2 });
    cache.set("a", "A");
    cache.set("b", "B");
    expect(cache.get("a")).toBe("A");
    cache.set("c", "C");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe("A");
    expect(cache.get("c")).toBe("C");
    expect(cache.size).toBe(2);
  });

  it("expires entries", () => {
    const cache = new SearchResponseCache<string>({ ttlMs: 0, maxEntries: 2 });
    cache.set("a", "A");
    expect(cache.get("a")).toBeUndefined();
  });
});

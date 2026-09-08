export type FavoritePattern = {
  id: string;
  name: string;
  type: "current" | "historical";
  symbol: string;
  timeframe: string;
  patternLength: number;
  startTime: string;
  endTime: string;
  similarityScore?: number;
  matchIndex?: number;
  createdAt: string;
};

export const FAVORITES_STORAGE_KEY = "market-memory-favorite-patterns-v1";
export const FAVORITES_CHANGED_EVENT = "market-memory-favorites-changed";

export function readFavoritePatterns(): FavoritePattern[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function favoriteNameExists(name: string, favorites = readFavoritePatterns(), ignoreId?: string) {
  const normalized = name.trim().toLocaleLowerCase();
  return favorites.some((favorite) => favorite.id !== ignoreId && favorite.name.trim().toLocaleLowerCase() === normalized);
}

export function saveFavoritePattern(favorite: FavoritePattern) {
  const favorites = readFavoritePatterns();
  if (favoriteNameExists(favorite.name, favorites, favorite.id)) return false;
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([favorite, ...favorites]));
  window.dispatchEvent(new Event(FAVORITES_CHANGED_EVENT));
  return true;
}

export function removeFavoritePattern(id: string) {
  const next = readFavoritePatterns().filter((favorite) => favorite.id !== id);
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(FAVORITES_CHANGED_EVENT));
}

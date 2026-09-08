export type InAppNotification = {
  id: string;
  key: string;
  type: "pattern-alert";
  title: string;
  message: string;
  symbol: string;
  timeframe: string;
  pattern?: string;
  detectedAt: string;
  createdAt: string;
  href: string;
  read: boolean;
};

export const NOTIFICATIONS_STORAGE_KEY = "market-memory-in-app-notifications-v1";
export const NOTIFICATIONS_CHANGED_EVENT = "market-memory-notifications-changed";
export const NOTIFICATIONS_ENABLED_KEY = "market-memory-in-app-notifications-enabled-v1";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value == null ? fallback : value as T;
  } catch {
    return fallback;
  }
}

export function readInAppNotifications(): InAppNotification[] {
  const items = read<InAppNotification[]>(NOTIFICATIONS_STORAGE_KEY, []);
  return Array.isArray(items) ? items : [];
}

export function areInAppNotificationsEnabled(): boolean {
  return read<boolean>(NOTIFICATIONS_ENABLED_KEY, true);
}

export function setInAppNotificationsEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, JSON.stringify(enabled));
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

export function addInAppNotification(notification: Omit<InAppNotification, "id" | "createdAt" | "read">) {
  if (typeof window === "undefined" || !areInAppNotificationsEnabled()) return false;
  const existing = readInAppNotifications();
  if (existing.some((item) => item.key === notification.key)) return false;
  const next: InAppNotification[] = [
    { ...notification, id: crypto.randomUUID(), createdAt: new Date().toISOString(), read: false },
    ...existing,
  ].slice(0, 100);
  localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  return true;
}

export function markInAppNotificationRead(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(readInAppNotifications().map((item) => item.id === id ? { ...item, read: true } : item)));
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

export function markAllInAppNotificationsRead() {
  if (typeof window === "undefined") return;
  localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(readInAppNotifications().map((item) => ({ ...item, read: true }))));
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

export function clearInAppNotifications() {
  if (typeof window === "undefined") return;
  localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, "[]");
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

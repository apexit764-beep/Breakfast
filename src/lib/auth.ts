"use client";

const STORAGE_KEY = "breakfast_admin_authed";

export function isValidAdminPassword(password: string): boolean {
  return password.length > 0 && password === process.env.NEXT_PUBLIC_ADMIN_PASSWORD;
}

export function setAdminAuthed(): void {
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, "1");
}

export function isAdminAuthed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function clearAdminAuthed(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
}

export const ADMIN_COOKIE = "admin_session";

export function isValidAdminPassword(password: string): boolean {
  return password.length > 0 && password === process.env.ADMIN_PASSWORD;
}

export async function adminSessionToken(): Promise<string> {
  const secret = process.env.ADMIN_PASSWORD ?? "";
  const data = new TextEncoder().encode(`breakfast-admin:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

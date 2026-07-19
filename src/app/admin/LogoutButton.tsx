"use client";

import { useRouter } from "next/navigation";
import { clearAdminAuthed } from "@/lib/auth";

export default function LogoutButton() {
  const router = useRouter();

  function handleLogout() {
    clearAdminAuthed();
    router.push("/admin/login");
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm font-medium text-zinc-500 hover:text-red-600"
    >
      تسجيل خروج
    </button>
  );
}

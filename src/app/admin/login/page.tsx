"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isValidAdminPassword, setAdminAuthed } from "@/lib/auth";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isValidAdminPassword(password)) {
      setError("كلمة السر غير صحيحة");
      return;
    }

    setAdminAuthed();
    router.push("/admin");
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-200"
      >
        <h1 className="mb-1 text-xl font-bold">لوحة تحكم الفطور</h1>
        <p className="mb-6 text-sm text-zinc-500">أدخل كلمة سر الأدمن للمتابعة</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="كلمة السر"
          autoFocus
          className="mb-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
        />
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          className="w-full rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          دخول
        </button>
      </form>
    </div>
  );
}

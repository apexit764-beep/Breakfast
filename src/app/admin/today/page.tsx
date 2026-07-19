"use client";

import { useRequireAdmin } from "@/lib/useRequireAdmin";
import TodaySelector from "./TodaySelector";
import { todayDateString } from "@/lib/date";

export default function TodaySelectionPage() {
  const ready = useRequireAdmin();
  if (!ready) return null;

  const date = todayDateString();
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">اقتراحات اليوم</h1>
      <p className="mb-6 text-sm text-zinc-500">
        اختر المطاعم اللي بدك تظهرها للموظفين اليوم ({date})
      </p>
      <TodaySelector date={date} />
    </div>
  );
}

"use client";

import { useRequireAdmin } from "@/lib/useRequireAdmin";
import OrdersBoard from "./OrdersBoard";
import { todayDateString } from "@/lib/date";

export default function OrdersPage() {
  const ready = useRequireAdmin();
  if (!ready) return null;

  const date = todayDateString();
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">طلبات اليوم</h1>
      <p className="mb-6 text-sm text-zinc-500">
        كل طلبات الموظفين لهذا اليوم ({date}) مجمعة حسب المطعم
      </p>
      <OrdersBoard date={date} />
    </div>
  );
}

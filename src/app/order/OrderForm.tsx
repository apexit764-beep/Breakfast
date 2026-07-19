"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { todayDateString } from "@/lib/date";
import type { MenuItem } from "@/lib/types";

export default function OrderForm({
  restaurantId,
  menuItems,
}: {
  restaurantId: string;
  menuItems: MenuItem[];
}) {
  const [employeeName, setEmployeeName] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function setQuantity(itemId: string, qty: number) {
    setQuantities((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[itemId];
      else next[itemId] = qty;
      return next;
    });
  }

  const selectedCount = Object.values(quantities).reduce((a, b) => a + b, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!employeeName.trim()) {
      setError("اكتب اسمك أولاً");
      return;
    }
    if (selectedCount === 0) {
      setError("اختر صنف واحد على الأقل");
      return;
    }

    setSubmitting(true);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        employee_name: employeeName.trim(),
        restaurant_id: restaurantId,
        order_date: todayDateString(),
        notes: notes.trim() || null,
      })
      .select()
      .single();

    if (orderError || !order) {
      setSubmitting(false);
      setError(orderError?.message ?? "حدث خطأ أثناء إرسال الطلب");
      return;
    }

    const orderItems = Object.entries(quantities).map(([menu_item_id, quantity]) => ({
      order_id: order.id,
      menu_item_id,
      quantity,
    }));

    const { error: itemsError } = await supabase.from("order_items").insert(orderItems);

    setSubmitting(false);

    if (itemsError) {
      setError(itemsError.message);
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-xl bg-white p-6 text-center ring-1 ring-zinc-200">
        <p className="text-lg font-semibold text-green-700">تم إرسال طلبك بنجاح ✅</p>
        <p className="mt-1 text-sm text-zinc-500">شكراً {employeeName}، بالهنا والشفا!</p>
      </div>
    );
  }

  if (menuItems.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        ما في أصناف متوفرة في هذا المطعم حالياً.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
        <label className="mb-1 block text-xs font-medium text-zinc-500">اسمك</label>
        <input
          value={employeeName}
          onChange={(e) => setEmployeeName(e.target.value)}
          placeholder="اكتب اسمك"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
        />
      </div>

      <ul className="flex flex-col gap-3">
        {menuItems.map((item) => {
          const qty = quantities[item.id] ?? 0;
          return (
            <li
              key={item.id}
              className={`flex items-center justify-between rounded-xl bg-white p-4 ring-1 transition ${
                qty > 0 ? "ring-orange-400 bg-orange-50" : "ring-zinc-200"
              }`}
            >
              <div>
                <p className="font-semibold">{item.name}</p>
                {item.description && (
                  <p className="text-sm text-zinc-500">{item.description}</p>
                )}
                {item.price != null && (
                  <p className="text-sm text-zinc-500">{item.price} د.أ</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuantity(item.id, qty - 1)}
                  disabled={qty === 0}
                  className="h-8 w-8 rounded-full bg-zinc-100 text-lg font-bold text-zinc-600 disabled:opacity-40"
                >
                  −
                </button>
                <span className="w-5 text-center font-semibold">{qty}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(item.id, qty + 1)}
                  className="h-8 w-8 rounded-full bg-orange-500 text-lg font-bold text-white"
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
        <label className="mb-1 block text-xs font-medium text-zinc-500">
          ملاحظات (اختياري)
        </label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="مثال: بدون بصل"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {submitting ? "جاري الإرسال..." : `إرسال الطلب (${selectedCount} صنف)`}
      </button>
    </form>
  );
}

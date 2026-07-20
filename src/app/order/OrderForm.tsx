"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { todayDateString } from "@/lib/date";
import type { MenuItem, MenuItemVariant } from "@/lib/types";

type ItemWithVariants = MenuItem & { variants: MenuItemVariant[] };

type Selection = {
  menuItemId: string;
  variantId: string | null;
  quantity: number;
};

function selKey(menuItemId: string, variantId: string | null) {
  return variantId ? `${menuItemId}:${variantId}` : menuItemId;
}

export default function OrderForm({
  restaurantId,
  menuItems,
}: {
  restaurantId: string;
  menuItems: ItemWithVariants[];
}) {
  const [employeeName, setEmployeeName] = useState("");
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const grouped = new Map<string, ItemWithVariants[]>();
  for (const item of menuItems) {
    const cat = item.category || "أصناف";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }
  const categories = Array.from(grouped.keys());
  const [activeTab, setActiveTab] = useState(categories[0] ?? "");

  function getQty(menuItemId: string, variantId: string | null) {
    return selections[selKey(menuItemId, variantId)]?.quantity ?? 0;
  }

  function setQty(menuItemId: string, variantId: string | null, qty: number) {
    setSelections((prev) => {
      const key = selKey(menuItemId, variantId);
      const next = { ...prev };
      if (qty <= 0) delete next[key];
      else next[key] = { menuItemId, variantId, quantity: qty };
      return next;
    });
  }

  const selectedCount = Object.values(selections).reduce((a, b) => a + b.quantity, 0);

  function catCount(cat: string) {
    const items = grouped.get(cat) ?? [];
    let total = 0;
    for (const item of items) {
      if (item.variants.length > 0) {
        for (const v of item.variants) total += getQty(item.id, v.id);
      } else {
        total += getQty(item.id, null);
      }
    }
    return total;
  }

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

    const orderItems = Object.values(selections).map((sel) => ({
      order_id: order.id,
      menu_item_id: sel.menuItemId,
      quantity: sel.quantity,
      variant_id: sel.variantId,
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

  const activeItems = grouped.get(activeTab) ?? [];

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

      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((cat) => {
            const count = catCount(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveTab(cat)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
                  activeTab === cat
                    ? "bg-orange-500 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {cat}
                {count > 0 && (
                  <span className={`mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                    activeTab === cat ? "bg-white text-orange-500" : "bg-orange-500 text-white"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {activeItems.map((item) => {
          const hasVariants = item.variants.length > 0;

          if (!hasVariants) {
            const qty = getQty(item.id, null);
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
                    <p className="text-sm text-zinc-500">{item.price} ج.م</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQty(item.id, null, qty - 1)}
                    disabled={qty === 0}
                    className="h-8 w-8 rounded-full bg-zinc-100 text-lg font-bold text-zinc-600 disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="w-5 text-center font-semibold">{qty}</span>
                  <button
                    type="button"
                    onClick={() => setQty(item.id, null, qty + 1)}
                    className="h-8 w-8 rounded-full bg-orange-500 text-lg font-bold text-white"
                  >
                    +
                  </button>
                </div>
              </li>
            );
          }

          const anySelected = item.variants.some((v) => getQty(item.id, v.id) > 0);
          return (
            <li
              key={item.id}
              className={`rounded-xl bg-white p-4 ring-1 transition ${
                anySelected ? "ring-orange-400 bg-orange-50" : "ring-zinc-200"
              }`}
            >
              <p className="mb-3 font-semibold">{item.name}</p>
              {item.description && (
                <p className="mb-3 text-sm text-zinc-500">{item.description}</p>
              )}
              <div className="flex flex-wrap gap-3">
                {item.variants.map((v) => {
                  const qty = getQty(item.id, v.id);
                  return (
                    <div
                      key={v.id}
                      className={`flex flex-col items-center gap-1.5 rounded-xl px-3 py-2 ${
                        qty > 0 ? "bg-orange-100" : "bg-zinc-50"
                      }`}
                    >
                      <span className="text-sm font-medium">{v.label}</span>
                      <span className="text-xs text-zinc-500">{v.price} ج.م</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setQty(item.id, v.id, qty - 1)}
                          disabled={qty === 0}
                          className="h-7 w-7 rounded-full bg-zinc-200 text-sm font-bold text-zinc-600 disabled:opacity-40"
                        >
                          −
                        </button>
                        <span className="w-4 text-center text-sm font-semibold">{qty}</span>
                        <button
                          type="button"
                          onClick={() => setQty(item.id, v.id, qty + 1)}
                          className="h-7 w-7 rounded-full bg-orange-500 text-sm font-bold text-white"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
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

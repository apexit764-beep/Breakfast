"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { MenuItem } from "@/lib/types";

export default function MenuManager({ restaurantId }: { restaurantId: string }) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: true });
    if (error) setError(error.message);
    else setItems(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("menu_items").insert({
      restaurant_id: restaurantId,
      name: name.trim(),
      description: description.trim() || null,
      price: price.trim() ? Number(price) : null,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setName("");
    setPrice("");
    setDescription("");
    load();
  }

  async function toggleAvailable(item: MenuItem) {
    await supabase
      .from("menu_items")
      .update({ is_available: !item.is_available })
      .eq("id", item.id);
    load();
  }

  async function removeItem(item: MenuItem) {
    if (!confirm(`حذف "${item.name}" من المنيو؟`)) return;
    await supabase.from("menu_items").delete().eq("id", item.id);
    load();
  }

  return (
    <div>
      <form
        onSubmit={addItem}
        className="mb-8 flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-zinc-200 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-zinc-500">اسم الصنف</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: فول بالدجاج"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
          />
        </div>
        <div className="w-full sm:w-28">
          <label className="mb-1 block text-xs font-medium text-zinc-500">السعر</label>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="اختياري"
            inputMode="decimal"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-zinc-500">وصف (اختياري)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="مكونات الصنف مثلاً"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          إضافة صنف
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-zinc-500">جاري التحميل...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">لا يوجد أصناف بعد، أضف أول صنف من الأعلى.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col justify-between gap-3 rounded-xl bg-white p-4 ring-1 ring-zinc-200 sm:flex-row sm:items-center"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{item.name}</span>
                  {item.price != null && (
                    <span className="text-sm text-zinc-500">{item.price} ج.م</span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      item.is_available
                        ? "bg-green-100 text-green-700"
                        : "bg-zinc-100 text-zinc-500"
                    }`}
                  >
                    {item.is_available ? "متوفر" : "غير متوفر"}
                  </span>
                </div>
                {item.description && (
                  <p className="mt-1 text-sm text-zinc-500">{item.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleAvailable(item)}
                  className="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
                >
                  {item.is_available ? "إخفاء" : "إظهار"}
                </button>
                <button
                  onClick={() => removeItem(item)}
                  className="rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100"
                >
                  حذف
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

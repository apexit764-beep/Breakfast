"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Restaurant } from "@/lib/types";

export default function RestaurantsManager() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("restaurants")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setRestaurants(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function addRestaurant(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("restaurants")
      .insert({ name: name.trim(), description: description.trim() || null });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setName("");
    setDescription("");
    load();
  }

  async function toggleActive(r: Restaurant) {
    await supabase
      .from("restaurants")
      .update({ is_active: !r.is_active })
      .eq("id", r.id);
    load();
  }

  async function removeRestaurant(r: Restaurant) {
    if (!confirm(`متأكد من حذف مطعم "${r.name}"؟ سيتم حذف كل المنيو المرتبط به.`)) return;
    await supabase.from("restaurants").delete().eq("id", r.id);
    load();
  }

  return (
    <div>
      <form
        onSubmit={addRestaurant}
        className="mb-8 flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-zinc-200 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            اسم المطعم
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: مطعم الفرات"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            وصف (اختياري)
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="مثال: فطور شعبي"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          إضافة مطعم
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-zinc-500">جاري التحميل...</p>
      ) : restaurants.length === 0 ? (
        <p className="text-sm text-zinc-500">لا يوجد مطاعم بعد، أضف أول مطعم من الأعلى.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {restaurants.map((r) => (
            <li
              key={r.id}
              className="flex flex-col justify-between gap-3 rounded-xl bg-white p-4 ring-1 ring-zinc-200 sm:flex-row sm:items-center"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{r.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-zinc-100 text-zinc-500"
                    }`}
                  >
                    {r.is_active ? "نشط" : "متوقف"}
                  </span>
                </div>
                {r.description && (
                  <p className="mt-1 text-sm text-zinc-500">{r.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/restaurants?id=${r.id}`}
                  className="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
                >
                  إدارة المنيو
                </Link>
                <button
                  onClick={() => toggleActive(r)}
                  className="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
                >
                  {r.is_active ? "إيقاف" : "تفعيل"}
                </button>
                <button
                  onClick={() => removeRestaurant(r)}
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

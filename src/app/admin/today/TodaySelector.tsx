"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Restaurant } from "@/lib/types";

export default function TodaySelector({ date }: { date: string }) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: restaurantsData }, { data: selections }] = await Promise.all([
      supabase.from("restaurants").select("*").eq("is_active", true).order("name"),
      supabase.from("daily_selections").select("restaurant_id").eq("selection_date", date),
    ]);
    setRestaurants(restaurantsData ?? []);
    setSelectedIds(new Set((selections ?? []).map((s) => s.restaurant_id)));
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function toggle(restaurant: Restaurant) {
    setBusyId(restaurant.id);
    if (selectedIds.has(restaurant.id)) {
      await supabase
        .from("daily_selections")
        .delete()
        .eq("restaurant_id", restaurant.id)
        .eq("selection_date", date);
    } else {
      await supabase
        .from("daily_selections")
        .insert({ restaurant_id: restaurant.id, selection_date: date });
    }
    await load();
    setBusyId(null);
  }

  if (loading) return <p className="text-sm text-zinc-500">جاري التحميل...</p>;

  if (restaurants.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        لا يوجد مطاعم نشطة بعد. أضف مطاعم من صفحة المطاعم أولاً.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {restaurants.map((r) => {
        const selected = selectedIds.has(r.id);
        return (
          <li
            key={r.id}
            className={`flex items-center justify-between rounded-xl bg-white p-4 ring-1 transition ${
              selected ? "ring-orange-400 bg-orange-50" : "ring-zinc-200"
            }`}
          >
            <div>
              <p className="font-semibold">{r.name}</p>
              {r.description && <p className="text-sm text-zinc-500">{r.description}</p>}
            </div>
            <button
              onClick={() => toggle(r)}
              disabled={busyId === r.id}
              className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                selected
                  ? "bg-orange-500 text-white hover:bg-orange-600"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              }`}
            >
              {selected ? "مُختار اليوم ✓" : "اختر لليوم"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

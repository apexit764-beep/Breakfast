"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { todayDateString } from "@/lib/date";

type SelectionRow = {
  restaurant: { id: string; name: string; description: string | null; is_active: boolean } | null;
};

type RestaurantSummary = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

export default function EmployeeHomePage() {
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const date = todayDateString();
    supabase
      .from("daily_selections")
      .select("restaurant:restaurants(id,name,description,is_active)")
      .eq("selection_date", date)
      .then(({ data }) => {
        const rows = (data ?? []) as unknown as SelectionRow[];
        const list = rows
          .map((s) => s.restaurant)
          .filter((r): r is NonNullable<SelectionRow["restaurant"]> => !!r && r.is_active);
        setRestaurants(list);
        setLoading(false);
      });
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <h1 className="mb-1 text-2xl font-bold">فطور اليوم 🍳</h1>
        <p className="mb-8 text-sm text-zinc-500">
          اختر مطعم من اقتراحات اليوم لتشوف المنيو وتسجل طلبك
        </p>

        {loading ? (
          <p className="text-sm text-zinc-500">جاري التحميل...</p>
        ) : restaurants.length === 0 ? (
          <div className="rounded-xl bg-white p-6 text-center ring-1 ring-zinc-200">
            <p className="text-zinc-600">
              لسا ما في مطاعم مقترحة لليوم. تواصل مع الأدمن لإضافة اقتراحات اليوم.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {restaurants.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/order?restaurantId=${r.id}`}
                  className="flex items-center justify-between rounded-xl bg-white p-4 ring-1 ring-zinc-200 transition hover:ring-orange-400"
                >
                  <div>
                    <p className="font-semibold">{r.name}</p>
                    {r.description && (
                      <p className="text-sm text-zinc-500">{r.description}</p>
                    )}
                  </div>
                  <span className="text-orange-500">←</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

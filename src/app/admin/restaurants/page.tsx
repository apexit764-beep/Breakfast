"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRequireAdmin } from "@/lib/useRequireAdmin";
import { supabase } from "@/lib/supabase";
import type { Restaurant } from "@/lib/types";
import MenuManager from "./MenuManager";

function RestaurantMenuContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    supabase
      .from("restaurants")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setRestaurant(data ?? null);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <p className="text-sm text-zinc-500">جاري التحميل...</p>;

  if (!restaurant) {
    return (
      <div>
        <p className="text-sm text-zinc-500">لم يتم العثور على المطعم.</p>
        <Link href="/admin" className="text-orange-600 underline">
          الرجوع للمطاعم
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link href="/admin" className="mb-4 inline-block text-sm text-zinc-500 hover:text-orange-600">
        ← الرجوع للمطاعم
      </Link>
      <h1 className="mb-1 text-2xl font-bold">منيو {restaurant.name}</h1>
      <p className="mb-6 text-sm text-zinc-500">أضف وعدّل الأصناف المتوفرة في هذا المطعم</p>
      <MenuManager restaurantId={restaurant.id} />
    </div>
  );
}

export default function RestaurantMenuPage() {
  const ready = useRequireAdmin();
  if (!ready) return null;

  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">جاري التحميل...</p>}>
      <RestaurantMenuContent />
    </Suspense>
  );
}

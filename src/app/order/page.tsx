"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { MenuItem, Restaurant } from "@/lib/types";
import OrderForm from "./OrderForm";

function OrderPageContent() {
  const searchParams = useSearchParams();
  const restaurantId = searchParams.get("restaurantId");
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    Promise.all([
      supabase.from("restaurants").select("*").eq("id", restaurantId).single(),
      supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("is_available", true)
        .order("created_at", { ascending: true }),
    ]).then(([{ data: restaurantData }, { data: menuData }]) => {
      setRestaurant(restaurantData ?? null);
      setMenuItems(menuData ?? []);
      setLoading(false);
    });
  }, [restaurantId]);

  if (loading) {
    return <p className="text-sm text-zinc-500">جاري التحميل...</p>;
  }

  if (!restaurant) {
    return (
      <>
        <p className="text-sm text-zinc-500">لم يتم العثور على المطعم.</p>
        <Link href="/" className="text-orange-600 underline">
          الرجوع
        </Link>
      </>
    );
  }

  return (
    <div className="w-full max-w-2xl">
      <Link href="/" className="mb-4 inline-block text-sm text-zinc-500 hover:text-orange-600">
        ← الرجوع لاقتراحات اليوم
      </Link>
      <h1 className="mb-1 text-2xl font-bold">{restaurant.name}</h1>
      {restaurant.description && (
        <p className="mb-6 text-sm text-zinc-500">{restaurant.description}</p>
      )}
      <OrderForm restaurantId={restaurant.id} menuItems={menuItems} />
    </div>
  );
}

export default function OrderPage() {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <Suspense fallback={<p className="text-sm text-zinc-500">جاري التحميل...</p>}>
        <OrderPageContent />
      </Suspense>
    </div>
  );
}

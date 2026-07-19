import Link from "next/link";
import { supabase } from "@/lib/supabase";
import OrderForm from "./OrderForm";

export const revalidate = 0;

export default async function OrderPage({
  params,
}: {
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = await params;

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", restaurantId)
    .single();

  const { data: menuItems } = await supabase
    .from("menu_items")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("is_available", true)
    .order("created_at", { ascending: true });

  if (!restaurant) {
    return (
      <div className="flex flex-1 flex-col items-center px-4 py-10">
        <p className="text-sm text-zinc-500">لم يتم العثور على المطعم.</p>
        <Link href="/" className="text-orange-600 underline">
          الرجوع
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <Link href="/" className="mb-4 inline-block text-sm text-zinc-500 hover:text-orange-600">
          ← الرجوع لاقتراحات اليوم
        </Link>
        <h1 className="mb-1 text-2xl font-bold">{restaurant.name}</h1>
        {restaurant.description && (
          <p className="mb-6 text-sm text-zinc-500">{restaurant.description}</p>
        )}
        <OrderForm restaurantId={restaurant.id} menuItems={menuItems ?? []} />
      </div>
    </div>
  );
}

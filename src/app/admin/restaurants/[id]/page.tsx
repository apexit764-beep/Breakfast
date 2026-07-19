import Link from "next/link";
import MenuManager from "./MenuManager";
import { supabase } from "@/lib/supabase";

export default async function RestaurantMenuPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", id)
    .single();

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

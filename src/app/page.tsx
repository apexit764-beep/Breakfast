import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { todayDateString } from "@/lib/date";

export const revalidate = 0;

export default async function EmployeeHomePage() {
  const date = todayDateString();

  type SelectionRow = {
    restaurant: { id: string; name: string; description: string | null; is_active: boolean } | null;
  };

  const { data: selections } = await supabase
    .from("daily_selections")
    .select("restaurant:restaurants(id,name,description,is_active)")
    .eq("selection_date", date);

  const restaurants = ((selections ?? []) as unknown as SelectionRow[])
    .map((s) => s.restaurant)
    .filter((r): r is NonNullable<SelectionRow["restaurant"]> => !!r && r.is_active);

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <h1 className="mb-1 text-2xl font-bold">فطور اليوم 🍳</h1>
        <p className="mb-8 text-sm text-zinc-500">
          اختر مطعم من اقتراحات اليوم لتشوف المنيو وتسجل طلبك
        </p>

        {restaurants.length === 0 ? (
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
                  href={`/order/${r.id}`}
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

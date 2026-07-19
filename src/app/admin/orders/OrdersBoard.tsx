"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type RawOrder = {
  id: string;
  employee_name: string;
  notes: string | null;
  restaurant: { id: string; name: string } | null;
  order_items: {
    quantity: number;
    menu_item: { id: string; name: string; price: number | null } | null;
  }[];
};

type RestaurantGroup = {
  restaurantId: string;
  restaurantName: string;
  employeeCount: number;
  itemTotals: Map<string, { name: string; quantity: number }>;
  employees: { name: string; items: string[]; notes: string | null }[];
};

export default function OrdersBoard({ date }: { date: string }) {
  const [groups, setGroups] = useState<RestaurantGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, employee_name, notes, restaurant:restaurants(id,name), order_items(quantity, menu_item:menu_items(id,name,price))"
      )
      .eq("order_date", date)
      .order("created_at", { ascending: true });

    if (error) {
      setLoading(false);
      return;
    }

    const orders = (data ?? []) as unknown as RawOrder[];
    const byRestaurant = new Map<string, RestaurantGroup>();

    for (const order of orders) {
      if (!order.restaurant) continue;
      const key = order.restaurant.id;
      if (!byRestaurant.has(key)) {
        byRestaurant.set(key, {
          restaurantId: key,
          restaurantName: order.restaurant.name,
          employeeCount: 0,
          itemTotals: new Map(),
          employees: [],
        });
      }
      const group = byRestaurant.get(key)!;
      group.employeeCount += 1;

      const itemNames: string[] = [];
      for (const oi of order.order_items) {
        if (!oi.menu_item) continue;
        itemNames.push(
          oi.quantity > 1 ? `${oi.menu_item.name} ×${oi.quantity}` : oi.menu_item.name
        );
        const existing = group.itemTotals.get(oi.menu_item.id);
        if (existing) existing.quantity += oi.quantity;
        else group.itemTotals.set(oi.menu_item.id, { name: oi.menu_item.name, quantity: oi.quantity });
      }

      group.employees.push({
        name: order.employee_name,
        items: itemNames,
        notes: order.notes,
      });
    }

    setGroups(Array.from(byRestaurant.values()));
    setLastUpdated(new Date());
    setLoading(false);
  }, [date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) return <p className="text-sm text-zinc-500">جاري التحميل...</p>;

  const totalOrders = groups.reduce((sum, g) => sum + g.employeeCount, 0);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          {totalOrders === 0 ? "لا يوجد طلبات بعد" : `إجمالي الطلبات: ${totalOrders}`}
          {lastUpdated && (
            <span className="mr-2">
              (آخر تحديث: {lastUpdated.toLocaleTimeString("ar")})
            </span>
          )}
        </p>
        <button
          onClick={() => load()}
          className="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
        >
          تحديث
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-zinc-500">
          ما في طلبات لليوم لسا. تأكد إنك اخترت مطاعم اليوم من صفحة الاقتراحات.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <div key={g.restaurantId} className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold">{g.restaurantName}</h2>
                <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
                  {g.employeeCount} طلب
                </span>
              </div>

              <div className="mb-4">
                <h3 className="mb-2 text-sm font-semibold text-zinc-600">
                  مجموع الأصناف
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {Array.from(g.itemTotals.values()).map((item) => (
                    <li
                      key={item.name}
                      className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700"
                    >
                      {item.name} × {item.quantity}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-zinc-600">
                  تفاصيل حسب الموظف
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {g.employees.map((emp, idx) => (
                    <li key={idx} className="text-sm text-zinc-700">
                      <span className="font-medium">{emp.name}:</span>{" "}
                      {emp.items.join("، ") || "—"}
                      {emp.notes && (
                        <span className="text-zinc-400"> ({emp.notes})</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

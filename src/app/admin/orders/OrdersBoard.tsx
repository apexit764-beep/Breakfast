"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { DiscountType } from "@/lib/types";

type RawOrder = {
  id: string;
  employee_name: string;
  notes: string | null;
  restaurant: {
    id: string;
    name: string;
    delivery_fee: number;
    service_fee: number;
    discount_type: DiscountType | null;
    discount_value: number;
  } | null;
  order_items: {
    quantity: number;
    menu_item: { id: string; name: string; price: number | null } | null;
  }[];
};

type EmployeeOrder = {
  name: string;
  items: { name: string; quantity: number; price: number; lineTotal: number }[];
  notes: string | null;
  subtotal: number;
};

type RestaurantGroup = {
  restaurantId: string;
  restaurantName: string;
  deliveryFee: number;
  serviceFee: number;
  discountType: DiscountType | null;
  discountValue: number;
  employees: EmployeeOrder[];
  itemTotals: Map<string, { name: string; quantity: number }>;
};

function formatMoney(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export default function OrdersBoard({ date }: { date: string }) {
  const [groups, setGroups] = useState<RestaurantGroup[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, employee_name, notes, restaurant:restaurants(id,name,delivery_fee,service_fee,discount_type,discount_value), order_items(quantity, menu_item:menu_items(id,name,price))"
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
          deliveryFee: order.restaurant.delivery_fee ?? 0,
          serviceFee: order.restaurant.service_fee ?? 0,
          discountType: order.restaurant.discount_type,
          discountValue: order.restaurant.discount_value ?? 0,
          employees: [],
          itemTotals: new Map(),
        });
      }
      const group = byRestaurant.get(key)!;

      const items = [];
      let subtotal = 0;
      for (const oi of order.order_items) {
        if (!oi.menu_item) continue;
        const price = oi.menu_item.price ?? 0;
        const lineTotal = price * oi.quantity;
        subtotal += lineTotal;
        items.push({ name: oi.menu_item.name, quantity: oi.quantity, price, lineTotal });

        const existing = group.itemTotals.get(oi.menu_item.id);
        if (existing) existing.quantity += oi.quantity;
        else group.itemTotals.set(oi.menu_item.id, { name: oi.menu_item.name, quantity: oi.quantity });
      }

      group.employees.push({
        name: order.employee_name,
        items,
        notes: order.notes,
        subtotal,
      });
    }

    const list = Array.from(byRestaurant.values());
    setGroups(list);
    setActiveId((prev) => (prev && list.some((g) => g.restaurantId === prev) ? prev : (list[0]?.restaurantId ?? null)));
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

  const totalOrders = groups.reduce((sum, g) => sum + g.employees.length, 0);
  const active = groups.find((g) => g.restaurantId === activeId) ?? null;

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
        <div>
          <div className="mb-4 flex flex-wrap gap-2 border-b border-zinc-200 pb-3">
            {groups.map((g) => (
              <button
                key={g.restaurantId}
                onClick={() => setActiveId(g.restaurantId)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  g.restaurantId === activeId
                    ? "bg-orange-500 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                {g.restaurantName}
                <span className="mr-1.5 opacity-80">({g.employees.length})</span>
              </button>
            ))}
          </div>

          {active && <RestaurantInvoice group={active} />}
        </div>
      )}
    </div>
  );
}

function RestaurantInvoice({ group }: { group: RestaurantGroup }) {
  const subtotalAll = group.employees.reduce((sum, e) => sum + e.subtotal, 0);
  const discountAmount =
    group.discountType === "percentage"
      ? (subtotalAll * group.discountValue) / 100
      : group.discountType === "fixed"
        ? group.discountValue
        : 0;
  const extraTotal = group.deliveryFee + group.serviceFee - discountAmount;
  const employeeCount = group.employees.length;
  const perPersonExtra = employeeCount > 0 ? extraTotal / employeeCount : 0;
  const grandTotal = subtotalAll + extraTotal;

  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{group.restaurantName}</h2>
        <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
          {employeeCount} طلب
        </span>
      </div>

      <div className="mb-4">
        <h3 className="mb-2 text-sm font-semibold text-zinc-600">مجموع الأصناف (للمطعم)</h3>
        <ul className="flex flex-wrap gap-2">
          {Array.from(group.itemTotals.values()).map((item) => (
            <li
              key={item.name}
              className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700"
            >
              {item.name} × {item.quantity}
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-4">
        <h3 className="mb-2 text-sm font-semibold text-zinc-600">فاتورة كل موظف</h3>
        <ul className="flex flex-col gap-3">
          {group.employees.map((emp, idx) => {
            const total = emp.subtotal + perPersonExtra;
            return (
              <li key={idx} className="rounded-lg border border-zinc-200 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-semibold">{emp.name}</span>
                  <span className="font-bold text-orange-600">{formatMoney(total)} د.أ</span>
                </div>
                <p className="text-sm text-zinc-600">
                  {emp.items
                    .map((it) => (it.quantity > 1 ? `${it.name} ×${it.quantity}` : it.name))
                    .join("، ") || "—"}
                </p>
                {emp.notes && <p className="text-xs text-zinc-400">({emp.notes})</p>}
                <div className="mt-1 flex justify-between text-xs text-zinc-400">
                  <span>قيمة الطلب: {formatMoney(emp.subtotal)} د.أ</span>
                  {extraTotal !== 0 && (
                    <span>
                      نصيبه من التوصيل/الخدمة/الخصم: {perPersonExtra >= 0 ? "+" : ""}
                      {formatMoney(perPersonExtra)} د.أ
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-zinc-200 pt-3 text-sm">
        <div className="flex justify-between text-zinc-600">
          <span>مجموع الطلبات</span>
          <span>{formatMoney(subtotalAll)} د.أ</span>
        </div>
        {group.deliveryFee > 0 && (
          <div className="flex justify-between text-zinc-600">
            <span>رسوم التوصيل</span>
            <span>{formatMoney(group.deliveryFee)} د.أ</span>
          </div>
        )}
        {group.serviceFee > 0 && (
          <div className="flex justify-between text-zinc-600">
            <span>رسوم الخدمة</span>
            <span>{formatMoney(group.serviceFee)} د.أ</span>
          </div>
        )}
        {discountAmount > 0 && (
          <div className="flex justify-between text-green-700">
            <span>
              الخصم {group.discountType === "percentage" ? `(${group.discountValue}%)` : ""}
            </span>
            <span>−{formatMoney(discountAmount)} د.أ</span>
          </div>
        )}
        <div className="mt-1 flex justify-between text-base font-bold text-zinc-900">
          <span>الإجمالي الكلي</span>
          <span>{formatMoney(grandTotal)} د.أ</span>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { DiscountType, Restaurant } from "@/lib/types";

export default function BillingSettings({
  restaurant,
  onSaved,
}: {
  restaurant: Restaurant;
  onSaved: (restaurant: Restaurant) => void;
}) {
  const [deliveryFee, setDeliveryFee] = useState(String(restaurant.delivery_fee ?? 0));
  const [serviceFee, setServiceFee] = useState(String(restaurant.service_fee ?? 0));
  const [discountType, setDiscountType] = useState<DiscountType | "none">(
    restaurant.discount_type ?? "none"
  );
  const [discountValue, setDiscountValue] = useState(String(restaurant.discount_value ?? 0));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    const { data, error } = await supabase
      .from("restaurants")
      .update({
        delivery_fee: Number(deliveryFee) || 0,
        service_fee: Number(serviceFee) || 0,
        discount_type: discountType === "none" ? null : discountType,
        discount_value: discountType === "none" ? 0 : Number(discountValue) || 0,
      })
      .eq("id", restaurant.id)
      .select()
      .single();

    setSaving(false);

    if (error || !data) {
      setError(error?.message ?? "حدث خطأ أثناء الحفظ");
      return;
    }

    onSaved(data);
    setSaved(true);
  }

  return (
    <form
      onSubmit={handleSave}
      className="mb-8 rounded-xl bg-white p-4 ring-1 ring-zinc-200"
    >
      <h2 className="mb-3 text-sm font-semibold text-zinc-700">إعدادات الفاتورة</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            رسوم التوصيل (اختياري)
          </label>
          <input
            value={deliveryFee}
            onChange={(e) => setDeliveryFee(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            رسوم الخدمة (اختياري)
          </label>
          <input
            value={serviceFee}
            onChange={(e) => setServiceFee(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">نوع الخصم</label>
          <select
            value={discountType}
            onChange={(e) => setDiscountType(e.target.value as DiscountType | "none")}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
          >
            <option value="none">بدون خصم</option>
            <option value="percentage">نسبة مئوية</option>
            <option value="fixed">مبلغ ثابت</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            قيمة الخصم {discountType === "percentage" ? "(%)" : "(ج.م)"}
          </label>
          <input
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            disabled={discountType === "none"}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-orange-500 disabled:bg-zinc-50 disabled:text-zinc-400"
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        رسوم التوصيل والخدمة والخصم بتنقسم بالتساوي على كل الموظفين اللي طلبوا من هذا المطعم
        اليوم، وبتنضاف/تنخصم من فاتورة كل واحد منهم.
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {saving ? "جاري الحفظ..." : "حفظ إعدادات الفاتورة"}
        </button>
        {saved && <span className="text-sm text-green-700">تم الحفظ ✓</span>}
      </div>
    </form>
  );
}

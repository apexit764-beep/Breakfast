"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { MenuItem, MenuItemVariant } from "@/lib/types";

type ItemWithVariants = MenuItem & { variants: MenuItemVariant[] };

export default function MenuManager({ restaurantId }: { restaurantId: string }) {
  const [items, setItems] = useState<ItemWithVariants[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [variantItemId, setVariantItemId] = useState<string | null>(null);
  const [variantLabel, setVariantLabel] = useState("");
  const [variantPrice, setVariantPrice] = useState("");
  const [savingVariant, setSavingVariant] = useState(false);

  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const categories = Array.from(new Set(items.map((i) => i.category).filter(Boolean))) as string[];

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("menu_items")
      .select("*, variants:menu_item_variants(*)")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: true });
    if (error) setError(error.message);
    else {
      const rows = (data ?? []) as unknown as ItemWithVariants[];
      for (const row of rows) {
        row.variants = (row.variants ?? []).sort((a, b) => a.sort_order - b.sort_order);
      }
      setItems(rows);
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("menu_items").insert({
      restaurant_id: restaurantId,
      name: name.trim(),
      description: description.trim() || null,
      price: price.trim() ? Number(price) : null,
      category: category.trim() || null,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setName("");
    setPrice("");
    setDescription("");
    load();
  }

  async function toggleAvailable(item: MenuItem) {
    await supabase
      .from("menu_items")
      .update({ is_available: !item.is_available })
      .eq("id", item.id);
    load();
  }

  async function removeItem(item: MenuItem) {
    if (!confirm(`حذف "${item.name}" من المنيو؟`)) return;
    await supabase.from("menu_items").delete().eq("id", item.id);
    load();
  }

  async function addVariant(e: React.FormEvent) {
    e.preventDefault();
    if (!variantItemId || !variantLabel.trim() || !variantPrice.trim()) return;
    setSavingVariant(true);
    const item = items.find((i) => i.id === variantItemId);
    const nextSort = item ? item.variants.length : 0;
    const { error } = await supabase.from("menu_item_variants").insert({
      menu_item_id: variantItemId,
      label: variantLabel.trim(),
      price: Number(variantPrice) || 0,
      sort_order: nextSort,
    });
    setSavingVariant(false);
    if (error) {
      setError(error.message);
      return;
    }
    setVariantLabel("");
    setVariantPrice("");
    load();
  }

  function startEditing(item: ItemWithVariants) {
    setEditingItem(item.id);
    setEditName(item.name);
    setEditPrice(item.price != null ? String(item.price) : "");
    setEditDescription(item.description || "");
    setEditCategory(item.category || "");
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingItem || !editName.trim()) return;
    setSavingEdit(true);
    const { error } = await supabase
      .from("menu_items")
      .update({
        name: editName.trim(),
        price: editPrice.trim() ? Number(editPrice) : null,
        description: editDescription.trim() || null,
        category: editCategory.trim() || null,
      })
      .eq("id", editingItem);
    setSavingEdit(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditingItem(null);
    load();
  }

  async function removeVariant(v: MenuItemVariant) {
    await supabase.from("menu_item_variants").delete().eq("id", v.id);
    load();
  }

  const grouped = new Map<string, ItemWithVariants[]>();
  for (const item of items) {
    const cat = item.category || "بدون تصنيف";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }

  return (
    <div>
      <form
        onSubmit={addItem}
        className="mb-8 rounded-xl bg-white p-4 ring-1 ring-zinc-200"
      >
        <h3 className="mb-3 text-sm font-semibold text-zinc-700">إضافة صنف جديد</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">اسم الصنف</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: فول بالدجاج"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">
              التصنيف
            </label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="مثال: سندوتشات الفول"
              list="categories-list"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
            />
            <datalist id="categories-list">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">
              السعر (إذا بدون خيارات خبز)
            </label>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="اختياري"
              inputMode="decimal"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">وصف (اختياري)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="مكونات الصنف مثلاً"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          إذا كان للصنف خيارات خبز (شامي/بلدي/فينو) بأسعار مختلفة، اتركه بدون سعر وأضف الخيارات بعد الحفظ.
        </p>
        <button
          type="submit"
          disabled={saving}
          className="mt-3 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          إضافة صنف
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-zinc-500">جاري التحميل...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">لا يوجد أصناف بعد، أضف أول صنف من الأعلى.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {Array.from(grouped.entries()).map(([cat, catItems]) => (
            <div key={cat}>
              <h3 className="mb-2 rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-bold text-zinc-700">
                {cat}
                <span className="mr-1 text-xs font-normal text-zinc-400">({catItems.length})</span>
              </h3>
              <ul className="flex flex-col gap-3">
                {catItems.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-xl bg-white p-4 ring-1 ring-zinc-200"
                  >
                    {editingItem === item.id ? (
                      <form onSubmit={saveEdit} className="flex flex-col gap-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-500">اسم الصنف</label>
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-500">التصنيف</label>
                            <input
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value)}
                              list="categories-list"
                              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-500">السعر</label>
                            <input
                              value={editPrice}
                              onChange={(e) => setEditPrice(e.target.value)}
                              inputMode="decimal"
                              placeholder="اختياري"
                              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-500">وصف</label>
                            <input
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              placeholder="اختياري"
                              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-orange-500"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            disabled={savingEdit}
                            className="rounded-lg bg-orange-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                          >
                            حفظ
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingItem(null)}
                            className="rounded-lg bg-zinc-100 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
                          >
                            إلغاء
                          </button>
                        </div>
                      </form>
                    ) : (
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{item.name}</span>
                          {item.variants.length === 0 && item.price != null && (
                            <span className="text-sm text-zinc-500">{item.price} ج.م</span>
                          )}
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              item.is_available
                                ? "bg-green-100 text-green-700"
                                : "bg-zinc-100 text-zinc-500"
                            }`}
                          >
                            {item.is_available ? "متوفر" : "غير متوفر"}
                          </span>
                        </div>
                        {item.description && (
                          <p className="mt-1 text-sm text-zinc-500">{item.description}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => startEditing(item)}
                          className="rounded-lg bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-600 hover:bg-orange-100"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={() => setVariantItemId(variantItemId === item.id ? null : item.id)}
                          className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-100"
                        >
                          {variantItemId === item.id ? "إغلاق" : "خيارات الخبز"}
                        </button>
                        <button
                          onClick={() => toggleAvailable(item)}
                          className="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
                        >
                          {item.is_available ? "إخفاء" : "إظهار"}
                        </button>
                        <button
                          onClick={() => removeItem(item)}
                          className="rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100"
                        >
                          حذف
                        </button>
                      </div>
                    </div>
                    )}

                    {item.variants.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.variants.map((v) => (
                          <span
                            key={v.id}
                            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-800"
                          >
                            {v.label}: {v.price} ج.م
                            <button
                              onClick={() => removeVariant(v)}
                              className="mr-0.5 text-red-400 hover:text-red-600"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {variantItemId === item.id && (
                      <form
                        onSubmit={addVariant}
                        className="mt-3 flex items-end gap-2 border-t border-zinc-100 pt-3"
                      >
                        <div>
                          <label className="mb-1 block text-xs font-medium text-zinc-500">
                            نوع الخبز
                          </label>
                          <input
                            value={variantLabel}
                            onChange={(e) => setVariantLabel(e.target.value)}
                            placeholder="مثال: شامي"
                            className="w-28 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm outline-none focus:border-orange-500"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-zinc-500">
                            السعر
                          </label>
                          <input
                            value={variantPrice}
                            onChange={(e) => setVariantPrice(e.target.value)}
                            placeholder="0"
                            inputMode="decimal"
                            className="w-20 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm outline-none focus:border-orange-500"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={savingVariant}
                          className="rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
                        >
                          إضافة
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

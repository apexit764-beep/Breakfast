"use client";

import { useRequireAdmin } from "@/lib/useRequireAdmin";
import RestaurantsManager from "./RestaurantsManager";

export default function AdminHomePage() {
  const ready = useRequireAdmin();
  if (!ready) return null;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">المطاعم والمنيو</h1>
      <p className="mb-6 text-sm text-zinc-500">
        أضف المطاعم وأدر المنيو الخاص بكل واحد منها
      </p>
      <RestaurantsManager />
    </div>
  );
}

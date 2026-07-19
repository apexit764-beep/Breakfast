import Link from "next/link";
import LogoutButton from "./LogoutButton";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-lg font-bold text-orange-600">
              لوحة التحكم
            </Link>
            <nav className="flex gap-4 text-sm font-medium text-zinc-600">
              <Link href="/admin" className="hover:text-orange-600">
                المطاعم
              </Link>
              <Link href="/admin/today" className="hover:text-orange-600">
                اقتراحات اليوم
              </Link>
              <Link href="/admin/orders" className="hover:text-orange-600">
                طلبات اليوم
              </Link>
            </nav>
          </div>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}

import { Boxes, Database, KeyRound, LogOut } from "lucide-react";
import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { adminLogout, adminMe } from "../api/adminApi";

export function useAdminGuard() {
  return useQuery({
    queryKey: ["admin-me"],
    queryFn: adminMe,
    retry: false
  });
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: adminLogout,
    onSuccess: () => navigate("/admin/login")
  });
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="font-semibold text-slate-900">Artifact Hub</div>
        <nav className="flex items-center gap-1 text-sm">
          <AdminLink to="/admin/sessions" icon={<Boxes size={16} />} label="Sessions" />
          <AdminLink to="/admin/api-keys" icon={<KeyRound size={16} />} label="API Keys" />
          <AdminLink to="/admin/system" icon={<Database size={16} />} label="System" />
          <button className="ml-2 inline-flex items-center gap-2 rounded px-3 py-2 text-slate-600 hover:bg-slate-100" onClick={() => logout.mutate()}>
            <LogOut size={16} /> Logout
          </button>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5">{children}</main>
    </div>
  );
}

function AdminLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `inline-flex items-center gap-2 rounded px-3 py-2 ${isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
    >
      {icon} {label}
    </NavLink>
  );
}

import { useMutation } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminLogin } from "../api/adminApi";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: adminLogin,
    onSuccess: () => navigate("/admin/sessions")
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    login.mutate(password);
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form className="w-full max-w-sm border border-slate-200 bg-white p-6" onSubmit={submit}>
        <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Lock size={20} /> Admin Login
        </div>
        <input
          className="mt-5 h-10 w-full border border-slate-300 px-3 outline-none focus:border-emerald-600"
          type="password"
          value={password}
          placeholder="Admin password"
          onChange={(event) => setPassword(event.target.value)}
        />
        {login.error ? <div className="mt-3 text-sm text-red-700">{login.error.message}</div> : null}
        <button className="mt-4 h-10 w-full bg-slate-900 text-sm font-medium text-white hover:bg-slate-700" disabled={login.isPending}>
          Sign in
        </button>
      </form>
    </div>
  );
}

import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerUser } from "@/lib/tauriCommands";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const getErrorMessage = (err: unknown) =>
  err instanceof Error
    ? err.message
    : typeof err === "string"
      ? err
      : "Could not register account.";

export default function Register() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.sessionToken);
  const signIn = useAuthStore((s) => s.signIn);
  const [form, setForm] = useState({ displayName: "", username: "", email: "", password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);

  const error = useMemo(() => {
    if (form.username.length < 3) return "Username must be at least 3 characters.";
    if (!emailPattern.test(form.email)) return "A valid email is required.";
    if (form.password.length < 8) return "Password must be at least 8 characters.";
    if (form.password !== form.confirmPassword) return "Passwords do not match.";
    return null;
  }, [form]);

  if (token) return <Navigate to="/dashboard" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (error) return;
    setLoading(true);
    try {
      await registerUser(form);
      await signIn(form.email, form.password);
      navigate("/dashboard");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4">
      <motion.form initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onSubmit={onSubmit} className="w-full max-w-md rounded-xl border border-border bg-surface p-6">
        <h1 className="text-center text-2xl font-bold">Quasar</h1>
        <p className="mt-1 text-center text-sm text-muted">Create your account</p>
        <div className="mt-6 space-y-3">
          <Input placeholder="Display Name" value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />
          <Input placeholder="Username" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          <Input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <Input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          <Input type="password" placeholder="Confirm Password" value={form.confirmPassword} onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading || !!error}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Get Started"}
          </Button>
        </div>
        <p className="mt-4 text-center text-sm text-muted">Already registered? <Link className="text-primary" to="/login">Sign in</Link></p>
      </motion.form>
    </div>
  );
}

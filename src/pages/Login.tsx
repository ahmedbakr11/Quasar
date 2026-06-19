import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
const getErrorMessage = (err: unknown) =>
  err instanceof Error
    ? err.message
    : typeof err === "string"
      ? err
      : "Invalid credentials.";

export default function Login() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.sessionToken);
  const signIn = useAuthStore((s) => s.signIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (token) return <Navigate to="/dashboard" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password, rememberMe);
      navigate("/dashboard");
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4">
      <motion.form initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onSubmit={onSubmit} className="w-full max-w-md rounded-xl border border-border bg-surface p-6">
        <h1 className="text-center text-2xl font-bold">Quasar</h1>
        <p className="mt-1 text-center text-sm text-muted">Sign in to continue</p>
        <div className="mt-6 space-y-4">
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-border bg-surfaceAlt accent-primary"
            />
            Remember me
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
          </Button>
        </div>
        <p className="mt-4 text-center text-sm text-muted">No account? <Link className="text-primary" to="/register">Create one</Link></p>
      </motion.form>
    </div>
  );
}

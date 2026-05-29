import { motion } from "framer-motion";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";

export default function Landing() {
  const token = useAuthStore((s) => s.sessionToken);
  if (token) return <Navigate to="/dashboard" replace />;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6">
      {[...Array(4)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-72 w-72 rounded-full blur-3xl"
          style={{
            background: i % 2 === 0 ? "rgba(99,102,241,0.22)" : "rgba(139,92,246,0.18)",
            left: `${10 + i * 22}%`,
            top: `${15 + (i % 2) * 35}%`
          }}
          animate={{ y: [0, -30, 0], x: [0, 20, 0] }}
          transition={{ duration: 10 + i * 2, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 text-center"
      >
        <h1 className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-7xl font-extrabold text-transparent">Quasar</h1>
        <p className="mt-3 text-lg text-muted">Your personal productivity workspace with Luna inside</p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link to="/login"><Button variant="outline">Sign In</Button></Link>
          <Link to="/register"><Button>Get Started</Button></Link>
        </div>
      </motion.div>
    </div>
  );
}

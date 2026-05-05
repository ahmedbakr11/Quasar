import { Minus, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Toaster } from "sonner";
import { AppErrorBoundary } from "@/components/layout/AppErrorBoundary";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import Dashboard from "@/pages/Dashboard";
import Landing from "@/pages/Landing";
import Luna from "@/pages/Luna";
import Login from "@/pages/Login";
import Profile from "@/pages/Profile";
import Register from "@/pages/Register";
import Settings from "@/pages/Settings";
import { useAuthStore } from "@/store/authStore";

function ShellTitleBar() {
  return (
    <header data-tauri-drag-region className="app-drag-region flex items-center justify-between border-b border-border bg-surface px-3">
      <div className="w-20" />
      <div data-tauri-drag-region className="text-sm font-semibold">Luna</div>
      <div className="flex items-center gap-1">
        <button className="rounded p-1 hover:bg-surfaceAlt" onClick={() => getCurrentWindow().minimize()}><Minus size={16} /></button>
        <button className="rounded p-1 hover:bg-red-500/20" onClick={() => getCurrentWindow().close()}><X size={16} /></button>
      </div>
    </header>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const hydrate = useAuthStore((s) => s.hydrate);
  const token = useAuthStore((s) => s.sessionToken);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!token && ["/dashboard", "/profile", "/luna", "/settings"].includes(location.pathname)) {
      navigate("/login", { replace: true });
    }
  }, [location.pathname, navigate, token]);

  return (
    <>
      <ShellTitleBar />
      <AppErrorBoundary>
        <AnimatePresence mode="wait">
          <motion.div key={location.pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Routes location={location}>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/luna" element={<Luna />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </AppErrorBoundary>
      <Toaster richColors position="top-right" />
    </>
  );
}

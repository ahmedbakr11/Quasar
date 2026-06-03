import { Minus, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Suspense, lazy, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Toaster } from "sonner";
import { AppErrorBoundary } from "@/components/layout/AppErrorBoundary";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { Sidebar } from "@/components/layout/Sidebar";
import { SplashScreen } from "@/components/layout/SplashScreen";
import { LunaMiniVisualizer } from "@/components/luna/LunaMiniVisualizer";
import { LunaRuntime } from "@/components/luna/LunaRuntime";
import { useAuthStore } from "@/store/authStore";
import { useRuntimeStore } from "@/store/runtimeStore";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Landing = lazy(() => import("@/pages/Landing"));
const Luna = lazy(() => import("@/pages/Luna"));
const Login = lazy(() => import("@/pages/Login"));
const Notes = lazy(() => import("@/pages/Notes"));
const Profile = lazy(() => import("@/pages/Profile"));
const Register = lazy(() => import("@/pages/Register"));
const Settings = lazy(() => import("@/pages/Settings"));
const Tasks = lazy(() => import("@/pages/Tasks"));

function ShellTitleBar() {
  return (
    <header data-tauri-drag-region className="app-drag-region flex items-center justify-between border-b border-border bg-surface px-3">
      <div className="w-20" />
      <div data-tauri-drag-region className="text-sm font-semibold">Quasar</div>
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
  const startRuntimeListeners = useRuntimeStore((s) => s.startListeners);
  const loadRuntimeStatus = useRuntimeStore((s) => s.loadStatus);
  const [windowLabel] = useState(() => getCurrentWindow().label);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    void startRuntimeListeners();
    void loadRuntimeStatus().catch(() => {
      // Runtime state is best-effort during very early startup.
    });
  }, [loadRuntimeStatus, startRuntimeListeners]);

  useEffect(() => {
    if (!token && ["/dashboard", "/profile", "/luna", "/settings", "/tasks", "/notes"].includes(location.pathname)) {
      navigate("/login", { replace: true });
    }
  }, [location.pathname, navigate, token]);

  if (windowLabel === "splash") {
    return <SplashScreen />;
  }

  const showDock = Boolean(token && ["/dashboard", "/profile", "/luna", "/settings", "/tasks", "/notes"].includes(location.pathname));
  const routeContent = (
    <AnimatePresence mode="wait">
      <motion.div key={location.pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <Suspense fallback={<div className="p-6 text-sm text-muted">Loading...</div>}>
          <Routes location={location}>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/luna" element={<Luna />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/notes" element={<Notes />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );

  return (
    <>
      <ShellTitleBar />
      <AppErrorBoundary>
        {token ? (
          <LunaRuntime>
            {routeContent}
            <LunaMiniVisualizer />
          </LunaRuntime>
        ) : (
          routeContent
        )}
      </AppErrorBoundary>
      {showDock && <Sidebar />}
      <Toaster richColors position="top-right" />
    </>
  );
}

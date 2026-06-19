import { ArrowLeft, ArrowRight, Maximize2, Minus, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Suspense, lazy, useEffect, useState, type PointerEvent } from "react";
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
import { useNoteStore } from "@/store/noteStore";
import { useRuntimeStore } from "@/store/runtimeStore";
import { useTaskStore } from "@/store/taskStore";

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
  const navigate = useNavigate();
  const [forwardAvailable, setForwardAvailable] = useState(false);
  const historyIndex = Number(window.history.state?.idx ?? 0);
  const canGoBack = historyIndex > 0;
  const canGoForward = forwardAvailable;
  const goBack = () => {
    if (!canGoBack) return;
    setForwardAvailable(true);
    navigate(-1);
  };
  const goForward = () => {
    if (!canGoForward) return;
    setForwardAvailable(false);
    navigate(1);
  };
  const handleDragPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.detail > 1) return;
    void getCurrentWindow().startDragging();
  };

  return (
    <header className="app-titlebar">
      <div className="app-window-controls">
        <button className="app-window-button" onClick={goBack} aria-label="Back" disabled={!canGoBack}>
          <ArrowLeft size={15} />
        </button>
        <button className="app-window-button" onClick={goForward} aria-label="Forward" disabled={!canGoForward}>
          <ArrowRight size={15} />
        </button>
      </div>
      <div
        data-tauri-drag-region
        className="app-titlebar-drag"
        onPointerDown={handleDragPointerDown}
      />
      <div className="app-window-controls">
        <button className="app-window-button" onClick={() => getCurrentWindow().minimize()} aria-label="Minimize">
          <Minus size={15} />
        </button>
        <button className="app-window-button" onClick={() => getCurrentWindow().toggleMaximize()} aria-label="Maximize">
          <Maximize2 size={14} />
        </button>
        <button className="app-window-button app-window-button-danger" onClick={() => getCurrentWindow().close()} aria-label="Close">
          <X size={15} />
        </button>
      </div>
    </header>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const hydrate = useAuthStore((s) => s.hydrate);
  const token = useAuthStore((s) => s.sessionToken);
  const authLoading = useAuthStore((s) => s.isLoading);
  const syncNotes = useNoteStore((s) => s.syncNotes);
  const syncTasks = useTaskStore((s) => s.syncTasks);
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
    if (!authLoading && !token && ["/dashboard", "/profile", "/luna", "/settings", "/tasks", "/notes"].includes(location.pathname)) {
      navigate("/login", { replace: true });
    }
  }, [authLoading, location.pathname, navigate, token]);

  useEffect(() => {
    if (!token) return;

    const sync = () => {
      if (document.visibilityState !== "visible") return;
      void syncNotes(token).catch(() => {
        // Silent sync keeps Luna-written notes fresh without interrupting the UI.
      });
      void syncTasks(token).catch(() => {
        // Silent sync keeps Luna-written tasks fresh without interrupting the UI.
      });
    };

    sync();
    const timer = window.setInterval(sync, 1500);
    return () => window.clearInterval(timer);
  }, [syncNotes, syncTasks, token]);

  if (windowLabel === "splash") {
    return <SplashScreen />;
  }

  if (authLoading) {
    return (
      <div className="app-frame">
        <ShellTitleBar />
        <div className="app-content flex items-center justify-center bg-background text-sm text-muted">Opening workspace...</div>
      </div>
    );
  }

  const showDock = Boolean(token && ["/dashboard", "/profile", "/luna", "/settings", "/tasks", "/notes"].includes(location.pathname));
  const routeContent = (
    <AnimatePresence mode="wait">
      <motion.div key={location.pathname} className="h-full min-h-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
    <div className="app-frame">
      <ShellTitleBar />
      <div className="app-content">
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
      </div>
      <Toaster richColors position="top-right" />
    </div>
  );
}

import { File, FileImage, FileText, MousePointer2, Move, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  clearMeshWorkspace,
  deleteMeshAsset,
  listMeshAssets,
  moveMeshAssetToVault,
  saveVaultAsset,
  type VaultAsset
} from "@/lib/tauriCommands";
import { useAuthStore } from "@/store/authStore";

type Tool = "select" | "pan";

type Point = {
  x: number;
  y: number;
};

type MatrixAsset = {
  id: string;
  fileName: string;
  mimeType: string;
  x: number;
  y: number;
  relativePath: string;
  isPersistent: boolean;
};

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.0012;
const WORLD_SIZE = 200000;
const NODE_WIDTH = 88;
const NODE_HEIGHT = 98;
const NODE_GAP = 18;

export function MatrixBoard() {
  const sessionToken = useAuthStore((s) => s.sessionToken);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const marqueeRef = useRef<HTMLDivElement | null>(null);
  const vaultIndicatorRef = useRef<HTMLDivElement | null>(null);
  const isSavingRef = useRef(false);
  const dragAssetRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const dragSelectionOffsetsRef = useRef<Array<{ id: string; offsetX: number; offsetY: number }>>([]);
  const stateRef = useRef({
    scale: 1,
    tx: 0,
    ty: 0,
    tool: "select" as Tool,
    spaceDown: false,
    pointerDown: false,
    pointerId: -1,
    draggingPan: false,
    draggingSelect: false,
    startClient: { x: 0, y: 0 } as Point,
    lastClient: { x: 0, y: 0 } as Point,
    marqueeRect: null as { x: number; y: number; w: number; h: number } | null
  });
  const rafRef = useRef<number | null>(null);
  const [ui, setUi] = useState({
    tool: "select" as Tool,
    zoomPercent: 100
  });
  const [assets, setAssets] = useState<MatrixAsset[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showVaultHole, setShowVaultHole] = useState(false);
  const [holeActive, setHoleActive] = useState(false);
  const [holeConsumePulse, setHoleConsumePulse] = useState(false);

  const syncViewport = () => {
    if (!viewportRef.current) return;
    const { scale, tx, ty } = stateRef.current;
    viewportRef.current.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
  };

  const hint = useMemo(
    () =>
      ui.tool === "pan"
        ? "Pan mode: drag to move. Scroll to zoom."
        : "Select mode: drag to multi-select. Hold Space to pan. Delete removes selected objects.",
    [ui.tool]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const s = stateRef.current;
    s.tx = container.clientWidth / 2 - WORLD_SIZE / 2;
    s.ty = container.clientHeight / 2 - WORLD_SIZE / 2;
    syncViewport();
  }, []);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!sessionToken) return;
    let mounted = true;
    void (async () => {
      try {
        await clearMeshWorkspace(sessionToken);
        const meshAssets = await listMeshAssets(sessionToken);
        if (!mounted) return;
        setAssets(layoutAssets(meshAssets));
      } catch (err) {
        if (err instanceof Error) toast.error(err.message);
      }
    })();
    return () => {
      mounted = false;
      void clearMeshWorkspace(sessionToken);
    };
  }, [sessionToken]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") stateRef.current.spaceDown = true;
      if (event.key === "Delete" && selectedIds.length > 0 && sessionToken) {
        const targets = assets.filter((item) => selectedIds.includes(item.id));
        if (targets.length === 0) return;
        void (async () => {
          try {
            await Promise.all(
              targets.map((target) => deleteMeshAsset({ sessionToken, relativePath: target.relativePath }))
            );
            setAssets((prev) => prev.filter((item) => !selectedIds.includes(item.id)));
            setSelectedIds([]);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to delete object");
          }
        })();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") stateRef.current.spaceDown = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [assets, selectedIds, sessionToken]);

  const queueViewportSync = () => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      syncViewport();
    });
  };

  const setMarquee = (x: number, y: number, w: number, h: number, visible: boolean) => {
    if (!marqueeRef.current) return;
    marqueeRef.current.style.display = visible ? "block" : "none";
    stateRef.current.marqueeRect = visible ? { x, y, w, h } : null;
    if (!visible) return;
    marqueeRef.current.style.left = `${x}px`;
    marqueeRef.current.style.top = `${y}px`;
    marqueeRef.current.style.width = `${w}px`;
    marqueeRef.current.style.height = `${h}px`;
  };

  const clientToWorld = (clientX: number, clientY: number) => {
    const container = containerRef.current;
    const s = stateRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    const x = (clientX - rect.left - s.tx) / s.scale;
    const y = (clientY - rect.top - s.ty) / s.scale;
    return { x, y };
  };

  const onWheel: React.WheelEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const s = stateRef.current;
    const rect = container.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    const worldX = (cx - s.tx) / s.scale;
    const worldY = (cy - s.ty) / s.scale;
    const nextScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s.scale * (1 - event.deltaY * ZOOM_STEP)));
    s.scale = nextScale;
    s.tx = cx - worldX * nextScale;
    s.ty = cy - worldY * nextScale;
    queueViewportSync();
    setUi((prev) => ({ ...prev, zoomPercent: Math.round(nextScale * 100) }));
  };

  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.button !== 0) return;
    const s = stateRef.current;
    s.pointerDown = true;
    s.pointerId = event.pointerId;
    s.startClient = { x: event.clientX, y: event.clientY };
    s.lastClient = { x: event.clientX, y: event.clientY };
    s.draggingPan = s.tool === "pan" || s.spaceDown;
    s.draggingSelect = !s.draggingPan;
    event.currentTarget.setPointerCapture(event.pointerId);

    const target = event.target as HTMLElement;
    const node = target.closest("[data-asset-id]") as HTMLElement | null;
    if (node) {
      const assetId = node.dataset.assetId;
      if (assetId) {
        const isAdditive = event.ctrlKey || event.metaKey;
        const nextSelection = isAdditive
          ? selectedIds.includes(assetId)
            ? selectedIds.filter((id) => id !== assetId)
            : [...selectedIds, assetId]
          : selectedIds.includes(assetId)
            ? selectedIds
            : [assetId];
        setSelectedIds((prev) => {
          if (isAdditive) {
            return prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId];
          }
          return prev.includes(assetId) ? prev : [assetId];
        });
        const world = clientToWorld(event.clientX, event.clientY);
        const found = assets.find((a) => a.id === assetId);
        if (found) {
          dragAssetRef.current = {
            id: assetId,
            offsetX: world.x - found.x,
            offsetY: world.y - found.y
          };
          const groupIds = nextSelection.includes(assetId) ? nextSelection : [assetId];
          dragSelectionOffsetsRef.current = assets
            .filter((item) => groupIds.includes(item.id))
            .map((item) => ({
              id: item.id,
              offsetX: world.x - item.x,
              offsetY: world.y - item.y
            }));
          s.draggingPan = false;
          s.draggingSelect = false;
        }
      }
    } else {
      setSelectedIds([]);
    }
  };

  const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (event) => {
    const s = stateRef.current;
    if (!s.pointerDown || s.pointerId !== event.pointerId) return;
    const dx = event.clientX - s.lastClient.x;
    const dy = event.clientY - s.lastClient.y;
    s.lastClient = { x: event.clientX, y: event.clientY };

    if (dragAssetRef.current) {
      const drag = dragAssetRef.current;
      const world = clientToWorld(event.clientX, event.clientY);
      const nearBottomLeft =
        event.clientX <= 250 &&
        event.clientY >= window.innerHeight - 250;
      if (nearBottomLeft && !holeActive) {
        setHoleConsumePulse(true);
        window.setTimeout(() => setHoleConsumePulse(false), 240);
      }
      setShowVaultHole(nearBottomLeft);
      setHoleActive(nearBottomLeft);
      setAssets((prev) =>
        prev.map((item) => {
          const groupOffset = dragSelectionOffsetsRef.current.find((g) => g.id === item.id);
          if (groupOffset) {
            return { ...item, x: world.x - groupOffset.offsetX, y: world.y - groupOffset.offsetY };
          }
          if (item.id === drag.id) {
            return { ...item, x: world.x - drag.offsetX, y: world.y - drag.offsetY };
          }
          return item;
        })
      );
      return;
    }

    if (s.draggingPan) {
      s.tx += dx;
      s.ty += dy;
      queueViewportSync();
      return;
    }

    if (s.draggingSelect && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x1 = s.startClient.x - rect.left;
      const y1 = s.startClient.y - rect.top;
      const x2 = event.clientX - rect.left;
      const y2 = event.clientY - rect.top;
      setMarquee(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1), true);
    }
  };

  const onPointerUpOrCancel: React.PointerEventHandler<HTMLDivElement> = (event) => {
    const s = stateRef.current;
    if (s.pointerId !== event.pointerId) return;
    const dragTargetId = dragAssetRef.current?.id;
    const draggedGroupIds = dragSelectionOffsetsRef.current.map((g) => g.id);
    const selectionRect = s.marqueeRect;

    s.pointerDown = false;
    s.pointerId = -1;
    s.draggingPan = false;
    s.draggingSelect = false;
    dragAssetRef.current = null;
    dragSelectionOffsetsRef.current = [];
    setHoleActive(false);
    setShowVaultHole(false);
    setMarquee(0, 0, 0, 0, false);

    if (!dragTargetId && selectionRect && selectionRect.w > 4 && selectionRect.h > 4) {
      const hits = findAssetsInMarquee(assets, selectionRect, stateRef.current);
      setSelectedIds(hits.map((h) => h.id));
    }

    if (dragTargetId && vaultIndicatorRef.current && sessionToken) {
      const rect = vaultIndicatorRef.current.getBoundingClientRect();
      const insideVault =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (insideVault) {
        const item = assets.find((a) => a.id === dragTargetId);
        if (item && !item.isPersistent) {
          void (async () => {
            try {
              await moveMeshAssetToVault({ sessionToken, relativePath: item.relativePath });
              setAssets((prev) =>
                prev.filter((asset) => !draggedGroupIds.includes(asset.id))
              );
              setSelectedIds([]);
              toast.success("Object consumed into Vault");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed to move object to Vault");
            }
          })();
        }
      }
    }
  };

  const fileToBase64 = async (file: File): Promise<string> => {
    const buff = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buff);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  };

  const persistFiles = async (files: File[]) => {
    if (!sessionToken || files.length === 0 || isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      const next: MatrixAsset[] = [];
      for (const file of files) {
        const dataBase64 = await fileToBase64(file);
        const saved = await saveVaultAsset({
          sessionToken,
          fileName: file.name || "asset.bin",
          mimeType: file.type || "application/octet-stream",
          dataBase64
        });
        next.push(assetToMatrix(saved, assets.length + next.length));
      }
      setAssets((prev) => [...prev, ...next]);
      if (next.length > 0) toast.success(`${next.length} object(s) added to Mesh`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add files");
    } finally {
      isSavingRef.current = false;
    }
  };

  const readEntryFiles = async (entry: FileSystemEntry): Promise<File[]> => {
    if (entry.isFile) {
      return new Promise((resolve) => {
        (entry as FileSystemFileEntry).file((file) => resolve([file]), () => resolve([]));
      });
    }
    if (entry.isDirectory) {
      const dir = entry as FileSystemDirectoryEntry;
      return new Promise((resolve) => {
        const reader = dir.createReader();
        const out: File[] = [];
        const walk = () => {
          reader.readEntries(async (entries) => {
            if (!entries.length) {
              resolve(out);
              return;
            }
            for (const child of entries) {
              out.push(...(await readEntryFiles(child)));
            }
            walk();
          }, () => resolve(out));
        };
        walk();
      });
    }
    return [];
  };

  const extractDropFiles = async (event: React.DragEvent<HTMLDivElement>): Promise<File[]> => {
    const direct = Array.from(event.dataTransfer.files ?? []);
    const items = Array.from(event.dataTransfer.items ?? []);
    const out = [...direct];
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        out.push(...(await readEntryFiles(entry)));
      } else {
        const file = item.getAsFile();
        if (file) out.push(file);
      }
    }
    const seen = new Set<string>();
    return out.filter((file) => {
      const key = `${file.name}|${file.size}|${file.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    void (async () => {
      const files = await extractDropFiles(event);
      await persistFiles(files);
    })();
  };

  const onPaste: React.ClipboardEventHandler<HTMLDivElement> = (event) => {
    const files = Array.from(event.clipboardData?.files ?? []);
    const items = Array.from(event.clipboardData?.items ?? []);
    const fromItems = items
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const merged = [...files, ...fromItems];
    if (merged.length > 0) {
      event.preventDefault();
      void persistFiles(merged);
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0d]">
      <div className="absolute left-4 top-4 z-20 flex flex-col gap-2 rounded-2xl border border-white/10 bg-[#121216dd] p-2 backdrop-blur-lg">
        <button
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
            ui.tool === "select" ? "bg-indigo-500/25 text-indigo-200" : "text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          )}
          onClick={() => {
            stateRef.current.tool = "select";
            setUi((prev) => ({ ...prev, tool: "select" }));
          }}
          title="Select (drag)"
          aria-label="Select tool"
        >
          <MousePointer2 size={16} />
        </button>
        <button
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
            ui.tool === "pan" ? "bg-indigo-500/25 text-indigo-200" : "text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          )}
          onClick={() => {
            stateRef.current.tool = "pan";
            setUi((prev) => ({ ...prev, tool: "pan" }));
          }}
          title="Pan (drag)"
          aria-label="Pan tool"
        >
          <Move size={16} />
        </button>
        <button
          className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
          onClick={() => {
            const container = containerRef.current;
            stateRef.current.scale = 1;
            if (container) {
              stateRef.current.tx = container.clientWidth / 2 - WORLD_SIZE / 2;
              stateRef.current.ty = container.clientHeight / 2 - WORLD_SIZE / 2;
            } else {
              stateRef.current.tx = 0;
              stateRef.current.ty = 0;
            }
            queueViewportSync();
            setUi((prev) => ({ ...prev, zoomPercent: 100 }));
          }}
          title="Reset view"
          aria-label="Reset view"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      {selectedIds.length > 0 && (
        <button
          className="absolute left-4 top-44 z-30 flex items-center gap-1 rounded-lg border border-rose-300/40 bg-rose-500/15 px-2 py-1 text-xs text-rose-200"
          onClick={() => {
            const targets = assets.filter((item) => selectedIds.includes(item.id));
            if (targets.length === 0 || !sessionToken) return;
            void (async () => {
              try {
                await Promise.all(
                  targets.map((target) => deleteMeshAsset({ sessionToken, relativePath: target.relativePath }))
                );
                setAssets((prev) => prev.filter((item) => !selectedIds.includes(item.id)));
                setSelectedIds([]);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to delete object");
              }
            })();
          }}
        >
          <Trash2 size={13} /> Delete ({selectedIds.length})
        </button>
      )}

      <div className="absolute right-4 top-4 z-20 rounded-xl border border-white/10 bg-[#121216d9] px-3 py-1.5 text-xs text-zinc-300">
        {ui.zoomPercent}% zoom
      </div>

      <div
        ref={vaultIndicatorRef}
          className={cn(
            "pointer-events-none absolute bottom-5 left-5 z-30 flex h-28 w-28 items-center justify-center rounded-full transition-all duration-300",
            showVaultHole ? "scale-100 opacity-100" : "scale-75 opacity-0",
            holeConsumePulse ? "scale-110" : ""
          )}
      >
        <div
          className={cn(
            "absolute h-28 w-28 rounded-full border border-cyan-300/25 bg-[radial-gradient(circle,_#06070d_30%,_#0b1020_55%,_#0b1226_100%)]",
            holeActive ? "animate-pulse shadow-[0_0_32px_rgba(34,211,238,0.5)]" : "shadow-[0_0_16px_rgba(34,211,238,0.2)]"
          )}
        />
        <div className="absolute h-20 w-20 animate-spin rounded-full border border-transparent border-t-cyan-300/45 border-r-indigo-300/35" />
        <div className="absolute h-14 w-14 rounded-full bg-black/80 shadow-[inset_0_0_22px_rgba(0,0,0,0.95)]" />
        <p className="absolute -bottom-6 text-[10px] uppercase tracking-[0.18em] text-cyan-200/80">Vault</p>
      </div>

      <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-xl border border-white/10 bg-[#121216d9] px-3 py-1.5 text-xs text-zinc-300">
        {hint}
      </div>

      <div
        ref={containerRef}
        className="absolute inset-0 touch-none select-none overflow-hidden"
        tabIndex={0}
        onMouseDown={() => containerRef.current?.focus()}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUpOrCancel}
        onPointerCancel={onPointerUpOrCancel}
        onDrop={onDrop}
        onDragOver={(event) => event.preventDefault()}
        onPaste={onPaste}
      >
        <div
          ref={viewportRef}
          className="absolute left-0 top-0 origin-top-left"
          style={{
            transform: "translate3d(0px, 0px, 0) scale(1)",
            width: `${WORLD_SIZE}px`,
            height: `${WORLD_SIZE}px`,
            backgroundImage:
              "radial-gradient(circle at center, rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
            backgroundSize: "28px 28px, 28px 28px, 28px 28px",
            backgroundPosition: "0 0, 0 0, 0 0",
            willChange: "transform"
          }}
        >
          {assets.map((asset) => {
            const kind = getAssetKind(asset.mimeType, asset.fileName);
            const Icon = kind === "image" ? FileImage : kind === "pdf" ? FileText : File;
            return (
              <div
                key={asset.id}
                data-asset-id={asset.id}
                className={cn(
                  "absolute flex cursor-grab flex-col items-center text-center active:cursor-grabbing",
                  "rounded-xl border bg-[#11131aee] p-2 shadow-[0_8px_24px_rgba(0,0,0,0.45)]",
                  selectedIds.includes(asset.id) ? "border-cyan-300/80 ring-1 ring-cyan-300/70" : "border-white/10"
                )}
                style={{
                  left: asset.x,
                  top: asset.y,
                  width: NODE_WIDTH,
                  minHeight: NODE_HEIGHT
                }}
                title={asset.fileName}
                onClick={(event) => {
                  event.stopPropagation();
                  if (event.ctrlKey || event.metaKey) {
                    setSelectedIds((prev) =>
                      prev.includes(asset.id) ? prev.filter((id) => id !== asset.id) : [...prev, asset.id]
                    );
                  } else {
                    setSelectedIds([asset.id]);
                  }
                }}
              >
                <div
                  className={cn(
                    "mb-1 flex h-11 w-11 items-center justify-center rounded-lg border",
                    kind === "image"
                      ? "border-cyan-400/35 bg-cyan-500/15 text-cyan-200"
                      : kind === "pdf"
                        ? "border-fuchsia-400/35 bg-fuchsia-500/15 text-fuchsia-200"
                        : "border-indigo-400/35 bg-indigo-500/15 text-indigo-200"
                  )}
                >
                  <Icon size={22} />
                </div>
                <p className="line-clamp-2 w-full break-words text-[11px] text-zinc-200">{asset.fileName}</p>
              </div>
            );
          })}
        </div>
        <div
          ref={marqueeRef}
          className="pointer-events-none absolute hidden border border-indigo-300/70 bg-indigo-500/15"
        />
      </div>
    </div>
  );
}

function getAssetKind(mimeType: string, fileName: string): "image" | "pdf" | "file" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) return "pdf";
  return "file";
}

function assetToMatrix(asset: VaultAsset, idx: number): MatrixAsset {
  const col = idx % 6;
  const row = Math.floor(idx / 6);
  return {
    id: asset.id,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    x: WORLD_SIZE / 2 - 350 + col * (NODE_WIDTH + NODE_GAP),
    y: WORLD_SIZE / 2 - 260 + row * (NODE_HEIGHT + NODE_GAP),
    relativePath: asset.relativePath,
    isPersistent: asset.isPersistent
  };
}

function layoutAssets(items: VaultAsset[]): MatrixAsset[] {
  return items.map((item, idx) => assetToMatrix(item, idx));
}

function findAssetsInMarquee(
  assets: MatrixAsset[],
  marquee: { x: number; y: number; w: number; h: number },
  view: { tx: number; ty: number; scale: number }
): MatrixAsset[] {
  const mx2 = marquee.x + marquee.w;
  const my2 = marquee.y + marquee.h;
  const hits: MatrixAsset[] = [];
  for (const asset of assets) {
    const ax = asset.x * view.scale + view.tx;
    const ay = asset.y * view.scale + view.ty;
    const aw = NODE_WIDTH * view.scale;
    const ah = NODE_HEIGHT * view.scale;
    const ax2 = ax + aw;
    const ay2 = ay + ah;
    const intersects = ax < mx2 && ax2 > marquee.x && ay < my2 && ay2 > marquee.y;
    if (intersects) hits.push(asset);
  }
  return hits;
}

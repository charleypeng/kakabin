import { useRef, useEffect, useCallback, useState } from "react";
import { getCurrentWindow, cursorPosition } from "@tauri-apps/api/window";
import { BlackHoleCanvas, BlackHoleHandle } from "./components/BlackHoleCanvas";
import { listen } from "@tauri-apps/api/event";
import { openTrash, moveToTrash, emptyTrash, showContextMenu } from "./lib/trashApi";
import { useDropZone, DropPayload } from "./hooks/useDropZone";
import { useTrashState } from "./hooks/useTrashState";

export default function App() {
  const bh = useRef<BlackHoleHandle>(null);
  const [toast, setToast] = useState<string | null>(null);
  const agitRef = useRef(0);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleDrop = useCallback(
    (d: DropPayload) => {
      const perFile = Math.min(200, Math.max(60, 600 / d.paths.length));
      bh.current?.burst(d.x, d.y, Math.round(perFile) * d.paths.length);
      moveToTrash(d.paths)
        .then((results) => {
          const failed = results.filter((r) => !r.ok);
          if (failed.length > 0) {
            showToast(`${failed.length} 项无法移入垃圾桶: ${failed[0].error ?? ""}`);
            bh.current?.burst(d.x, d.y, 80);
          }
        })
        .catch((e) => showToast(String(e)));
    },
    [showToast]
  );

  const phase = useDropZone(handleDrop);

  useEffect(() => {
    const target = phase === "hover" ? 1 : 0;
    const id = setInterval(() => {
      agitRef.current += (target - agitRef.current) * 0.15;
      bh.current?.setAgitation(agitRef.current);
    }, 16);
    return () => clearInterval(id);
  }, [phase]);

  const trashCount = useTrashState();

  useEffect(() => {
    bh.current?.setFullness(Math.min(trashCount / 50, 1));
  }, [trashCount]);

  useEffect(() => {
    function onContext(e: MouseEvent) {
      e.preventDefault();
      showContextMenu().catch(console.error);
    }
    window.addEventListener("contextmenu", onContext);
    const unlisten1 = listen<() => void>("menu://empty-trash", () => {
      bh.current?.evaporate();
      setTimeout(() => emptyTrash().catch((e) => showToast(String(e))), 800);
    });
    const unlisten2 = listen<string>("menu://about", (event) => {
      showToast(event.payload);
    });
    return () => {
      window.removeEventListener("contextmenu", onContext);
      unlisten1.then((f) => f());
      unlisten2.then((f) => f());
    };
  }, [showToast]);

  // 轮询系统光标位置驱动悬停交互：不依赖 DOM mousemove 事件，
  // 窗口未激活（点击过其他窗口）时划过黑洞同样立即有动效。
  useEffect(() => {
    let cancelled = false;
    const win = getCurrentWindow();
    let scale = 1;
    win.scaleFactor().then((s) => { scale = s; }).catch(() => {});
    async function tick() {
      if (cancelled) return;
      try {
        const [cursor, origin] = await Promise.all([cursorPosition(), win.outerPosition()]);
        const w = window.innerWidth;
        const h = window.innerHeight;
        const m = Math.min(w, h);
        const lx = (cursor.x - origin.x) / scale;
        const ly = (cursor.y - origin.y) / scale;
        const nx = (lx * 2 - w) / m;
        const ny = -(ly * 2 - h) / m;
        // 只在圆形 widget 本体内响应；透明四角让鼠标穿透给下层窗口
        if (lx >= 0 && lx <= w && ly >= 0 && ly <= h && Math.hypot(nx, ny) <= 1.0) {
          bh.current?.setCursor(nx, ny, true);
        } else {
          bh.current?.setCursor(0, 0, false);
        }
      } catch {
        /* 窗口已关闭等情况静默 */
      }
      setTimeout(tick, 16);
    }
    tick();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (e.button === 0) getCurrentWindow().startDragging().catch(console.error);
    }
    function onDblClick() {
      openTrash().catch(console.error);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("dblclick", onDblClick);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("dblclick", onDblClick);
    };
  }, []);

  return (
    <div style={{ width: "100%", height: "100%" }} data-tauri-drag-region>
      <BlackHoleCanvas ref={bh} />
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 12,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(20,20,20,0.85)",
            color: "#ffb0a0",
            fontSize: 12,
            padding: "6px 12px",
            borderRadius: 8,
            pointerEvents: "none",
            maxWidth: "80%",
            whiteSpace: "pre-line",
            textAlign: "center",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

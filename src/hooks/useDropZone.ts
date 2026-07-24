import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { DragPhase, DragEvent, reduceDragEvent } from "../lib/dropState";

export interface DropPayload {
  paths: string[];
  x: number;
  y: number;
}

export function useDropZone(onDrop: (d: DropPayload) => void) {
  const [phase, setPhase] = useState<DragPhase>("idle");
  const phaseRef = useRef<DragPhase>("idle");
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      const p = event.payload;
      let ev: DragEvent | null = null;
      if (p.type === "enter") {
        ev = { type: "enter", paths: p.paths, x: p.position.x, y: p.position.y };
      } else if (p.type === "over") {
        ev = { type: "over", x: p.position.x, y: p.position.y };
      } else if (p.type === "drop") {
        ev = { type: "drop", paths: p.paths, x: p.position.x, y: p.position.y };
      } else if (p.type === "leave") {
        ev = { type: "leave" };
      }
      if (!ev) return;
      const r = reduceDragEvent(phaseRef.current, ev);
      phaseRef.current = r.phase;
      setPhase(r.phase);
      if (r.drop) {
        const m = Math.min(window.innerWidth, window.innerHeight);
        onDropRef.current({
          paths: r.drop.paths,
          x: (r.drop.x * 2 - window.innerWidth) / m,
          y: -(r.drop.y * 2 - window.innerHeight) / m,
        });
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  return phase;
}

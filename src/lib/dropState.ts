export type DragPhase = "idle" | "hover";

export type DragEvent =
  | { type: "enter"; paths: string[]; x: number; y: number }
  | { type: "over"; x: number; y: number }
  | { type: "drop"; paths: string[]; x: number; y: number }
  | { type: "leave" };

export interface ReduceResult {
  phase: DragPhase;
  drop: { paths: string[]; x: number; y: number } | null;
}

export function reduceDragEvent(_phase: DragPhase, ev: DragEvent): ReduceResult {
  switch (ev.type) {
    case "enter":
    case "over":
      return { phase: "hover", drop: null };
    case "leave":
      return { phase: "idle", drop: null };
    case "drop":
      return { phase: "idle", drop: { paths: ev.paths, x: ev.x, y: ev.y } };
  }
}

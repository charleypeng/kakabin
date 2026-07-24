import { describe, it, expect } from "vitest";
import { reduceDragEvent } from "../src/lib/dropState";

describe("reduceDragEvent", () => {
  it("enter/over 进入 hover", () => {
    expect(reduceDragEvent("idle", { type: "enter", paths: ["/a"], x: 1, y: 2 }).phase).toBe("hover");
    expect(reduceDragEvent("hover", { type: "over", x: 1, y: 2 }).phase).toBe("hover");
  });
  it("leave 回到 idle，无 drop", () => {
    const r = reduceDragEvent("hover", { type: "leave" });
    expect(r.phase).toBe("idle");
    expect(r.drop).toBeNull();
  });
  it("drop 产出路径并回到 idle", () => {
    const r = reduceDragEvent("hover", { type: "drop", paths: ["/a", "/b"], x: 10, y: 20 });
    expect(r.phase).toBe("idle");
    expect(r.drop).toEqual({ paths: ["/a", "/b"], x: 10, y: 20 });
  });
});

import { describe, it, expect } from "vitest";
import { orbitStep, spawnParticle } from "../src/lib/orbit";

describe("orbit", () => {
  it("半径单调收缩直至坠入视界后死亡", () => {
    let p = spawnParticle(0.9, 0);
    const radii: number[] = [];
    for (let i = 0; i < 5000 && p.alive; i++) {
      p = orbitStep(p, 1 / 60);
      radii.push(p.r);
    }
    expect(p.alive).toBe(false);
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]).toBeLessThanOrEqual(radii[i - 1] + 1e-9);
    }
  });
  it("角速度随坠落增加（撕裂加速感）", () => {
    let p = spawnParticle(0.9, 0);
    const w0 = p.vtheta / p.r;
    for (let i = 0; i < 60; i++) p = orbitStep(p, 1 / 60);
    const w1 = p.vtheta / p.r;
    expect(w1).toBeGreaterThan(w0);
  });
  it("spawn 保持初始角度与半径", () => {
    const p = spawnParticle(0.5, Math.PI / 2);
    expect(p.r).toBe(0.5);
    expect(p.theta).toBeCloseTo(Math.PI / 2);
    expect(p.alive).toBe(true);
  });
});

import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import * as THREE from "three";
import { BLACK_HOLE_VERT, BLACK_HOLE_FRAG } from "../shaders/blackhole";
import { PARTICLE_VERT, PARTICLE_FRAG } from "../shaders/particles";
import { spawnParticle, orbitStep, OrbitalParticle, HORIZON_R } from "../lib/orbit";

export interface BlackHoleHandle {
  setCursor(x: number, y: number, on: boolean): void;
  setAgitation(v: number): void;
  setFullness(v: number): void;
  evaporate(): void;
  burst(x: number, y: number, count: number): void;
}

export const BlackHoleCanvas = forwardRef<BlackHoleHandle>(function BlackHoleCanvas(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uniformsRef = useRef<Record<string, THREE.IUniform> | null>(null);
  const evapRef = useRef({ active: false, t: 0 });
  const spawnBurstRef = useRef<(x: number, y: number, count: number) => void>(() => {});

  useImperativeHandle(ref, () => ({
    setCursor(x, y, on) {
      const u = uniformsRef.current;
      if (!u) return;
      (u.uCursor.value as THREE.Vector2).set(x, y);
      u.uCursorOn.value = on ? 1 : 0;
    },
    setAgitation(v) {
      const u = uniformsRef.current;
      if (u) u.uAgitation.value = v;
    },
    setFullness(v) {
      const u = uniformsRef.current;
      if (u) u.uFullness.value = v;
    },
    evaporate() {
      evapRef.current = { active: true, t: 0 };
    },
    burst(x, y, count) {
      spawnBurstRef.current(x, y, count);
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const uniforms: Record<string, THREE.IUniform> = {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uCursor: { value: new THREE.Vector2(0, 0) },
      uCursorOn: { value: 0 },
      uAgitation: { value: 0 },
      uFullness: { value: 0.3 },
      uEvaporate: { value: 0 },
    };
    uniformsRef.current = uniforms;

    const mat = new THREE.ShaderMaterial({
      vertexShader: BLACK_HOLE_VERT,
      fragmentShader: BLACK_HOLE_FRAG,
      uniforms,
      transparent: true,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    scene.add(quad);

    const MAX_P = 4000;
    const positions = new Float32Array(MAX_P * 3);
    const sizes = new Float32Array(MAX_P);
    const colors = new Float32Array(MAX_P * 3);
    const angles = new Float32Array(MAX_P);
    const particles: (OrbitalParticle & { size: number; heat: number })[] = [];

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aAngle", new THREE.BufferAttribute(angles, 1));
    const pMat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, pMat);
    points.frustumCulled = false;
    scene.add(points);

    spawnBurstRef.current = (x, y, count) => {
      const r0 = Math.max(Math.hypot(x, y), 0.45);
      const baseTheta = Math.atan2(y, x);
      for (let i = 0; i < count && particles.length < MAX_P; i++) {
        const jitter = (Math.random() - 0.5) * 0.4;
        const p = spawnParticle(
          r0 * (0.9 + Math.random() * 0.2),
          baseTheta + jitter
        );
        particles.push({ ...p, size: 3 + Math.random() * 5, heat: 1 });
      }
    };

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      (uniforms.uResolution.value as THREE.Vector2).set(
        w * renderer.getPixelRatio(),
        h * renderer.getPixelRatio()
      );
    }
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    const clock = new THREE.Clock();
    function loop() {
      const dt = clock.getDelta();
      uniforms.uTime.value += dt;
      const ev = evapRef.current;
      if (ev.active) {
        ev.t += dt / 1.6;
        if (ev.t >= 1) {
          ev.active = false;
          uniforms.uEvaporate.value = 0;
        } else {
          uniforms.uEvaporate.value = ev.t < 0.5 ? ev.t * 2 : (1 - ev.t) * 2;
        }
      }
      let alive = 0;
      for (let i = 0; i < particles.length; i++) {
        const prev = particles[i];
        const p = orbitStep(prev, Math.min(dt, 0.05));
        particles[i] = { ...p, size: prev.size, heat: prev.heat };
        if (!p.alive) continue;
        const px = p.r * Math.cos(p.theta);
        // 压扁率匹配 shader 相机俯仰（~7°），粒子贴着近侧视吸积盘平面转
        const py = p.r * Math.sin(p.theta) * 0.12;
        positions[alive * 3] = px;
        positions[alive * 3 + 1] = py;
        positions[alive * 3 + 2] = 0;
        const t = Math.min(Math.max((p.r - HORIZON_R) / 0.7, 0), 1);
        // 引力红移：靠近视界时颜色转红且整体变暗
        const dim = 0.12 + 0.88 * t * t;
        colors[alive * 3] = 1.0 * dim;
        colors[alive * 3 + 1] = (0.35 + 0.6 * t) * dim;
        colors[alive * 3 + 2] = (0.15 + 0.75 * t * t) * dim;
        // 潮汐拉伸：越靠近视界拉得越长
        sizes[alive] = prev.size * (1.0 + (1 - t) * 2.5);
        angles[alive] = Math.atan2(py, px) + Math.PI / 2;
        alive++;
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        if (!particles[i].alive) particles.splice(i, 1);
      }
      geo.setDrawRange(0, alive);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aColor.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aAngle.needsUpdate = true;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    }
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      renderer.dispose();
      mat.dispose();
      quad.geometry.dispose();
      geo.dispose();
      pMat.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} data-tauri-drag-region style={{ width: "100%", height: "100%", display: "block" }} />;
});

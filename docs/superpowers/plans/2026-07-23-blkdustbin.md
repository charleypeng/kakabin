# BlkDustBin 黑洞垃圾桶 Widget 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个跨平台（macOS/Windows/Linux）Tauri 2 桌面 widget：圆形透明窗口中的 WebGL 黑洞，绑定系统垃圾桶，支持多文件/文件夹拖拽吸入并播放引力撕裂动效。

**Architecture:** Tauri 2 Rust 后端暴露 trash commands（`trash` crate + 平台分派）；React + three.js 前端用全屏 quad raymarching shader 渲染黑洞，GPU 粒子系统表现文件吸入；所有 shader 与代码均为本项目原创。

**Tech Stack:** Tauri 2, Rust (trash crate), React 18, TypeScript, three.js, Vite, Vitest, cargo test

**Spec:** `docs/superpowers/specs/2026-07-23-blkdustbin-design.md`

---

## 文件结构

```
package.json, tsconfig.json, vite.config.ts, index.html, .gitignore
src-tauri/
  Cargo.toml, build.rs, tauri.conf.json
  capabilities/default.json
  src/lib.rs            # commands + menu + window level 状态
  src/trash_ops.rs      # 平台分派的 trash 实现（纯逻辑可测）
  src/main.rs
src/
  main.tsx, App.tsx, index.css
  lib/dropState.ts      # 拖拽状态机（纯函数）
  lib/orbit.ts          # 粒子轨道积分（纯函数）
  lib/trashApi.ts       # invoke 封装
  hooks/useDropZone.ts  # Tauri drag-drop 事件 → 状态机
  hooks/useTrashState.ts# 轮询垃圾桶数量
  components/BlackHoleCanvas.tsx  # three 渲染器 + shader quad + 粒子层
  shaders/blackhole.ts  # 黑洞 raymarching GLSL（模板字符串）
  shaders/particles.ts  # 粒子 GLSL
test/
  dropState.test.ts, orbit.test.ts
```

---

### Task 1: 项目脚手架

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`
- Create: `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`

- [ ] **Step 1: 写前端配置文件**

`package.json`:
```json
{
  "name": "blkdustbin",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest run",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.1.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "three": "^0.170.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.1.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@types/three": "^0.170.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.3",
    "vite": "^6.0.3",
    "vitest": "^2.1.8"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "test"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
  build: { target: "es2022" },
});
```

`index.html`:
```html
<!doctype html>
<html lang="zh">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BlkDustBin</title>
    <style>html,body,#root{margin:0;padding:0;width:100%;height:100%;background:transparent;overflow:hidden}</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`.gitignore`:
```
node_modules
dist
src-tauri/target
.DS_Store
```

- [ ] **Step 2: 写 Tauri 后端骨架**

`src-tauri/Cargo.toml`:
```toml
[package]
name = "blkdustbin"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["macos-private-api"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
trash = "5"

[target.'cfg(target_os = "windows")'.dependencies]
windows = { version = "0.58", features = ["Win32_UI_Shell", "Win32_Foundation"] }
```

`src-tauri/build.rs`:
```rust
fn main() {
    tauri_build::build()
}
```

`src-tauri/tauri.conf.json`:
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "BlkDustBin",
  "version": "0.1.0",
  "identifier": "dev.blkdustbin.app",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "macOSPrivateApi": true,
    "windows": [
      {
        "label": "main",
        "width": 320,
        "height": 320,
        "minWidth": 200,
        "minHeight": 200,
        "decorations": false,
        "transparent": true,
        "alwaysOnTop": true,
        "resizable": true,
        "skipTaskbar": true,
        "dragDropEnabled": true
      }
    ],
    "security": { "csp": null }
  },
  "bundle": { "active": true, "targets": "all", "icon": [] }
}
```

`src-tauri/capabilities/default.json`:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "default window permissions",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:event:default",
    "core:window:default",
    "core:webview:default",
    "core:menu:default"
  ]
}
```

`src-tauri/src/main.rs`:
```rust
fn main() {
    blkdustbin_lib::run()
}
```

`src-tauri/src/lib.rs`（临时骨架，Task 2 填充 commands）:
```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running BlkDustBin");
}
```

注意：Cargo package 名为 `blkdustbin`，lib 名默认为 `blkdustbin`，与二进制同名会冲突——在 `Cargo.toml` 加：
```toml
[lib]
name = "blkdustbin_lib"
crate-type = ["staticlib", "cdylib", "rlib"]
```

- [ ] **Step 3: 安装依赖并验证 dev 启动**

Run: `npm install && npm run tauri dev`
Expected: 编译完成后弹出一个 320×320 无边框透明窗口（空白但可见阴影/可调取 devtools）。Ctrl+C 退出。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Tauri 2 + React + three.js project"
```

---

### Task 2: Rust trash 后端（commands + 平台分派）

**Files:**
- Create: `src-tauri/src/trash_ops.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 写失败测试（纯逻辑部分）**

在 `src-tauri/src/trash_ops.rs` 底部先写测试（实现暂缺，先创建空文件会导致编译错，直接同一步写全）：

`src-tauri/src/trash_ops.rs` 完整内容（实现 + 测试）：
```rust
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Serialize, Clone)]
pub struct TrashItemResult {
    pub path: String,
    pub ok: bool,
    pub error: Option<String>,
}

/// 归一化拖拽路径：去空、去重、保留存在的路径；不存在的路径标记为错误结果。
pub fn normalize_paths(paths: Vec<String>) -> (Vec<PathBuf>, Vec<TrashItemResult>) {
    let mut seen = std::collections::HashSet::new();
    let mut valid = Vec::new();
    let mut invalid = Vec::new();
    for p in paths {
        let trimmed = p.trim();
        if trimmed.is_empty() || !seen.insert(trimmed.to_string()) {
            continue;
        }
        let pb = PathBuf::from(trimmed);
        if pb.exists() {
            valid.push(pb);
        } else {
            invalid.push(TrashItemResult {
                path: trimmed.to_string(),
                ok: false,
                error: Some("路径不存在".to_string()),
            });
        }
    }
    (valid, invalid)
}

/// 批量移入系统垃圾桶，逐项返回结果。
pub fn trash_all(paths: Vec<String>) -> Vec<TrashItemResult> {
    let (valid, mut results) = normalize_paths(paths);
    for pb in valid {
        let display = pb.display().to_string();
        match trash::delete(&pb) {
            Ok(_) => results.push(TrashItemResult { path: display, ok: true, error: None }),
            Err(e) => results.push(TrashItemResult {
                path: display,
                ok: false,
                error: Some(e.to_string()),
            }),
        }
    }
    results
}

pub fn open_trash() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let cmd = std::process::Command::new("open").arg(dirs_home_trash()).spawn();
    #[cfg(target_os = "windows")]
    let cmd = std::process::Command::new("explorer.exe")
        .arg("shell:RecycleBinFolder")
        .spawn();
    #[cfg(target_os = "linux")]
    let cmd = std::process::Command::new("xdg-open")
        .arg("trash:///")
        .spawn()
        .or_else(|_| std::process::Command::new("xdg-open").arg(dirs_home_trash()).spawn());
    cmd.map(|_| ()).map_err(|e| e.to_string())
}

fn dirs_home_trash() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".Trash")
    }
    #[cfg(target_os = "linux")]
    {
        PathBuf::from(std::env::var("HOME").unwrap_or_default())
            .join(".local/share/Trash/files")
    }
    #[cfg(target_os = "windows")]
    {
        PathBuf::new()
    }
}

pub fn empty_trash() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("osascript")
            .arg("-e")
            .arg("tell application \"Finder\" to empty the trash")
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() { Ok(()) } else { Err("Finder 清空失败".into()) }
    }
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::Shell::{SHEmptyRecycleBinW, SHERB_FLAGS};
        unsafe {
            SHEmptyRecycleBinW(None, None, SHERB_FLAGS(0))
                .map_err(|e| e.to_string())
        }
    }
    #[cfg(target_os = "linux")]
    {
        let base = PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".local/share/Trash");
        for sub in ["files", "info"] {
            let dir = base.join(sub);
            if dir.exists() {
                for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
                    let entry = entry.map_err(|e| e.to_string())?;
                    let p = entry.path();
                    if p.is_dir() {
                        std::fs::remove_dir_all(&p).map_err(|e| e.to_string())?;
                    } else {
                        std::fs::remove_file(&p).map_err(|e| e.to_string())?;
                    }
                }
            }
        }
        Ok(())
    }
}

pub fn trash_count() -> usize {
    #[cfg(target_os = "macos")]
    {
        let dir = dirs_home_trash();
        std::fs::read_dir(dir).map(|d| d.filter(|e| {
            e.as_ref().map(|x| x.file_name().to_string_lossy() != ".DS_Store").unwrap_or(false)
        }).count()).unwrap_or(0)
    }
    #[cfg(target_os = "linux")]
    {
        let dir = dirs_home_trash();
        std::fs::read_dir(dir).map(|d| d.count()).unwrap_or(0)
    }
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::Shell::{SHQueryRecycleBinW, SHQUERYRBINFO};
        let mut info = SHQUERYRBINFO {
            cbSize: std::mem::size_of::<SHQUERYRBINFO>() as u32,
            ..Default::default()
        };
        unsafe {
            match SHQueryRecycleBinW(None, &mut info) {
                Ok(_) => info.i64NumItems as usize,
                Err(_) => 0,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_dedups_and_filters_empty() {
        let tmp = std::env::temp_dir().join("blkdustbin_test_file");
        std::fs::write(&tmp, b"x").unwrap();
        let (valid, invalid) = normalize_paths(vec![
            tmp.display().to_string(),
            tmp.display().to_string(),
            "  ".to_string(),
        ]);
        assert_eq!(valid.len(), 1);
        assert_eq!(invalid.len(), 0);
        std::fs::remove_file(&tmp).unwrap();
    }

    #[test]
    fn normalize_marks_missing_path_invalid() {
        let (valid, invalid) = normalize_paths(vec!["/definitely/not/here.xyz".to_string()]);
        assert_eq!(valid.len(), 0);
        assert_eq!(invalid.len(), 1);
        assert!(!invalid[0].ok);
        assert!(invalid[0].error.is_some());
    }

    #[test]
    #[ignore]
    fn trash_all_moves_real_file_to_system_trash() {
        // 集成测试：会真实操作系统垃圾桶，手动运行 `cargo test -- --ignored`
        let tmp = std::env::temp_dir().join("blkdustbin_trash_it.txt");
        std::fs::write(&tmp, b"bye").unwrap();
        let results = trash_all(vec![tmp.display().to_string()]);
        assert!(results.iter().any(|r| r.ok));
        assert!(!tmp.exists());
    }
}
```

- [ ] **Step 2: 注册 commands 到 lib.rs**

`src-tauri/src/lib.rs` 完整替换为：
```rust
mod trash_ops;

use std::sync::atomic::{AtomicBool, Ordering};

static FLOATING: AtomicBool = AtomicBool::new(true);

#[tauri::command]
async fn move_to_trash(paths: Vec<String>) -> Vec<trash_ops::TrashItemResult> {
    tauri::async_runtime::spawn_blocking(move || trash_ops::trash_all(paths))
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn open_trash() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(trash_ops::open_trash)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn empty_trash() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(trash_ops::empty_trash)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn get_trash_count() -> usize {
    trash_ops::trash_count()
}

#[tauri::command]
fn toggle_window_level(window: tauri::WebviewWindow) {
    let floating = !FLOATING.load(Ordering::SeqCst);
    FLOATING.store(floating, Ordering::SeqCst);
    let _ = window.set_always_on_top(floating);
    let _ = window.set_always_on_bottom(!floating);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            move_to_trash,
            open_trash,
            empty_trash,
            get_trash_count,
            toggle_window_level
        ])
        .run(tauri::generate_context!())
        .expect("error while running BlkDustBin");
}
```

- [ ] **Step 3: 跑测试验证两个单测通过、集成测试被忽略**

Run: `cd src-tauri && cargo test`
Expected: 2 passed（normalize_*），1 ignored（trash_all_moves_real_file_to_system_trash，已带 `#[ignore]`）

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add cross-platform trash commands with tests"
```

---

### Task 3: 前端纯逻辑（drop 状态机 + 轨道积分）TDD

**Files:**
- Create: `src/lib/dropState.ts`, `src/lib/orbit.ts`
- Test: `test/dropState.test.ts`, `test/orbit.test.ts`

- [ ] **Step 1: 写失败测试**

`test/dropState.test.ts`:
```ts
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
```

`test/orbit.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { orbitStep, spawnParticle } from "../src/lib/orbit";

describe("orbit", () => {
  it("半径单调收缩直至坠入视界后死亡", () => {
    let p = spawnParticle(0.9, 0);
    const radii: number[] = [];
    for (let i = 0; i < 2000 && p.alive; i++) {
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
```

Run: `npm test`
Expected: FAIL（模块不存在）

- [ ] **Step 2: 实现纯函数**

`src/lib/dropState.ts`:
```ts
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
```

`src/lib/orbit.ts`:
```ts
export interface OrbitalParticle {
  r: number;
  theta: number;
  vr: number;
  vtheta: number;
  alive: boolean;
}

export const HORIZON_R = 0.12;

export function spawnParticle(r: number, theta: number): OrbitalParticle {
  const vtheta = Math.sqrt(1.2 / Math.max(r, 0.05));
  return { r, theta, vr: 0, vtheta, alive: true };
}

export function orbitStep(p: OrbitalParticle, dt: number): OrbitalParticle {
  if (!p.alive) return p;
  const vr = p.vr - (0.9 * dt) / Math.max(p.r * p.r, 0.02);
  const r = p.r + vr * dt;
  const vtheta = p.vtheta + (0.6 * dt) / Math.max(p.r, 0.05);
  const theta = p.theta + (vtheta / Math.max(r, 0.05)) * dt;
  const alive = r > HORIZON_R;
  return { r: Math.max(r, 0), theta, vr, vtheta, alive };
}
```

注意：第一个测试要求半径单调不减地收缩——`vr` 从 0 开始受引力变负，r 递减，满足。2000 步内必然死亡：`vr` 在 r≈0.12 时累积约 `-0.9/0.0144*...`，足够；若不满足，把上限调到 5000 步再验证。

Run: `npm test`
Expected: 6 passed

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add drag-drop state machine and orbital particle math with tests"
```

---

### Task 4: 黑洞 shader + BlackHoleCanvas 渲染组件

**Files:**
- Create: `src/shaders/blackhole.ts`, `src/components/BlackHoleCanvas.tsx`
- Create: `src/main.tsx`, `src/App.tsx`, `src/index.css`

- [ ] **Step 1: 写黑洞 GLSL**

`src/shaders/blackhole.ts`:
```ts
export const BLACK_HOLE_VERT = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const BLACK_HOLE_FRAG = /* glsl */ `
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uCursor;      // NDC -1..1，光标引力注视
uniform float uCursorOn;   // 0/1 光标是否在窗口内
uniform float uAgitation;  // 0..1 拖拽悬停激扰
uniform float uFullness;   // 0..1 垃圾桶饱食度
uniform float uEvaporate;  // 0..1 蒸发进度

#define STEPS 48
#define HORIZON 0.16

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

vec3 stars(vec3 dir) {
  vec2 uv = vec2(atan(dir.z, dir.x), asin(clamp(dir.y, -1.0, 1.0)));
  uv *= vec2(3.0, 6.0);
  vec2 cell = floor(uv * 40.0);
  float h = hash21(cell);
  float star = step(0.997, h) * (0.5 + 0.5 * sin(uTime * (1.0 + h * 3.0) + h * 40.0));
  return vec3(star) * 0.8;
}

// 吸积盘颜色：内沿白热 -> 外沿橙红，带螺旋噪声
vec3 diskColor(float r, float theta, float t) {
  float heat = smoothstep(1.0, 0.18, r);
  float spiral = sin(theta * 3.0 - t * (2.0 + uAgitation * 6.0) + 8.0 / max(r, 0.1)) * 0.5 + 0.5;
  float bands = 0.6 + 0.4 * sin(r * 22.0 + spiral * 2.0);
  vec3 hot = vec3(1.0, 0.95, 0.8);
  vec3 warm = vec3(1.0, 0.55, 0.15);
  vec3 col = mix(warm, hot, heat * heat);
  float brightness = (0.6 + 0.8 * uFullness + 0.6 * uAgitation) * bands;
  return col * brightness * (0.4 + 0.6 * spiral);
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / min(uResolution.x, uResolution.y);

  // 光标引力注视：图像向光标凹陷
  if (uCursorOn > 0.5) {
    vec2 d = uCursor - uv;
    float dist = length(d);
    uv += normalize(d + 1e-6) * 0.12 * exp(-dist * dist * 6.0);
  }

  // 相机：略微俯视吸积盘
  float tilt = 0.35;
  vec3 ro = vec3(0.0, 0.55, -1.9);
  vec3 fwd = normalize(vec3(0.0, -0.25, 1.0));
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, fwd);
  vec3 rd = normalize(fwd + uv.x * right + uv.y * up);

  // 引力弯折 raymarch（牛顿近似）
  vec3 p = ro;
  vec3 v = rd;
  float dt = 0.06;
  vec3 col = vec3(0.0);
  float captured = 0.0;
  float diskHit = 0.0;
  vec3 diskCol = vec3(0.0);
  float prevY = p.y;

  for (int i = 0; i < STEPS; i++) {
    float r2 = dot(p, p);
    float r = sqrt(r2);
    if (r < HORIZON) { captured = 1.0; break; }
    // 吸积盘平面 y=0 交叉检测
    if (sign(p.y) != sign(prevY) || abs(p.y) < 0.01) {
      float rr = length(p.xz);
      if (rr > 0.2 && rr < 1.05) {
        float theta = atan(p.z, p.x);
        diskCol += diskColor(rr, theta, uTime);
        diskHit += 0.55 * smoothstep(1.05, 0.25, rr);
      }
    }
    prevY = p.y;
    // 引力加速度弯折光线
    v -= p * (0.045 / (r2 * r + 0.001)) * dt;
    p += v * dt;
  }

  // 背景星空（未被捕获时）
  if (captured < 0.5) {
    col = stars(normalize(v));
  }

  // 光子环
  float ringR = length(uv);
  float ring = exp(-pow((ringR - 0.34) * 14.0, 2.0));
  col += vec3(1.0, 0.9, 0.7) * ring * (1.2 + uAgitation);

  col += diskCol * (1.0 - uEvaporate);
  col += vec3(1.0, 0.95, 0.85) * diskHit * (1.0 - uEvaporate) * 0.4;

  // 蒸发：向外扩散的辐射闪光
  float evRing = exp(-pow((ringR - uEvaporate * 1.6) * 8.0, 2.0)) * uEvaporate * (1.0 - uEvaporate) * 4.0;
  col += vec3(0.8, 0.9, 1.0) * evRing;

  // 视界纯黑圆盘 + 圆形窗口软边
  float horizonMask = smoothstep(0.30, 0.34, ringR);
  col *= horizonMask;
  float edge = smoothstep(1.0, 0.92, ringR);
  col *= edge;

  // tonemap + gamma
  col = col / (col + 0.6);
  col = pow(col, vec3(0.85));

  gl_FragColor = vec4(col, edge);
}
`;
```

- [ ] **Step 2: 写渲染组件（不含粒子，Task 5 加）**

`src/components/BlackHoleCanvas.tsx`:
```tsx
import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import * as THREE from "three";
import { BLACK_HOLE_VERT, BLACK_HOLE_FRAG } from "../shaders/blackhole";

export interface BlackHoleHandle {
  setCursor(x: number, y: number, on: boolean): void;
  setAgitation(v: number): void;
  setFullness(v: number): void;
  evaporate(): void;
}

export const BlackHoleCanvas = forwardRef<BlackHoleHandle>(function BlackHoleCanvas(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uniformsRef = useRef<Record<string, THREE.IUniform> | null>(null);
  const evapRef = useRef({ active: false, t: 0 });

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
      // 蒸发时间线 0 -> 1 -> 0，共 1.6s
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
    };
  }, []);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
});
```

- [ ] **Step 3: App 入口**

`src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`src/App.tsx`（临时版，Task 6/7 填充交互）:
```tsx
import { useRef } from "react";
import { BlackHoleCanvas, BlackHoleHandle } from "./components/BlackHoleCanvas";

export default function App() {
  const bh = useRef<BlackHoleHandle>(null);
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <BlackHoleCanvas ref={bh} />
    </div>
  );
}
```

`src/index.css`:
```css
html, body, #root {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  background: transparent;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
}
```

- [ ] **Step 4: 验证编译 + 视觉检查**

Run: `npm run build`
Expected: tsc + vite build 成功无报错

Run: `npm run tauri dev`
Expected: 透明圆形窗口中出现黑洞：中央纯黑视界、光子环、橙白吸积盘缓慢旋转、背景稀疏星空。窗口边缘羽化成圆。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add black hole raymarching shader and canvas component"
```

---

### Task 5: 光标引力注视 + 窗口拖动 + 双击打开垃圾桶

**Files:**
- Modify: `src/App.tsx`
- Create: `src/lib/trashApi.ts`

- [ ] **Step 1: 写 invoke 封装**

`src/lib/trashApi.ts`:
```ts
import { invoke } from "@tauri-apps/api/core";

export interface TrashItemResult {
  path: string;
  ok: boolean;
  error: string | null;
}

export const moveToTrash = (paths: string[]) =>
  invoke<TrashItemResult[]>("move_to_trash", { paths });
export const openTrash = () => invoke<void>("open_trash");
export const emptyTrash = () => invoke<void>("empty_trash");
export const getTrashCount = () => invoke<number>("get_trash_count");
export const toggleWindowLevel = () => invoke<void>("toggle_window_level");
```

- [ ] **Step 2: App 接线（光标 / 拖动 / 双击）**

`src/App.tsx` 完整替换：
```tsx
import { useRef, useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { BlackHoleCanvas, BlackHoleHandle } from "./components/BlackHoleCanvas";
import { openTrash } from "./lib/trashApi";

export default function App() {
  const bh = useRef<BlackHoleHandle>(null);

  const toNdc = useCallback((e: MouseEvent) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const m = Math.min(w, h);
    return {
      x: ((e.clientX * 2 - w) / m),
      y: (-(e.clientY * 2 - h) / m),
    };
  }, []);

  useEffect(() => {
    let downAt = 0;
    let moved = false;

    function onMove(e: MouseEvent) {
      const { x, y } = toNdc(e);
      bh.current?.setCursor(x, y, true);
      moved = true;
    }
    function onLeave() {
      bh.current?.setCursor(0, 0, false);
    }
    function onDown(e: MouseEvent) {
      downAt = Date.now();
      moved = false;
      // 拖拽窗口（右键除外）
      if (e.button === 0) {
        getCurrentWindow().startDragging().catch(() => {});
      }
    }
    function onDblClick() {
      if (Date.now() - downAt < 600 && !moved) return;
      openTrash().catch(console.error);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseout", onLeave);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("dblclick", onDblClick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseout", onLeave);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("dblclick", onDblClick);
    };
  }, [toNdc]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <BlackHoleCanvas ref={bh} />
    </div>
  );
}
```

- [ ] **Step 3: 验证**

Run: `npm run tauri dev`
Expected: 鼠标划过时图像向光标轻微凹陷；按住左键可拖动窗口；双击窗口 Finder 打开垃圾桶。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add cursor gravity lensing, window dragging, double-click to open trash"
```

---

### Task 6: GPU 粒子系统（吸入/撕裂动效）

**Files:**
- Create: `src/shaders/particles.ts`
- Modify: `src/components/BlackHoleCanvas.tsx`

- [ ] **Step 1: 写粒子 GLSL**

`src/shaders/particles.ts`:
```ts
export const PARTICLE_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aAngle;
varying vec3 vColor;
varying float vAngle;
void main() {
  vColor = aColor;
  vAngle = aAngle;
  gl_Position = vec4(position.xy, 0.0, 1.0);
  gl_PointSize = aSize;
}
`;

export const PARTICLE_FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vAngle;
void main() {
  // 沿速度方向旋转的椭圆遮罩 -> 拉伸撕裂感
  vec2 c = gl_PointCoord - 0.5;
  float cs = cos(vAngle);
  float sn = sin(vAngle);
  vec2 rc = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
  float d = length(rc * vec2(1.0, 3.0));
  float alpha = smoothstep(0.5, 0.1, d);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(vColor, alpha);
}
`;
```

- [ ] **Step 2: BlackHoleCanvas 加粒子层**

在 `BlackHoleCanvas.tsx` 中：

顶部 import 增加：
```ts
import { PARTICLE_VERT, PARTICLE_FRAG } from "../shaders/particles";
import { spawnParticle, orbitStep, OrbitalParticle, HORIZON_R } from "../lib/orbit";
```

`BlackHoleHandle` 接口增加：
```ts
  burst(x: number, y: number, count: number): void;
```

`useImperativeHandle` 内增加实现：
```ts
    burst(x, y, count) {
      spawnBurstRef.current(x, y, count);
    },
```

组件内（`useEffect` 之前）加：
```ts
  const spawnBurstRef = useRef<(x: number, y: number, count: number) => void>(() => {});
```

`useEffect` 内 quad 添加之后，加入粒子系统：
```ts
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
      const r0 = Math.max(Math.hypot(x, y), 0.3);
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
```

`loop()` 内 `renderer.render` 之前更新粒子：
```ts
      let alive = 0;
      for (let i = 0; i < particles.length; i++) {
        const p = orbitStep(particles[i], Math.min(dt, 0.05));
        particles[i] = p;
        if (!p.alive) continue;
        const px = p.r * Math.cos(p.theta);
        const py = p.r * Math.sin(p.theta) * 0.35 + 0.0; // 压扁到盘面视角
        positions[alive * 3] = px;
        positions[alive * 3 + 1] = py;
        positions[alive * 3 + 2] = 0;
        // 越靠近视界越红暗（红移撕裂）
        const t = Math.max((p.r - HORIZON_R) / 0.8, 0);
        colors[alive * 3] = 1.0;
        colors[alive * 3 + 1] = 0.35 + 0.6 * t;
        colors[alive * 3 + 2] = 0.15 + 0.75 * t * t;
        sizes[alive] = p.size * (1.0 + (1 - t) * 2.0);
        angles[alive] = Math.atan2(py, px) + Math.PI / 2;
        alive++;
      }
      // 压缩死亡粒子
      for (let i = particles.length - 1; i >= 0; i--) {
        if (!particles[i].alive) particles.splice(i, 1);
      }
      geo.setDrawRange(0, alive);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aColor.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aAngle.needsUpdate = true;
```

cleanup return 内加：
```ts
      geo.dispose();
      pMat.dispose();
```

- [ ] **Step 3: 验证**

在 App.tsx 临时给 `onDblClick` 里加一行 `bh.current?.burst(0.6, 0.3, 300);` 测试，运行 `npm run tauri dev`，双击应看到一团白橙粒子从 (0.6,0.3) 螺旋坠入黑洞、靠近视界变红拉伸消失。验证后删除该测试行。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add GPU particle system with tidal-disruption visuals"
```

---

### Task 7: 拖放接线（useDropZone + 吸入 + 调用 trash）

**Files:**
- Create: `src/hooks/useDropZone.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: 写 useDropZone hook**

`src/hooks/useDropZone.ts`:
```ts
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
```

- [ ] **Step 2: App 接线吸入 + trash 调用 + 失败 toast**

`src/App.tsx` 完整替换：
```tsx
import { useRef, useEffect, useCallback, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { BlackHoleCanvas, BlackHoleHandle } from "./components/BlackHoleCanvas";
import { openTrash, moveToTrash } from "./lib/trashApi";
import { useDropZone, DropPayload } from "./hooks/useDropZone";

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
            bh.current?.burst(d.x, d.y, 80); // 失败弹出感
          }
        })
        .catch((e) => showToast(String(e)));
    },
    [showToast]
  );

  const phase = useDropZone(handleDrop);

  // 激扰度平滑趋近目标值
  useEffect(() => {
    const target = phase === "hover" ? 1 : 0;
    const id = setInterval(() => {
      agitRef.current += (target - agitRef.current) * 0.15;
      bh.current?.setAgitation(agitRef.current);
    }, 16);
    return () => clearInterval(id);
  }, [phase]);

  const toNdc = useCallback((e: MouseEvent) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const m = Math.min(w, h);
    return { x: (e.clientX * 2 - w) / m, y: -(e.clientY * 2 - h) / m };
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const { x, y } = toNdc(e);
      bh.current?.setCursor(x, y, true);
    }
    function onLeave() {
      bh.current?.setCursor(0, 0, false);
    }
    function onDown(e: MouseEvent) {
      if (e.button === 0) getCurrentWindow().startDragging().catch(() => {});
    }
    function onDblClick() {
      openTrash().catch(console.error);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseout", onLeave);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("dblclick", onDblClick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseout", onLeave);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("dblclick", onDblClick);
    };
  }, [toNdc]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
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
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 验证（核心验收）**

Run: `npm run tauri dev`
Expected:
1. 从 Finder 拖一个文件悬停在黑洞上：吸积盘加速变亮（激扰）
2. 松开：粒子团从落点螺旋吸入、撕裂变红、坠灭；文件真实进入系统垃圾桶（Finder 打开垃圾桶确认）
3. 一次拖入多个文件+文件夹：全部吸入且都进入垃圾桶
4. 拖走后 `leave`：激扰回落

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: wire drag-drop to particle ingestion and real trash"
```

---

### Task 8: 右键原生菜单 + 清空垃圾桶蒸发动效

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/App.tsx`
- Create: `src/hooks/useTrashState.ts`

- [ ] **Step 1: Rust 侧菜单**

`src-tauri/src/lib.rs` 完整替换：
```rust
mod trash_ops;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::{Emitter, Manager};

static FLOATING: AtomicBool = AtomicBool::new(true);

#[tauri::command]
async fn move_to_trash(paths: Vec<String>) -> Vec<trash_ops::TrashItemResult> {
    tauri::async_runtime::spawn_blocking(move || trash_ops::trash_all(paths))
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn open_trash() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(trash_ops::open_trash)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn empty_trash() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(trash_ops::empty_trash)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn get_trash_count() -> usize {
    trash_ops::trash_count()
}

fn set_level(window: &tauri::WebviewWindow, floating: bool) {
    FLOATING.store(floating, Ordering::SeqCst);
    let _ = window.set_always_on_top(floating);
    let _ = window.set_always_on_bottom(!floating);
}

#[tauri::command]
fn toggle_window_level(window: tauri::WebviewWindow) {
    let floating = !FLOATING.load(Ordering::SeqCst);
    set_level(&window, floating);
}

#[tauri::command]
fn show_context_menu(window: tauri::WebviewWindow) -> Result<(), String> {
    let open = MenuItemBuilder::with_id("open", "打开垃圾桶")
        .build(&window)
        .map_err(|e| e.to_string())?;
    let empty = MenuItemBuilder::with_id("empty", "清空垃圾桶")
        .build(&window)
        .map_err(|e| e.to_string())?;
    let level_text = if FLOATING.load(Ordering::SeqCst) { "贴到桌面层" } else { "浮到最顶层" };
    let level = MenuItemBuilder::with_id("level", level_text)
        .build(&window)
        .map_err(|e| e.to_string())?;
    let quit = MenuItemBuilder::with_id("quit", "退出")
        .build(&window)
        .map_err(|e| e.to_string())?;
    let menu = MenuBuilder::new(&window)
        .items(&[&open, &empty, &level, &quit])
        .build()
        .map_err(|e| e.to_string())?;
    window.popup_menu(&menu).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            move_to_trash,
            open_trash,
            empty_trash,
            get_trash_count,
            toggle_window_level,
            show_context_menu
        ])
        .on_menu_event(|app, event| {
            let Some(window) = app.get_webview_window("main") else { return };
            match event.id().0.as_str() {
                "open" => {
                    let w = window.clone();
                    tauri::async_runtime::spawn(async move { let _ = trash_ops::open_trash(); drop(w); });
                }
                "empty" => {
                    let _ = window.emit("menu://empty-trash", ());
                }
                "level" => {
                    let floating = !FLOATING.load(Ordering::SeqCst);
                    set_level(&window, floating);
                }
                "quit" => app.exit(0),
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running BlkDustBin");
}
```

`src/lib/trashApi.ts` 末尾加：
```ts
export const showContextMenu = () => invoke<void>("show_context_menu");
```

- [ ] **Step 2: 前端接线右键 + 蒸发 + 饱食度轮询**

`src/hooks/useTrashState.ts`:
```ts
import { useEffect, useState } from "react";
import { getTrashCount } from "../lib/trashApi";

export function useTrashState(pollMs = 2000) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const tick = () =>
      getTrashCount()
        .then((c) => alive && setCount(c))
        .catch(() => {});
    tick();
    const id = setInterval(tick, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pollMs]);
  return count;
}
```

`src/App.tsx` 增加（在现有 import 后）：
```ts
import { listen } from "@tauri-apps/api/event";
import { emptyTrash, showContextMenu } from "./lib/trashApi";
import { useTrashState } from "./hooks/useTrashState";
```

组件内 `const phase = useDropZone(handleDrop);` 之后加：
```ts
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
    const unlisten = listen("menu://empty-trash", () => {
      bh.current?.evaporate();
      setTimeout(() => emptyTrash().catch((e) => showToast(String(e))), 800);
    });
    return () => {
      window.removeEventListener("contextmenu", onContext);
      unlisten.then((f) => f());
    };
  }, [showToast]);
```

- [ ] **Step 3: 验证**

Run: `npm run tauri dev`
Expected: 右键弹原生菜单（4 项）；"贴到桌面层"后窗口沉到普通窗口之下，再切回；点"清空垃圾桶"：先播放蒸发闪光动效，约 0.8s 后系统弹出清空确认（macOS Finder）；垃圾桶非空时吸积盘比空桶时更亮。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add native context menu, empty-trash evaporation, fullness polling"
```

---

### Task 9: 全量回归 + 打包验证

**Files:** 无新增

- [ ] **Step 1: 全部测试**

Run: `npm test && cd src-tauri && cargo test`
Expected: 前端 6 passed；Rust 2 passed, 1 ignored

- [ ] **Step 2: 类型与构建**

Run: `npm run build`
Expected: 无 TS 错误

- [ ] **Step 3: 手动回归清单（dev 模式逐项过）**

- 鼠标划过：透镜凹陷跟随
- 拖拽悬停：吸积盘激扰
- 单文件 drop：吸入动效 + 入桶
- 多文件/多文件夹 drop：全部入桶 + 动效不重叠崩溃
- 双击：打开垃圾桶
- 右键：菜单 4 项均工作
- 清空垃圾桶：蒸发动效 + 系统确认
- 层级切换：顶层 ↔ 桌面层
- 拖不存在的路径（如命令行构造）：toast 报错不崩溃

- [ ] **Step 4: 打包**

Run: `npm run tauri build`
Expected: `src-tauri/target/release/bundle/` 产出 `.app`/`.dmg`（macOS）。Windows/Linux 打包在对应平台 CI 或机器上执行同命令。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: release build verification"
```

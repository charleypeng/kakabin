# AGENTS.md

## Architecture

- **Tauri v2** desktop app (Rust backend + React frontend)
- Window: tiny (134×134), transparent, undecorated, always-on-top
- Drag files onto the black hole → moved to system trash
- Three.js WebGL renders the black hole + orbital particle system

## Key directories

| Dir | Purpose |
|-----|---------|
| `src/lib/` | Pure logic: `orbit.ts` (particle physics), `dropState.ts` (drag state machine), `trashApi.ts` (Tauri IPC wrappers) |
| `src/hooks/` | React hooks: `useDropZone`, `useTrashState` |
| `src/components/` | `BlackHoleCanvas.tsx` — Three.js canvas + imperative handle |
| `src/shaders/` | GLSL shaders exported as TypeScript strings |
| `src-tauri/src/` | Rust: `lib.rs` (commands + menu), `trash_ops.rs` (cross-platform trash) |
| `test/` | Vitest unit tests |

## Commands

```sh
npm run dev      # Vite dev server (port 1420, strictPort)
npm run build    # tsc && vite build
npm test         # Vitest (frontend)
cargo test --manifest-path src-tauri/Cargo.toml   # Rust unit tests
npm run tauri    # Tauri CLI (dev build, etc.)
```

## Gotchas

- **Dev server runs on port 1420** — Tauri's `beforeDevCommand` expects this. Don't change the port without updating `tauri.conf.json`.
- **No Tauri dev command in npm scripts** — run `npm run tauri dev` or `cargo tauri dev` (in `src-tauri/`).
- **`build` script runs `tsc` before `vite build`** — type errors block the build.
- **CSP is `null`** — inline styles are used in `App.tsx` (this is intentional).
- **`macOSPrivateApi: true`** — needed for `set_always_on_bottom` / desktop layer toggle.
- **`types: ["vite/client"]`** in tsconfig — `import.meta.env` types and asset imports need this.
- **One Rust test is `#[ignore]`d** — `trash_all_moves_real_file_to_system_trash` actually moves files to the system trash.
- **No linter or formatter configured** — no eslint, prettier, or rustfmt config.
- **`envPrefix: ["VITE_", "TAURI_"]`** — only these env vars are exposed to the frontend.
- **`SETUP.md`** mentions `cargo-binutils` needed for release builds.

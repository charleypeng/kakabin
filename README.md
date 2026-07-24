# Kakabin

A desktop black hole — drag files onto it and they disappear into the void (system trash).

Built with [Tauri v2](https://v2.tauri.app/), React, TypeScript, and Three.js.

## Features

- **Drag-and-drop trash** — drag any file/folder onto the black hole, it moves to system trash
- **Particle physics** — orbital particles with tidal disruption, gravitational redshift, and spaghettification
- **Desktop layer toggle** — float on top or pin to desktop background (macOS)
- **Context menu** — right-click to open/empty trash, toggle window level, quit
- **Always-on-top** — sits above all windows until you pin it to the desktop

## Quick Start

```sh
npm install
npm run tauri dev
```

## Build

```sh
npm run build          # tsc + vite build
npm run tauri build    # release bundle
npm test               # vitest
```

## Architecture

```
src/               React + Three.js frontend
  lib/             Pure logic (orbit, drag state, Tauri IPC)
  hooks/           React hooks
  components/      BlackHoleCanvas (Three.js WebGL)
  shaders/         GLSL shaders
src-tauri/         Rust backend (Tauri v2)
  src/lib.rs       Commands, menu, window layer
  src/trash_ops.rs Cross-platform trash operations
test/              Vitest unit tests
```

## License

MIT

# BlkDustBin — 黑洞垃圾桶桌面 Widget 设计文档

日期：2026-07-23

## 概述

macOS 桌面 widget：一个可交互的黑洞对象，绑定系统垃圾桶。鼠标划过时黑洞对光标产生引力透镜扰动；从 Finder 拖拽文件/文件夹到黑洞上，文件以粒子形式被引力捕获、螺旋加速、撕裂拉伸、坠入视界，同时被真实移入系统垃圾桶。支持多文件、多文件夹批量拖拽。

独立新项目，不依赖任何外部项目代码。

## 技术栈

- **Tauri 2**（Rust 后端 + WebView 前端）
- **前端**：React + TypeScript + three.js + 自定义 GLSL
- **目标平台**：macOS（Apple Silicon 优先）、Windows 10/11、Linux（X11/Wayland）

## 架构

### 窗口

- 圆形观感：无边框透明窗口（`decorations: false`, `transparent: true`），默认 ~320×320，可缩放
- 两种层级模式，右键菜单切换：
  - 常置顶层（floating，悬浮于所有窗口之上）
  - 桌面贴附层（desktop level，位于普通窗口之下）
- 窗口可拖动换位（拖拽黑洞本体空白处移动窗口）

### 前端模块

| 模块 | 职责 |
|---|---|
| `BlackHoleCanvas` | 全屏 quad + raymarching GLSL 黑洞 shader：事件视界、吸积盘、引力透镜、光子环 |
| `ParticleSystem` | GPU 粒子：文件吸入动效（捕获 → 螺旋 → 撕裂拉伸 → 坠灭闪光） |
| `useDropZone` | 封装 Tauri `onDragDropEvent`，hover/leave/drop 状态机，输出路径列表 |
| `useTrashState` | 每 2s 轮询 `get_trash_count`，映射为黑洞"饱食度"（盘体亮度） |
| `ContextMenu` | 右键原生菜单：打开垃圾桶 / 清空垃圾桶 / 切换层级 / 退出 |

### Shader uniforms（交互驱动）

- `uCursor`：鼠标窗口内坐标 → 引力透镜凹陷跟随、吸积盘局部扰动增亮（"引力注视"）
- `uAgitation`：0..1，拖拽悬停期间吸积盘加速旋转、亮度提升
- `uFullness`：0..1，垃圾桶容量映射盘体亮度/厚度

### Rust 后端 commands

| Command | macOS | Windows | Linux |
|---|---|---|---|
| `move_to_trash(paths)` | `trash` crate（NSFileManager trashItem） | `trash` crate（Shell API） | `trash` crate（freedesktop Trash 规范） |
| `open_trash()` | `open ~/.Trash` | `explorer.exe shell:RecycleBinFolder` | `xdg-open trash:///`（回退 `~/.local/share/Trash`） |
| `empty_trash()` | AppleScript 调 Finder（系统确认） | `SHEmptyRecycleBinW`（带确认标志） | 按 freedesktop 规范清空 `~/.local/share/Trash/{files,info}` |
| `get_trash_count()` | 读 `~/.Trash` 条目数 | 读回收站（`SHQueryRecycleBinW`） | 读 `~/.local/share/Trash/files` 条目数 |
| `set_window_level(mode)` | Tauri always-on-top + NSWindow level | Tauri always-on-top API | Tauri always-on-top API（Wayland 下贴附层可能不可用，降级为普通窗口） |

统一对外接口为单组 command，内部按 `cfg!(target_os)` 分派；逐项返回成败。

## 核心数据流（drop）

1. Finder 拖拽进入窗口 → Tauri drag-drop `enter`/`over` 事件 → `uAgitation` 上升，吸积盘躁动
2. `drop` 事件 → 取得路径列表（多文件/文件夹）→ 在拖放点生成粒子团
3. 动效时间线（约 1s）：
   - 0.0–0.3s 粒子被引力捕获，绕黑洞螺旋加速
   - 0.3–0.7s 靠近视界，粒子沿轨道切向拉伸、红移变暗（撕裂感）
   - 0.7–1.0s 坠入视界，视界边缘闪光
4. 同时调用 `move_to_trash`；失败的项粒子"弹出"逃逸 + toast 提示失败原因

## 其他交互

- **鼠标划过**：`uCursor` 驱动透镜凹陷跟随光标，盘体微倾斜增亮
- **双击**：`open_trash()`
- **清空垃圾桶**：菜单触发 `empty_trash()`，成功后黑洞"蒸发"动效（霍金辐射：盘体收缩、粒子向外辐射消散、短暂暗化后重新点燃）

## 错误处理

- `move_to_trash` 逐项返回结果，失败项单独 toast（含原因）
- trash 失败时提示用户检查权限（macOS 完全磁盘访问；Linux 检查挂载点可写）
- 空拖拽（无有效路径）静默忽略
- Linux Wayland 下"桌面贴附层"不可用时自动降级并在菜单中置灰该项

## 测试

- Rust：`move_to_trash` 路径解析与批量逻辑单测（临时目录 + 模拟目标）；三平台各自跑 CI 冒烟
- 前端：drop 事件状态机、路径解析单测
- Shader/粒子动效：人工视觉验证

## 非目标（YAGNI）

- 不做文件恢复动画
- 不做设置面板（层级切换走右键菜单即可）
- 不做移动端

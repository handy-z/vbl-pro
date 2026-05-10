# VBL Pro

[![Platform](https://img.shields.io/badge/platform-Windows-0078D4)](#requirements)
[![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8DB)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev/)
[![Bun](https://img.shields.io/badge/runtime-Bun-FBF0DF)](https://bun.sh/)
[![Rust](https://img.shields.io/badge/backend-Rust-B7410E)](https://www.rust-lang.org/)

VBL Pro is a Windows desktop companion for **Volleyball Legends** on Roblox. It combines a configurable crosshair overlay, a focus-aware runtime, a fast pixel watcher, and mouse/keyboard macro controls inside a Tauri desktop app.

The app is built with React, TypeScript, Tauri 2, and native Rust modules for Windows focus tracking, screen sampling, input hooks, and transparent overlay rendering.

> This project is for personal and educational use. Macros and overlays may violate Roblox or game-specific terms. Use it at your own risk.

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Using VBL Pro](#using-vbl-pro)
- [Controls](#controls)
- [Resolution Setup](#resolution-setup)
- [Configuration](#configuration)
- [Development Scripts](#development-scripts)
- [Project Structure](#project-structure)
- [Release Workflow](#release-workflow)
- [Troubleshooting](#troubleshooting)
- [Disclaimer](#disclaimer)

## Features

- **Focus-aware runtime**: Starts the overlay, pixel scanner, focus monitor, input hooks, and macro loop as coordinated background services.
- **Roblox focus detection**: Enables gameplay behavior only while Roblox is the active foreground process.
- **Click-through crosshair overlay**: Renders a transparent, always-on-top Windows overlay centered on the Roblox client area.
- **Custom crosshair support**: Uses the bundled crosshair or a custom image file with tint, scale, opacity, and X/Y offset controls.
- **Animated image support**: Supports common image formats including PNG, JPG, WebP, GIF, ICO, and BMP.
- **Pixel watcher**: Samples configured screen points and maps them to runtime states such as `GameOnGround` and `GameSkillReady`.
- **Input and macro engine**: Uses low-level Windows keyboard and mouse hooks for function-key shortcuts and mouse side-button workflows.
- **Runtime dashboard**: Shows runtime status, Roblox focus, active resolution, watcher match state, input hook state, overlay state, and recent logs.
- **Persistent config**: Saves user settings through the Tauri app config directory and can migrate legacy local config files.

## Requirements

- Windows 10 or Windows 11
- Roblox desktop client
- [Bun](https://bun.sh/)
- [Rust and Cargo](https://rustup.rs/) using the latest stable toolchain
- Microsoft WebView2 Runtime, usually already available on modern Windows systems

VBL Pro is Windows-only because the runtime depends on native Win32 APIs through `windows-sys`.

## Quick Start

Install dependencies:

```powershell
bun install
```

Run the desktop app in development mode:

```powershell
bun run desktop:dev
```

Build a production desktop release:

```powershell
bun run desktop:build
```

The production build compiles the Rust backend, bundles the Vite frontend, builds the Tauri app, and copies release executables into `release/`.

## Using VBL Pro

1. Open Roblox and launch **Volleyball Legends**.
2. Open VBL Pro.
3. Use a supported display resolution, preferably fullscreen at `1920x1080` or `1600x900`.
4. Choose `Normal` or `Boomjump` from **Config -> Macro**.
5. Adjust **Config -> Crosshair** for image, tint, scale, opacity, and offset.
6. Check **Runtime** for Roblox focus, watcher match state, service status, and logs.
7. Use **Start** and **Stop** to control the runtime when needed.

The runtime starts automatically when `vbl-pro.exe` opens. Macro actions only run while the runtime is enabled and Roblox is focused.

## Controls

| Input | Behavior |
| --- | --- |
| `F1` | Quick reset by sending `Esc`, `R`, then `Enter`. |
| `F2` | Toggles skill macro logic on or off. |
| Mouse Back / `XButton1` press | Marks `X1Held`; starts jump/charge behavior based on current state. |
| Mouse Back / `XButton1` release | Releases `E`. |
| Mouse Forward / `XButton2` hold | While grounded, runs the movement loop. In Boomjump-ready state it cycles `Shift`, `Ctrl`, `Shift`; otherwise it cycles `Shift`, `Space`, `Shift`. |
| Mouse Forward / `XButton2` release | Executes the spike click. If airborne and skill-ready, Normal mode taps `Ctrl` first; Boomjump mode waits briefly before clicking. |

Runtime state comes from the pixel watcher, so inaccurate pixel coordinates or an unsupported resolution can change macro timing and behavior.

## Resolution Setup

The default watcher profiles are:

| Resolution | State | Pixel | Target RGB | Tolerance |
| --- | --- | --- | --- | --- |
| `1920x1080` | `GameOnGround` | `[942, 1003]` | `[255, 225, 148]` | `0` |
| `1920x1080` | `GameSkillReady` | `[1030, 903]` | `[255, 255, 255]` | `0` |
| `1600x900` | `GameOnGround` | `[787, 835]` | `[255, 225, 148]` | `0` |
| `1600x900` | `GameSkillReady` | `[862, 752]` | `[255, 255, 255]` | `0` |

For best results:

- Run Roblox fullscreen at one of the supported resolutions.
- Keep Windows display scaling and game window placement consistent while calibrating.
- Watch the **Runtime** tab for `Resolution` and watcher match status.
- If your resolution is not listed, update **Config -> Pixel Watcher** with the correct width, height, pixel coordinates, RGB values, and tolerances.

## Configuration

VBL Pro stores a unified `config.json` in the Tauri application config directory. On first launch, it can migrate legacy project-local files:

- `config.json`: macro mode, crosshair settings, and window settings.
- `game_watcher.json`: watcher resolutions, pixel points, target colors, and tolerances.

Main configuration sections:

| Section | Purpose |
| --- | --- |
| `skill` | Selects `normal` or `boomjump` macro behavior. |
| `crosshair` | Controls overlay visibility, custom image path, tint color, offset, scale, and opacity. |
| `watcher` | Defines resolution-specific pixel checks for runtime state detection. |
| `window` | Stores app window behavior such as always-on-top. |

Most settings can be edited from the **Config** tab without manually editing JSON.

## Development Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Starts the Vite dev server on `127.0.0.1`. |
| `bun run build` | Builds the React frontend into `dist/`. |
| `bun run check` | Runs TypeScript type checking and `cargo check` for the Tauri backend. |
| `bun run commit` | Stages and commits pending changes with a generated or custom message. |
| `bun run tauri` | Runs the local Tauri CLI. |
| `bun run desktop:dev` | Starts the full Tauri desktop app in development mode. |
| `bun run desktop:build` | Builds the Tauri app and collects release artifacts. |
| `bun run release` | Copies built executable artifacts into `release/`. |
| `bun run release:github` | Uploads collected artifacts to a draft GitHub release. |
| `bun run desktop:release` | Builds, collects artifacts, commits release changes if needed, pushes, and uploads to GitHub. |

## Project Structure

```text
.
|-- assets/                 # Bundled crosshair image
|-- scripts/
|   `-- release.ts          # Release artifact collection and GitHub upload helper
|-- src/                    # React frontend
|   |-- App.tsx             # Runtime dashboard and configuration UI
|   |-- api.ts              # Tauri command/event wrapper
|   |-- main.tsx            # React entry point
|   |-- styles.css          # Application styles
|   `-- types.ts            # Shared frontend types
|-- src-tauri/
|   |-- Cargo.toml          # Rust backend dependencies and release profile
|   |-- tauri.conf.json     # Tauri app metadata and build config
|   `-- src/
|       |-- config.rs       # Config loading, defaults, migration, and persistence
|       |-- focus.rs        # Roblox foreground-window detection
|       |-- input.rs        # Keyboard/mouse hooks and simulated input
|       |-- overlay.rs      # Transparent crosshair overlay window
|       |-- pixel.rs        # Screen pixel sampling and watcher state updates
|       |-- runtime.rs      # Runtime service orchestration
|       |-- state.rs        # Shared runtime state and event emission
|       `-- windows_util.rs # Win32 helper functions
|-- config.json             # Legacy/default local app config seed
|-- game_watcher.json       # Legacy/default watcher config seed
`-- package.json            # Bun scripts and frontend dependencies
```

## Release Workflow

Create local release artifacts:

```powershell
bun run desktop:build
```

Upload artifacts to a draft GitHub release:

```powershell
$env:GITHUB_TOKEN = "your-token"
bun run desktop:release
```

Release upload behavior:

- Reads the release tag from `src-tauri/tauri.conf.json`, for example `0.1.0` becomes `v0.1.0`.
- Resolves the GitHub repository from `GITHUB_REPOSITORY` or `origin`.
- Uses `GITHUB_TOKEN` or `GH_TOKEN` for release upload permissions.
- Creates or reuses a draft GitHub release for the tag.
- Replaces existing release assets with the same file names.
- Commits pending git changes, then pushes the current branch before uploading when `--upload` is used.

Optional environment variables:

| Variable | Purpose |
| --- | --- |
| `GITHUB_REPOSITORY` | Explicit `owner/repo` target if `origin` cannot be parsed. |
| `GITHUB_TOKEN` / `GH_TOKEN` | GitHub token with release write permission. |
| `RELEASE_USERNAME` | Username used for the generated release commit message. |
| `RELEASE_COMMIT_MESSAGE` | Custom commit message for release changes. |

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Runtime says Roblox is not focused | Bring the Roblox desktop client to the foreground. The app intentionally disables macro behavior outside Roblox. |
| Watcher does not match the current resolution | Use fullscreen `1920x1080` or `1600x900`, or calibrate **Config -> Pixel Watcher** for your setup. |
| Macro behavior feels mistimed | Verify `GameOnGround` and `GameSkillReady` in the Runtime state panel, then adjust watcher pixels or tolerance. |
| Crosshair is hidden | Confirm the runtime is enabled, Roblox is focused, crosshair is enabled, and the custom image path is still valid. |
| Input hook does not respond | Restart VBL Pro. If Roblox is running elevated, run VBL Pro with matching permissions. |
| Release copy fails | Close any executable already open from `release/`, then run the build again. |

## Disclaimer

VBL Pro is not affiliated with Roblox, Roblox Corporation, or Volleyball Legends. Automation, overlays, and macro tools may violate platform or game rules and can lead to account restrictions. The maintainers are not responsible for bans, suspensions, lost accounts, or any other consequences from using this software.

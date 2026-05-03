# 🏐 VBL Pro

> A highly performant desktop utility overlay and automation macro tool specifically designed for the **Volleyball Legends** game on Roblox.

Built with [Tauri](https://tauri.app/), React, and native Rust to ensure zero latency, maximum performance, and extremely low CPU usage.

---

## ✨ Features

- ⚡ **High-Performance Native Backend**: Leverages Rust and the `windows-sys` API for minimal overhead and latency, bypassing standard JS-to-native communication bottlenecks.
- 🎯 **Customizable Overlay**: Features a click-through, always-on-top transparent overlay for rendering custom crosshairs. Supports scaling, opacity, offset tuning, tinting, and loading custom images (PNG, JPG, GIF, etc.).
- 👁️ **Smart Pixel Watcher**: A fast pixel-scanning engine that monitors specific screen regions to detect UI changes or game states based on defined color thresholds and resolutions.
- ⌨️ **Input & Macro Engine**: Built-in low-level Windows input hooking allows for precise macro execution (such as the "boomjump" technique) driven by the game's active state.
- 🧠 **Context Aware**: Actively monitors system focus to intelligently pause pixel scanning, hooks, and overlays when the target game is not in the foreground.
- 🎨 **Modern UI**: A sleek, responsive React interface powered by Vite for configuring all runtime rules, managing macros, and tuning the visual overlay in real-time.

---

## 🎮 How to Use the Macro

1. **Launch the Game**: Open Roblox and launch **Volleyball Legends**.
2. **Start the Macro**: Open VBL Pro. Click the **Start** button in the top right to enable the runtime. The app will automatically monitor when Roblox is in focus.
3. **Configure Your Skill**: Navigate to the **Config** tab. Under the **Macro** section, select your preferred skill type (e.g., *Normal* or *Boomjump*).
4. **Customize Visuals**: In the Config tab, you can customize your overlay crosshair (image, scale, opacity) and ensure the Pixel Watcher settings match your screen resolution.
5. **In-Game Controls & Macro Execution**: The macro binds specifically to your mouse's extra side buttons and standard function keys to assist with gameplay based on real-time screen scanning:
   - **F1**: Quick Reset (Automatically presses `Esc -> R -> Enter`).
   - **F2**: Toggles the Skill macro logic on/off.
   - **Mouse Side Button 1 (Back)**:
     - *When Pressed*: Taps `Space` (Jump), waits for a micro-delay (if Boomjump is ready), then holds down `E` (starts charging your set).
     - *When Released*: Releases the `E` key (executes the set).
   - **Mouse Side Button 2 (Forward)**: 
     - *When Held on the Ground*: 
       - If Boomjump is ready: Rapidly spams `Shift -> Ctrl -> Shift` continuously.
       - Otherwise: Rapidly spams `Shift -> Space -> Shift` continuously.
     - *When Released*: 
       - If in the air and skill is ready (Normal mode): Automatically taps `Ctrl` then executes a Left Click (Spike).
       - If in the air and skill is ready (Boomjump mode): Waits 25ms then executes a Left Click (Spike).
       - Otherwise: Simply executes a Left Click (Spike).
   
   Ensure the game window is actively focused. The macro will automatically adapt its timings and keypresses depending on if the pixel scanner detects that you are on the ground or if your skill is ready.

---

## 💻 Technology Stack

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Tauri 2.x, Rust, `windows-sys`
- **Package Manager**: Bun

---

## 🛠️ Development Setup

### Prerequisites

- [Bun](https://bun.sh/)
- [Rust & Cargo](https://rustup.rs/) (latest stable)
- Windows OS *(Required, as the core logic relies on Windows-specific native APIs)*

### Installation

1. Clone the repository and navigate to the directory:
   ```bash
   cd vbl-pro
   ```
2. Install frontend dependencies:
   ```bash
   bun install
   ```

### Running Locally

To start the development server with the Tauri desktop window:
```bash
bun run desktop:dev
```

### Building for Release

To build the optimized production executable:
```bash
bun run desktop:build
```
> *This will compile the Rust backend, bundle the React frontend, and automatically move the final distributed files into the `release/` directory using the custom `scripts/release.ts` script.*

---

## 🏗️ Project Architecture

- 📁 `src/`: The React frontend containing the configuration interface, runtime monitoring dashboard, and styles (`App.tsx`, `api.ts`, `styles.css`).
- 📁 `src-tauri/src/`: The Rust backend modules:
  - 📄 `overlay.rs`: Renders the click-through transparent window layer.
  - 📄 `pixel.rs`: Reads and analyzes screen memory for color matches.
  - 📄 `focus.rs`: Tracks active window focus for context-awareness.
  - 📄 `input.rs`: Handles global keyboard/mouse hooks and simulated inputs.
  - 📄 `runtime.rs` & `state.rs`: Manages background threads and application state synchronization.
- 📁 `scripts/`: Build and deployment helper scripts.
- ⚙️ `config.json` & `game_watcher.json`: Persistent user settings for macros, overlays, and pixel detection rules.

---

## ⚠️ Disclaimer

This tool is created for educational and personal use only. Using macros, automation tools, or overlays may violate the Terms of Service (ToS) of Roblox or the specific game (Volleyball Legends). The developers of this tool are not responsible for any account bans, suspensions, or other actions taken against your account. Use this software at your own risk.

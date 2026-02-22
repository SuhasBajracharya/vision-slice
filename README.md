# 🗡️ Vision Slice

**Fruit Ninja clone powered by real-time body tracking — runs 100% in the browser.**

Slash fruits with your bare hands using your webcam. MediaPipe AI tracks your hands and pose in real-time while you slice emoji fruits, dodge bombs, and collect hearts — all with lightsaber sound effects.

![Status](https://img.shields.io/badge/status-playable-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-browser-orange)

---

## 🎮 Gameplay

| Action | Effect |
|--------|--------|
| ✋ Open hand | Ignite lightsaber blade |
| ✊ Close fist | Retract blade |
| 🗡️ Slash fruits | +10 points (×combo × piece bonus) |
| 🍎→🍎🍎 Re-slice pieces | Bonus points for smaller cuts |
| 💣 Hit bomb | −10 seconds + screen explosion |
| ❤️ Hit heart | +10 seconds |
| ⏱️ Timer hits 0 | Game over |

- **30-second countdown** — survive as long as you can
- **Combo system** — chain slices for score multipliers
- **Difficulty ramp** — more fruits, more bombs over time
- **Juice splatters** — fruits leave colored stains on screen
- **Lightsaber audio** — idle hum, swing whoosh, clash on hit

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Hand & Pose Tracking | [MediaPipe Tasks Vision](https://developers.google.com/mediapipe) (client-side AI) |
| Rendering | HTML5 Canvas 2D (emoji-based) |
| Audio | Web Audio API + MP3 lightsaber sounds |
| Webcam | `getUserMedia()` API |
| Game Loop | `requestAnimationFrame` at 30-60 FPS |

**No backend. No Python. No server-side AI. Everything runs in your browser.**

---

## 📁 Project Structure

```
vision-slice/
├── index.html              # Entry point
├── package.json            # Dev server config
├── css/
│   └── styles.css          # Dracula-themed UI
├── js/
│   ├── main.js             # App controller & game loop
│   ├── poseDetection.js    # MediaPipe hand/pose tracking
│   ├── gameEngine.js       # Spawning, physics, scoring, timer
│   ├── collisionSystem.js  # Hand-object collision detection
│   ├── renderingSystem.js  # Canvas rendering, blade, skeleton
│   ├── particleSystem.js   # Particles, splatters, explosions
│   ├── audioSystem.js      # Sound effects (MP3 + procedural)
│   └── objectPool.js       # Object pooling utility
└── audios/
    ├── idle.mp3            # Lightsaber idle hum
    ├── ignition.mp3        # Blade ignition sound
    ├── swing.mp3           # Swing whoosh
    └── clash.mp3           # Blade clash on fruit hit
```

---

## 🚀 Setup

### Prerequisites

- Modern browser (Chrome/Edge recommended for GPU-accelerated MediaPipe)
- Webcam
- Node.js (optional, only for dev server)

### Run locally

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/vision-slice.git
cd vision-slice

# Install dev server
npm install

# Start
npm start
```

Open **http://localhost:8080** and allow webcam access.

### Without Node.js

Any static file server works:

```bash
# Python
python3 -m http.server 8080

# Or just use VS Code Live Server extension
```

> ⚠️ Opening `index.html` directly via `file://` won't work — MediaPipe WASM modules require HTTP.

---

## 🎵 Sound Files

Place your lightsaber MP3s in the `audios/` folder:

| File | Description |
|------|-------------|
| `idle.mp3` | Looping lightsaber hum (plays while hand is open) |
| `ignition.mp3` | Blade ignition (plays when hand opens) |
| `swing.mp3` | Fast swing whoosh (plays on quick hand movement) |
| `clash.mp3` | Impact sound (plays when slicing fruit) |

The game works without these files — it falls back to procedural Web Audio sounds.

---

## 🎯 How It Works

1. **Webcam** captures video via `getUserMedia()`
2. **MediaPipe HandLandmarker** detects 21 hand landmarks per hand
3. **MediaPipe PoseLandmarker** tracks body skeleton (fallback for wrists)
4. **Hand velocity** is calculated from a sliding window of positions
5. **Fist detection** compares fingertip-to-wrist vs knuckle-to-wrist distances
6. **Collision system** uses circle overlap + line-segment intersection for fast swipes
7. **Fruits split** into halves with physics when sliced — halves can be re-sliced
8. **Everything renders** on two layered canvases (game behind, pose overlay on top)

---

## ⚡ Performance Tips

- Use **Chrome or Edge** (best GPU delegate support for MediaPipe)
- Ensure good **lighting** for hand detection accuracy
- Stand **2-3 feet** from camera so upper body is visible
- Close other tabs to free GPU resources
- Target: **30-60 FPS** depending on hardware

---

## 📄 License

MIT — do whatever you want with it.

---

*Built with ☕ and lightsabers.*
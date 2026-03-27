# Turvamees Motion Guard

A Node.js web application that reads camera video, detects object movement direction, and plays a dedicated sound for each movement type.

## Implemented Features

- Camera access via `getUserMedia`
- Motion detection using frame differencing
- Direction detection: left, right, up, down, forward, backward
- Dedicated sound for each direction
- Stronger alarm signal for backward movement
- Event log and confidence indicator
- Link to portfolio home page: `../index.html`

## Installation and Run

```bash
npm install
npm start
```

After startup, open:

- http://localhost:3000

## Structure

- `server.js` - Node.js + Express server
- `public/index.html` - UI
- `public/styles.css` - styling
- `public/app.js` - camera logic, motion detection, sounds
- `.gitignore` - Git ignore rules

## 10 Extra Cool Features (Ideas)

1. Custom audio files: upload your own `.mp3/.wav` for each direction.
2. "Quiet Night" mode: auto-mute sound by schedule while keeping notifications.
3. Snapshot on backward alert with automatic gallery save.
4. Browser push notifications for critical movement events.
5. Switchable visual themes (Industrial, Neon, Minimal).
6. Telegram bot integration for real-time alert delivery.
7. AI false-positive filter (for example, ignore curtain motion).
8. Sensitivity zone map: highlight areas that should trigger alerts.
9. Sound packs (Siren, Sci-Fi, Retro Arcade).
10. Export event history to PDF/CSV for reporting.

## Publish to GitHub

```bash
git init
git add .
git commit -m "Initial commit: camera motion alarm app"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/turvamees-motion-guard.git
git push -u origin main
```

Replace `<YOUR_USERNAME>` with your GitHub username.

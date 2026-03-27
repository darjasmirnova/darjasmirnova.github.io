const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const PROGRESS_PATH = path.join(__dirname, "data", "progress.json");

app.use(express.json({ limit: "256kb" }));
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "public")));

function readProgressStore() {
  try {
    const raw = fs.readFileSync(PROGRESS_PATH, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

function writeProgressStore(store) {
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(store, null, 2), "utf8");
}

function normalizeName(name) {
  return String(name || "")
    .trim()
    .slice(0, 32);
}

app.get("/api/progress/:name", (req, res) => {
  const name = normalizeName(req.params.name);

  if (!name) {
    return res.status(400).json({ error: "Name is required" });
  }

  const store = readProgressStore();
  const key = name.toLowerCase();

  return res.json({
    found: Boolean(store[key]),
    progress: store[key] || null,
  });
});

app.post("/api/progress", (req, res) => {
  const name = normalizeName(req.body?.name);
  const progress = req.body?.progress;

  if (!name || typeof progress !== "object" || progress === null) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const safeProgress = {
    playerName: name,
    level: Number(progress.level) || 1,
    score: Number(progress.score) || 0,
    lives: Number(progress.lives) || 3,
    streak: Number(progress.streak) || 0,
    timestamp: new Date().toISOString(),
  };

  const store = readProgressStore();
  store[name.toLowerCase()] = safeProgress;
  writeProgressStore(store);

  return res.json({ ok: true, progress: safeProgress });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Game server started on http://localhost:${PORT}`);
});

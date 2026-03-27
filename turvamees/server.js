const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve all static front-end files from /public.
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'turvamees-motion-alert' });
});

app.listen(PORT, () => {
  console.log(`Motion app is running on http://localhost:${PORT}`);
});

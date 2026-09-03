const path = require('path');
const express = require('express');
const app = require('./api/index');

const PORT = parseInt(process.env.PORT || '8080', 10);
const FRONTEND_DIR = path.join(__dirname, 'frontend');

// Serve static frontend files
app.use(express.static(FRONTEND_DIR));

// Fallback to index.html for single-page routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(` CBDC Ration Portal (Node.js) running at:`);
  console.log(` Local:   http://localhost:${PORT}`);
  console.log(` Network: http://127.0.0.1:${PORT}`);
  console.log(` API:     http://localhost:${PORT}/api/beneficiaries`);
  console.log(`====================================================`);
});

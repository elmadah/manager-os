const express = require('express');
const path = require('path');
const db = require('./db/init');

console.log('Database initialized');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Serve static files from client build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
}

// Routes
const projectsRouter = require('./routes/projects');
const featuresRouter = require('./routes/features');
const teamRouter = require('./routes/team');

app.use('/api/projects', projectsRouter);
app.use('/api', featuresRouter);
app.use('/api/team', teamRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// In production, serve the React app for any non-API route
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

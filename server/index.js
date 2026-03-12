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
const todosRouter = require('./routes/todos');
const importRouter = require('./routes/import');
const sprintsRouter = require('./routes/sprints');
const blockersRouter = require('./routes/blockers');
const oneOnOnesRouter = require('./routes/oneOnOnes');
const notesRouter = require('./routes/notes');

app.use('/api/projects', projectsRouter);
app.use('/api', featuresRouter);
app.use('/api/team', teamRouter);
app.use('/api/todos', todosRouter);
app.use('/api/import', importRouter);
app.use('/api/sprints', sprintsRouter);
app.use('/api/blockers', blockersRouter);
app.use('/api', oneOnOnesRouter);
app.use('/api/notes', notesRouter);

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

const express = require('express');
const path = require('path');
const db = require('./db/init');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '50mb' }));

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
const digestRouter = require('./routes/digest');
const backupRouter = require('./routes/backup');
const timelineRouter = require('./routes/timeline');
const uploadsRouter = require('./routes/uploads');
const jiraSettingsRouter = require('./routes/jiraSettings');
const teamsRouter = require('./routes/teams');
const standupsRouter = require('./routes/standups');

app.use('/api/projects', projectsRouter);
app.use('/api', featuresRouter);
app.use('/api/team', teamRouter);
app.use('/api/todos', todosRouter);
app.use('/api/import', importRouter);
app.use('/api/sprints', sprintsRouter);
app.use('/api/blockers', blockersRouter);
app.use('/api', oneOnOnesRouter);
app.use('/api/notes', notesRouter);
app.use('/api/digest', digestRouter);
app.use('/api', backupRouter);
app.use('/api/timeline', timelineRouter);
app.use('/api/uploads', express.static(path.join(__dirname, '../data/uploads')));
app.use('/api/uploads', uploadsRouter);
app.use('/api/settings/jira', jiraSettingsRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/standups', standupsRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// In production, serve the React app for any non-API route
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

// Initialize database then start server
db.init().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

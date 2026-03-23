import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import TeamPage from './pages/TeamPage';
import TeamMemberPage from './pages/TeamMemberPage';
import SprintsPage from './pages/SprintsPage';
import TodosPage from './pages/TodosPage';
import BlockersPage from './pages/BlockersPage';
import ImportPage from './pages/ImportPage';
import NotesPage from './pages/NotesPage';
import DigestPage from './pages/DigestPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/team/:id" element={<TeamMemberPage />} />
          <Route path="/sprints" element={<SprintsPage />} />
          <Route path="/todos" element={<TodosPage />} />
          <Route path="/blockers" element={<BlockersPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/digest" element={<DigestPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

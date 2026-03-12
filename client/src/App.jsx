import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import PipelinePage from './pages/PipelinePage';
import TeamPage from './pages/TeamPage';
import TeamMemberPage from './pages/TeamMemberPage';
import SprintsPage from './pages/SprintsPage';
import TodosPage from './pages/TodosPage';
import BlockersPage from './pages/BlockersPage';
import ImportPage from './pages/ImportPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/team/:id" element={<TeamMemberPage />} />
          <Route path="/sprints" element={<SprintsPage />} />
          <Route path="/todos" element={<TodosPage />} />
          <Route path="/blockers" element={<BlockersPage />} />
          <Route path="/import" element={<ImportPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

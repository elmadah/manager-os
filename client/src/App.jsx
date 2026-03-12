import { BrowserRouter, Routes, Route } from 'react-router-dom';

function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <h1 className="text-4xl font-bold text-gray-900">Manager OS</h1>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}

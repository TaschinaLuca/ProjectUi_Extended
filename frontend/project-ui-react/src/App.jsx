import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Presentation from './pages/Presentation';
import Home from './pages/Home';
import Workspace from './pages/Workspace';
import Statistics from './pages/Statistics';
import GhostPage from './pages/GhostPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/login" element={<Login />} />
        <Route path="/presentation" element={<Presentation />} />
        <Route path="/home" element={<Home />} />
        <Route path="/workspace" element={<Workspace />} /> 
        <Route path="/statistics" element={<Statistics />} /> 
        <Route path="/ghost" element={<GhostPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
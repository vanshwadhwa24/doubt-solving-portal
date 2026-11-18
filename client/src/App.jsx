import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import { Login } from './pages/Login.jsx';
import { Shell } from './components/Shell.jsx';
import { StudentHome } from './pages/StudentHome.jsx';
import { DoubtThread } from './pages/DoubtThread.jsx';
import { StudentResolved } from './pages/StudentResolved.jsx';
import { EducatorInbox } from './pages/EducatorInbox.jsx';

function Home() {
  const { user } = useAuth();
  return <Navigate to={user.role === 'educator' ? '/inbox' : '/my'} replace />;
}

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-line">Loading…</div>;
  if (!user) return <Login />;
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/my" element={<StudentHome />} />
        <Route path="/resolved" element={<StudentResolved />} />
        <Route path="/doubt/:id" element={<DoubtThread />} />
        <Route path="/inbox" element={<EducatorInbox />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

export function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Protected />
      </HashRouter>
    </AuthProvider>
  );
}

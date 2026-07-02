import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import './index.css';

import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import VideoPage from './pages/VideoPage';
import UploadPage from './pages/UploadPage';
import ProfilePage from './pages/ProfilePage';
import DownloadsPage from './pages/DownloadsPage';
import SubscriptionPage from './pages/SubscriptionPage';
import WatchParty from './pages/WatchParty';
import MyPartiesPage from './pages/MyPartiesPage';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-center"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

const Layout = ({ children }) => (
  <div className="page-wrapper">
    <Navbar />
    <main style={{ flex: 1 }}>
      {children}
    </main>
    <footer style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', padding: '20px 16px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
      🎬 VideoStream · Built with React, Node.js, Cloudinary &amp; Socket.IO
    </footer>
  </div>
);

// Watch party uses full screen, no navbar
const WatchPartyLayout = ({ children }) => (
  <div style={{ minHeight: '100vh' }}>
    {children}
  </div>
);

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route path="/watch-party/:roomId" element={
        <ProtectedRoute>
          <WatchPartyLayout>
            <WatchParty />
          </WatchPartyLayout>
        </ProtectedRoute>
      } />

      <Route path="/" element={<Layout><HomePage /></Layout>} />
      <Route path="/video/:id" element={<Layout><VideoPage /></Layout>} />

      <Route path="/upload" element={
        <Layout>
          <ProtectedRoute><UploadPage /></ProtectedRoute>
        </Layout>
      } />
      <Route path="/profile" element={
        <Layout>
          <ProtectedRoute><ProfilePage /></ProtectedRoute>
        </Layout>
      } />
      <Route path="/downloads" element={
        <Layout>
          <ProtectedRoute><DownloadsPage /></ProtectedRoute>
        </Layout>
      } />
      <Route path="/subscription" element={
        <Layout>
          <SubscriptionPage />
        </Layout>
      } />
      <Route path="/my-parties" element={
        <Layout>
          <ProtectedRoute><MyPartiesPage /></ProtectedRoute>
        </Layout>
      } />

      <Route path="*" element={
        <Layout>
          <div style={{ textAlign: 'center', padding: '80px 16px' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>404</div>
            <h2>Page Not Found</h2>
            <a href="/" className="btn btn-primary" style={{ marginTop: 16 }}>Go Home</a>
          </div>
        </Layout>
      } />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;

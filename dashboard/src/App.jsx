import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import AdminDashboard from './AdminDashboard.jsx';
import MessagingDashboard from './MessagingDashboard.jsx';
import LoginPage from './pages/LoginPage.jsx';
import WhatsappAccountsPage from './pages/WhatsappAccountsPage.jsx';

function ProtectedRoute({ children, role }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (role && user?.role !== role) {
    return (
      <Navigate
        to={user?.role === 'ADMIN' ? '/admin' : '/dashboard'}
        replace
      />
    );
  }
  return children;
}

function HomeRedirect() {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role === 'ADMIN') return <Navigate to="/admin" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute role="CLIENT">
            <MessagingDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/whatsapp-accounts"
        element={
          <ProtectedRoute role="CLIENT">
            <WhatsappAccountsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute role="ADMIN">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

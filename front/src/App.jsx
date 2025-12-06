import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'
import Whiteboard from './components/Whiteboard'
import Dashboard from './components/Dashboard'
import Login from './components/Login'
import Signup from './components/Signup'
import { AuthProvider, useAuth } from './context/AuthProvider'
import { ThemeProvider, useTheme } from './context/ThemeProvider'
import { ToastContainer, useToasts } from './components/Toast'
import Navbar from './components/Navbar'
import './App.css'

// Protected route wrapper
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-base-100">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// Board page wrapper - FULLSCREEN whiteboard
const BoardPage = ({ onError }) => {
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (id) {
      localStorage.setItem('boardId', id);
    }
  }, [id]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-base-100 flex flex-col">
      <Navbar floating={true}>
        <span className="text-xs text-base-content/60 ml-2 hidden sm:inline">Board: {id?.slice(0, 8)}...</span>
      </Navbar>
      {/* Whiteboard takes remaining space */}
      <div className="flex-1 pt-16">
        <Whiteboard onError={onError} />
      </div>
    </div>
  );
};

// Dashboard page wrapper
const DashboardPage = () => {
  const { user, logout, userId } = useAuth();
  const navigate = useNavigate();
  const { toasts, addToast, removeToast } = useToasts();
  const { changeTheme } = useTheme();

  useEffect(() => {
    const handleAuthError = (event) => {
      addToast(event.detail?.message || 'Session expired. Please log in again.', 'error');
      logout();
    };
    window.addEventListener('auth:error', handleAuthError);
    return () => window.removeEventListener('auth:error', handleAuthError);
  }, [addToast, logout]);

  const handleOpenBoard = (boardId) => {
    navigate(`/board/${boardId}`);
  };

  return (
    <div className="min-h-screen bg-base-200">
      <Navbar />
      <Dashboard onOpenBoard={handleOpenBoard} />
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
};

// Auth pages
const AuthPages = () => {
  const [isLogin, setIsLogin] = useState(true);
  const { user } = useAuth();
  const { changeTheme } = useTheme();

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-base-200 flex flex-col items-center justify-center p-4 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed">
      {/* Navbar for Auth Pages */}
      <div className="absolute top-0 w-full">
        <Navbar floating={true} />
      </div>

      <div className="card w-full max-w-md bg-base-100 shadow-2xl mt-16">
        <div className="card-body">
          {isLogin ? (
            <Login onSwitchToSignup={() => setIsLogin(false)} />
          ) : (
            <Signup onSwitchToLogin={() => setIsLogin(true)} />
          )}
        </div>
      </div>
    </div>
  );
};

// Main App with routing
const AppRoutes = () => {
  const { toasts, addToast, removeToast } = useToasts();

  const handleBoardError = (message) => {
    addToast(message, 'error');
  };

  return (
    <Routes>
      <Route path="/login" element={<AuthPages />} />
      <Route path="/signup" element={<AuthPages />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/board/:id"
        element={
          <ProtectedRoute>
            <BoardPage onError={handleBoardError} />
            <ToastContainer toasts={toasts} removeToast={removeToast} />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <AppRoutes />
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App

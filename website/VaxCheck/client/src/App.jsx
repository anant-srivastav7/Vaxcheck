import React, { useState, useEffect } from 'react';
import LandingPage        from './pages/LandingPage';
import AdminLoginPage     from './pages/AdminLoginPage';
import AdminRegisterPage  from './pages/AdminRegisterPage';
import WorkerLoginPage    from './pages/WorkerLoginPage';
import WorkerRegisterPage from './pages/WorkerRegisterPage';
import AdminApp           from './pages/AdminApp';
import WorkerApp          from './pages/WorkerApp';
import { api }            from './api';

/**
 * VaxCheck Root Application
 *
 * Navigation flow:
 *
 *              LandingPage
 *                  │
 *        ┌─────────┴─────────┐
 *      ADMIN               WORKER
 *        │                   │
 *   AdminLogin          WorkerLogin
 *    ▲      │            ▲      │
 *    │      ▼            │      ▼
 *   AdminRegister       WorkerRegister
 *        │                   │
 *        ▼                   ▼
 *     AdminApp            WorkerApp
 *
 * Session is persisted to localStorage so page refresh keeps you logged in.
 */
export default function App() {
  // 'landing' | 'admin-login' | 'admin-register' | 'worker-login' | 'worker-register' | 'admin-app' | 'worker-app'
  const [view, setView] = useState('landing');

  // Try to restore session on mount
  useEffect(() => {
    const savedUser = api.getCurrentUser();
    if (savedUser) {
      setView(savedUser.role === 'admin' ? 'admin-app' : 'worker-app');
    }
  }, []);

  function handleRoleSelect(role) {
    setView(role === 'admin' ? 'admin-login' : 'worker-login');
  }

  function handleAdminLogin(user) {
    setView('admin-app');
  }

  function handleWorkerLogin(user) {
    // A worker logs in → worker portal
    // An admin who comes through worker login also gets worker portal (testing station access)
    setView('worker-app');
  }

  function handleLogout() {
    api.logout();
    setView('landing');
  }

  const savedUser = api.getCurrentUser();

  switch (view) {
    case 'landing':
      return <LandingPage onSelectRole={handleRoleSelect} />;

    case 'admin-login':
      return (
        <AdminLoginPage
          onBack={() => setView('landing')}
          onLoginSuccess={handleAdminLogin}
          onNavigateRegister={() => setView('admin-register')}
        />
      );

    case 'admin-register':
      return (
        <AdminRegisterPage
          onBack={() => setView('landing')}
          onNavigateLogin={() => setView('admin-login')}
          onRegisterSuccess={handleAdminLogin}
        />
      );

    case 'worker-login':
      return (
        <WorkerLoginPage
          onBack={() => setView('landing')}
          onLoginSuccess={handleWorkerLogin}
          onNavigateRegister={() => setView('worker-register')}
        />
      );

    case 'worker-register':
      return (
        <WorkerRegisterPage
          onBack={() => setView('landing')}
          onNavigateLogin={() => setView('worker-login')}
          onRegisterSuccess={handleWorkerLogin}
        />
      );

    case 'admin-app':
      return savedUser ? (
        <AdminApp user={savedUser} onLogout={handleLogout} />
      ) : (
        // Safety fallback: session expired
        <LandingPage onSelectRole={handleRoleSelect} />
      );

    case 'worker-app':
      return savedUser ? (
        <WorkerApp user={savedUser} onLogout={handleLogout} />
      ) : (
        <LandingPage onSelectRole={handleRoleSelect} />
      );

    default:
      return <LandingPage onSelectRole={handleRoleSelect} />;
  }
}

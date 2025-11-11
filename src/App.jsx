import { Link, Outlet, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Planner from './pages/Planner';
import Budget from './pages/Budget';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import Login from './pages/Login';
import ProtectedRoute from './components/ProtectedRoute';

const USER_KEY = 'demo_user_v1';

function Layout() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const checkUser = () => {
      try {
        const raw = localStorage.getItem(USER_KEY);
        if (raw) {
          const u = JSON.parse(raw);
          setUser(u);
        } else {
          setUser(null);
        }
      } catch (e) {
        setUser(null);
      }
    };

    checkUser();
    // 监听 localStorage 变化（跨标签页同步）
    const handleStorageChange = (e) => {
      if (e.key === USER_KEY) {
        checkUser();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    
    // 定期检查（处理同标签页内的变化）
    const interval = setInterval(checkUser, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="brand">AI 旅行规划师</div>
        <nav className="nav">
          <Link to="/">行程规划</Link>
          <Link to="/budget">费用预算</Link>
          <Link to="/settings">设置</Link>
          {user ? (
            <Link to="/profile" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{user.name}</span>
              <span style={{ fontSize: '12px' }}>👤</span>
            </Link>
          ) : (
            <Link to="/login">登录</Link>
          )}
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">© {new Date().getFullYear()} AI Travel Planner</footer>
    </div>
  );
}

function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: '48px', marginBottom: '20px' }}>404</div>
      <div className="section-title" style={{ marginBottom: '20px' }}>页面未找到</div>
      <div className="muted" style={{ marginBottom: '30px' }}>
        您访问的页面不存在
      </div>
      <button className="btn" onClick={() => navigate('/')}>
        返回首页
      </button>
    </div>
  );
}

// 登录页面布局（不显示导航栏）
function LoginLayout() {
  return (
    <div className="app-root">
      <main className="app-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Outlet />
      </main>
    </div>
  );
}

// 已登录用户访问登录页面时重定向到主页
function LoginRedirect() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUser = () => {
      try {
        const raw = localStorage.getItem(USER_KEY);
        if (raw) {
          const u = JSON.parse(raw);
          setUser(u);
        } else {
          setUser(null);
        }
      } catch (e) {
        setUser(null);
      }
      setLoading(false);
    };
    checkUser();
  }, []);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '16px',
        color: 'var(--muted)'
      }}>
        加载中...
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <Login />;
}

export default function App() {
  return (
    <Routes>
      {/* 登录页面路由（独立布局） */}
      <Route path="/login" element={<LoginLayout />}>
        <Route index element={<LoginRedirect />} />
      </Route>
      
      {/* 主应用路由（需要登录） */}
      <Route path="/" element={<Layout />}>
        <Route 
          index 
          element={
            <ProtectedRoute>
              <Planner />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="budget" 
          element={
            <ProtectedRoute>
              <Budget />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="settings" 
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="profile" 
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="*" 
          element={
            <ProtectedRoute>
              <NotFound />
            </ProtectedRoute>
          } 
        />
      </Route>
    </Routes>
  );
}



import { Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getSupabase } from '../services/supabase';

const USER_KEY = 'demo_user_v1';

export default function ProtectedRoute({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUser = () => {
      try {
        // 先检查 Supabase session
        const supabase = getSupabase();
        const session = supabase.auth.getSession();
        
        // 处理 Promise 或直接返回值
        if (session && typeof session.then === 'function') {
          // 如果是 Promise
          session.then(({ data: { session: sess } }) => {
            if (sess?.user) {
              setUser(sess.user);
              setLoading(false);
              return;
            }
            checkLocalStorage();
          }).catch(() => {
            checkLocalStorage();
          });
        } else {
          // 如果是直接返回值
          if (session?.user) {
            setUser(session.user);
            setLoading(false);
            return;
          }
          checkLocalStorage();
        }
      } catch (e) {
        // 如果 Supabase 不可用，使用本地存储
        checkLocalStorage();
      }
    };

    const checkLocalStorage = () => {
      const raw = localStorage.getItem(USER_KEY);
      if (raw) {
        try {
          const u = JSON.parse(raw);
          setUser(u);
        } catch (e) {
          setUser(null);
        }
      } else {
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

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}


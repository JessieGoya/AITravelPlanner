import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const USER_KEY = 'demo_user_v1';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) {
      try {
        const u = JSON.parse(raw);
        setUser(u);
      } catch (e) {
        console.error('Failed to parse user data', e);
      }
    }
  }, []);

  const validateEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const login = async () => {
    setError('');
    
    if (!email.trim()) {
      setError('请输入邮箱地址');
      return;
    }
    
    if (!validateEmail(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    
    if (!password.trim()) {
      setError('请输入密码');
      return;
    }
    
    if (password.length < 6) {
      setError('密码长度至少为6位');
      return;
    }

    setIsLoading(true);
    
    // 模拟登录延迟
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      const u = {
        id: crypto.randomUUID(),
        email: email.trim(),
        name: email.split('@')[0],
        loginTime: new Date().toISOString()
      };
      
      localStorage.setItem(USER_KEY, JSON.stringify(u));
      setUser(u);
      setEmail('');
      setPassword('');
      
      // 如果勾选了记住我，保存到 sessionStorage
      if (rememberMe) {
        sessionStorage.setItem(USER_KEY, JSON.stringify(u));
      }
      
      // 登录成功后跳转到首页
      navigate('/');
    } catch (e) {
      setError('登录失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(USER_KEY);
    setUser(null);
    setError('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !isLoading) {
      login();
    }
  };

  if (user) {
    return (
      <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div className="section-title">用户信息</div>
        <div className="col" style={{ gap: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{user.name}</div>
              <div className="muted" style={{ fontSize: '14px' }}>{user.email}</div>
              {user.loginTime && (
                <div className="muted" style={{ fontSize: '12px', marginTop: 4 }}>
                  登录时间: {new Date(user.loginTime).toLocaleString('zh-CN')}
                </div>
              )}
            </div>
            <button className="btn secondary" onClick={logout} disabled={isLoading}>
              退出登录
            </button>
          </div>
          <div className="muted" style={{ fontSize: '13px', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            提示：当前为演示模式，数据保存在浏览器本地。可替换为云端认证服务（Supabase/Firebase）。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: '500px', margin: '0 auto' }}>
      <div className="section-title">用户登录</div>
      <div className="col" style={{ gap: 16 }}>
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '10px 12px',
            color: '#fca5a5',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}
        
        <div className="col">
          <label style={{ fontSize: '14px', fontWeight: 500, marginBottom: 6 }}>邮箱地址</label>
          <input
            className="input"
            type="email"
            placeholder="your.email@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            autoFocus
          />
        </div>
        
        <div className="col">
          <label style={{ fontSize: '14px', fontWeight: 500, marginBottom: 6 }}>密码</label>
          <input
            className="input"
            type="password"
            placeholder="请输入密码（至少6位）"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
          />
        </div>
        
        <div className="row" style={{ alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            id="rememberMe"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            disabled={isLoading}
            style={{ cursor: 'pointer' }}
          />
          <label htmlFor="rememberMe" style={{ fontSize: '14px', cursor: 'pointer', userSelect: 'none' }}>
            记住我
          </label>
        </div>
        
        <button
          className="btn"
          onClick={login}
          disabled={isLoading || !email.trim() || !password.trim()}
          style={{ width: '100%', marginTop: 8 }}
        >
          {isLoading ? '登录中...' : '登录'}
        </button>
        
        <div className="muted" style={{ fontSize: '13px', marginTop: 8, textAlign: 'center' }}>
          演示模式：任意有效的邮箱和6位以上密码即可登录
        </div>
      </div>
    </div>
  );
}



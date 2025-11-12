import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabase } from '../services/supabase';
import { saveUserProfile } from '../services/plans';

const USER_KEY = 'demo_user_v1';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkUser = () => {
      // 先检查本地 session，避免频繁触发 Supabase 初始化
      const sessionStr = localStorage.getItem('supabase_session');
      if (sessionStr) {
        try {
          const session = JSON.parse(sessionStr);
          if (session && session.user && session.user.id) {
            setUser(session.user);
            return;
          }
        } catch (e) {
          console.error('Failed to parse session', e);
        }
      }
      
      // 回退到本地存储
      const raw = localStorage.getItem(USER_KEY);
      if (raw) {
        try {
          const u = JSON.parse(raw);
          setUser(u);
        } catch (e) {
          console.error('Failed to parse user data', e);
          setUser(null);
        }
      } else {
        setUser(null);
      }
    };
    checkUser();
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

    if (isRegister) {
      if (password !== confirmPassword) {
        setError('两次输入的密码不一致');
        return;
      }
    }

    setIsLoading(true);
    
    try {
      const supabase = getSupabase();
      let result;

      if (isRegister) {
        // 注册
        result = await supabase.auth.signUp(email.trim(), password);
      } else {
        // 登录
        result = await supabase.auth.signInWithPassword(email.trim(), password);
      }

      if (result.error) {
        throw new Error(result.error.message || '操作失败');
      }

      const u = result.user || {
        id: result.session?.user?.id || crypto.randomUUID(),
        email: email.trim(),
        name: email.split('@')[0],
        loginTime: new Date().toISOString()
      };

      // 保存是否为注册操作（在 setIsRegister(false) 之前）
      const wasRegister = isRegister;

      // 同时保存到本地存储（兼容性）
      localStorage.setItem(USER_KEY, JSON.stringify(u));
      setUser(u);
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setIsRegister(false);

      // 上传用户信息到云端（注册时立即上传，登录时检查并上传）
      // 只有在 Supabase 配置有效时才尝试上传
      try {
        const { shouldUseCloudStorage } = await import('../services/supabase');
        if (shouldUseCloudStorage()) {
          // 确保使用最新的 supabase 实例（可能已经初始化）
          const currentSupabase = getSupabase();
          const session = currentSupabase.auth.getSession();
          console.log('检查 session:', session ? { userId: session.user?.id, email: session.user?.email } : '无 session');
          
          if (session && session.user && session.user.id) {
            // 如果是注册，立即上传；如果是登录，也尝试上传（saveUserProfile 会检查是否存在）
            console.log('开始上传用户信息到云端...');
            await saveUserProfile({
              name: u.name || email.split('@')[0],
              email: u.email || email.trim(),
              loginTime: u.loginTime || new Date().toISOString()
            });
            console.log(wasRegister ? '注册信息已上传到云端' : '用户信息已同步到云端');
          } else {
            console.warn('Session 无效，跳过云端上传:', { session, hasUser: !!session?.user, hasUserId: !!session?.user?.id });
          }
        } else {
          console.log('未配置 Supabase，跳过云端上传');
        }
      } catch (error) {
        // 上传失败不影响登录流程，只记录错误
        console.error('上传用户信息到云端失败:', error);
        console.warn('错误详情:', error.message, error.stack);
        // 如果是注册，给出提示但不阻止流程
        if (wasRegister) {
          console.warn('注册成功，但云端同步失败，可在个人资料页面手动同步');
        }
      }
      
      // 登录成功后跳转到首页
      navigate('/');
    } catch (e) {
      setError(e.message || '操作失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      const supabase = getSupabase();
      await supabase.auth.signOut();
    } catch (e) {
      console.error('退出登录失败:', e);
    }
    localStorage.removeItem(USER_KEY);
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
            提示：当前为演示模式，数据保存在浏览器本地。可替换为云端认证服务（Supabase）。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      {/* 欢迎信息 */}
      <div style={{ 
        textAlign: 'center', 
        marginBottom: '40px',
        animation: 'fadeInDown 0.6s ease-out'
      }}>
        <h1 style={{ 
          fontSize: 'clamp(24px, 5vw, 36px)', 
          fontWeight: 700, 
          margin: '0 0 16px 0',
          background: 'linear-gradient(135deg, var(--primary-2), var(--primary))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          letterSpacing: '-0.5px'
        }}>
          欢迎进入 AI Travel Planner
        </h1>
        <p style={{ 
          fontSize: 'clamp(14px, 2.5vw, 16px)', 
          color: 'var(--muted)', 
          margin: 0,
          lineHeight: 1.6
        }}>
          智能旅行规划助手，让您的每一次旅行都更加精彩
        </p>
      </div>

      <div className="card" style={{ maxWidth: '500px', margin: '0 auto', animation: 'fadeInDown 0.8s ease-out' }}>
        <div className="section-title" style={{ textAlign: 'center', marginBottom: '24px' }}>
          {isRegister ? '用户注册' : '用户登录'}
        </div>
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

        {isRegister && (
          <div className="col">
            <label style={{ fontSize: '14px', fontWeight: 500, marginBottom: 6 }}>确认密码</label>
            <input
              className="input"
              type="password"
              placeholder="请再次输入密码"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError('');
              }}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
            />
          </div>
        )}
        
        <button
          className="btn"
          onClick={login}
          disabled={isLoading || !email.trim() || !password.trim() || (isRegister && !confirmPassword.trim())}
          style={{ width: '100%', marginTop: 8 }}
        >
          {isLoading ? (isRegister ? '注册中...' : '登录中...') : (isRegister ? '注册' : '登录')}
        </button>

        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 8 }}>
          <button
            className="btn secondary"
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
              setPassword('');
              setConfirmPassword('');
            }}
            disabled={isLoading}
            style={{ fontSize: '13px', padding: '6px 12px' }}
          >
            {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
          </button>
        </div>
        
        <div className="muted" style={{ fontSize: '13px', marginTop: 8, textAlign: 'center' }}>
          当前使用本地存储模式。可在设置页配置 Supabase 以启用云端同步。
        </div>
        </div>
      </div>
    </div>
  );
}



import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabase } from '../services/supabase';

const USER_KEY = 'demo_user_v1';

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedEmail, setEditedEmail] = useState('');
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    const checkUser = () => {
      try {
        const raw = localStorage.getItem(USER_KEY);
        if (raw) {
          const u = JSON.parse(raw);
          setUser(u);
          setEditedName(u.name || '');
          setEditedEmail(u.email || '');
        }
      } catch (e) {
        console.error('Failed to load user', e);
      }
    };
    checkUser();
  }, []);

  const validateEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSave = () => {
    setError('');
    setSaveStatus('');

    // 验证用户名
    if (!editedName.trim()) {
      setError('用户名不能为空');
      return;
    }

    // 验证邮箱
    if (!editedEmail.trim()) {
      setError('邮箱不能为空');
      return;
    }

    if (!validateEmail(editedEmail.trim())) {
      setError('请输入有效的邮箱地址');
      return;
    }

    // 保存用户信息
    try {
      const updatedUser = {
        ...user,
        name: editedName.trim(),
        email: editedEmail.trim()
      };

      // 更新 localStorage
      localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));

      // 如果 sessionStorage 中有用户信息，也更新
      const sessionRaw = sessionStorage.getItem(USER_KEY);
      if (sessionRaw) {
        sessionStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
      }

      setUser(updatedUser);
      setIsEditing(false);
      setSaveStatus('保存成功！');
      
      // 3秒后清除成功提示
      setTimeout(() => {
        setSaveStatus('');
      }, 3000);

      // 触发 storage 事件，通知其他标签页更新
      window.dispatchEvent(new StorageEvent('storage', {
        key: USER_KEY,
        newValue: JSON.stringify(updatedUser)
      }));
    } catch (e) {
      setError('保存失败，请重试');
      console.error('Failed to save user info', e);
    }
  };

  const handleCancel = () => {
    setEditedName(user?.name || '');
    setEditedEmail(user?.email || '');
    setError('');
    setIsEditing(false);
  };

  const logout = async () => {
    try {
      const supabase = getSupabase();
      await supabase.auth.signOut();
    } catch (e) {
      console.error('退出登录失败:', e);
    }
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(USER_KEY);
    navigate('/login');
  };

  if (!user) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div className="muted">未登录</div>
      </div>
    );
  }

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="section-title">个人资料</div>
          {!isEditing && (
            <button className="btn secondary" onClick={() => setIsEditing(true)}>
              编辑资料
            </button>
          )}
        </div>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '10px 12px',
            color: '#fca5a5',
            fontSize: '14px',
            marginBottom: 16
          }}>
            {error}
          </div>
        )}

        {saveStatus && (
          <div style={{
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '8px',
            padding: '10px 12px',
            color: '#86efac',
            fontSize: '14px',
            marginBottom: 16
          }}>
            {saveStatus}
          </div>
        )}

        <div className="col" style={{ gap: 16 }}>
          {isEditing ? (
            <>
              <div className="col">
                <label style={{ fontSize: '14px', fontWeight: 500, marginBottom: 6 }}>用户名</label>
                <input
                  className="input"
                  type="text"
                  placeholder="请输入用户名"
                  value={editedName}
                  onChange={(e) => {
                    setEditedName(e.target.value);
                    setError('');
                  }}
                  autoFocus
                />
              </div>

              <div className="col">
                <label style={{ fontSize: '14px', fontWeight: 500, marginBottom: 6 }}>邮箱地址</label>
                <input
                  className="input"
                  type="email"
                  placeholder="your.email@example.com"
                  value={editedEmail}
                  onChange={(e) => {
                    setEditedEmail(e.target.value);
                    setError('');
                  }}
                />
              </div>

              <div className="row" style={{ gap: 12, marginTop: 8 }}>
                <button className="btn" onClick={handleSave}>
                  保存
                </button>
                <button className="btn secondary" onClick={handleCancel}>
                  取消
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: '24px' }}>👤</span>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{user.name || '用户'}</div>
                  <div className="muted" style={{ fontSize: '14px' }}>{user.email || '未设置邮箱'}</div>
                  {user.loginTime && (
                    <div className="muted" style={{ fontSize: '12px', marginTop: 4 }}>
                      登录时间: {new Date(user.loginTime).toLocaleString('zh-CN')}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <button className="btn secondary" onClick={logout} style={{ width: '100%' }}>
                  退出登录
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


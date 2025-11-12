import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabase } from '../services/supabase';
import { saveUserProfile, getUserProfile, saveUserPreferences, getUserPreferences } from '../services/plans';

// 偏好设置分类结构
const PREFERENCE_CATEGORIES = {
  destinationType: {
    title: '目的地类型',
    options: ['海滩', '山脉', '城市', '乡村']
  },
  travelTheme: {
    title: '旅行主题',
    options: ['冒险', '休闲', '文化', '历史']
  },
  travelType: {
    title: '旅行类型',
    options: ['奢华', '经济', '家庭', '背包客']
  },
  interests: {
    title: '兴趣点',
    options: ['美食', '购物', '夜生活', '艺术与博物馆', '户外运动']
  },
  travelPace: {
    title: '旅行节奏',
    options: ['快节奏', '慢节奏']
  }
};

const USER_KEY = 'demo_user_v1';

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedEmail, setEditedEmail] = useState('');
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [userPrefs, setUserPrefs] = useState({
    destinationType: [],
    travelTheme: [],
    travelType: [],
    interests: [],
    travelPace: [],
    custom: []
  });
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsSaveStatus, setPrefsSaveStatus] = useState('');
  const [cloudUser, setCloudUser] = useState(null);
  const [customPrefInput, setCustomPrefInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [prefsLoadedFromCloud, setPrefsLoadedFromCloud] = useState(false);
  const [prefsLastSavedTime, setPrefsLastSavedTime] = useState(null);
  const [loadingPrefsFromCloud, setLoadingPrefsFromCloud] = useState(false);

  // 从云端加载偏好设置
  const loadPrefsFromCloud = async () => {
    if (!cloudUser) {
      alert('请先登录');
      return;
    }

    setLoadingPrefsFromCloud(true);
    try {
      const cloudPrefs = await getUserPreferences();
      if (cloudPrefs && cloudPrefs.preferences) {
        // 如果是旧格式（数组），转换为新格式
        if (Array.isArray(cloudPrefs.preferences)) {
          const newPrefs = {
            destinationType: [],
            travelTheme: [],
            travelType: [],
            interests: [],
            travelPace: [],
            custom: []
          };
          
          cloudPrefs.preferences.forEach(pref => {
            if (PREFERENCE_CATEGORIES.destinationType.options.includes(pref)) {
              newPrefs.destinationType.push(pref);
            } else if (PREFERENCE_CATEGORIES.travelTheme.options.includes(pref)) {
              newPrefs.travelTheme.push(pref);
            } else if (PREFERENCE_CATEGORIES.travelType.options.includes(pref)) {
              newPrefs.travelType.push(pref);
            } else if (PREFERENCE_CATEGORIES.interests.options.includes(pref)) {
              newPrefs.interests.push(pref);
            } else if (PREFERENCE_CATEGORIES.travelPace.options.includes(pref)) {
              newPrefs.travelPace.push(pref);
            } else {
              newPrefs.custom.push(pref);
            }
          });
          
          setUserPrefs(newPrefs);
        } else {
          setUserPrefs({
            destinationType: cloudPrefs.preferences.destinationType || [],
            travelTheme: cloudPrefs.preferences.travelTheme || [],
            travelType: cloudPrefs.preferences.travelType || [],
            interests: cloudPrefs.preferences.interests || [],
            travelPace: cloudPrefs.preferences.travelPace || [],
            custom: cloudPrefs.preferences.custom || []
          });
        }
        setPrefsLoadedFromCloud(true);
        if (cloudPrefs.updated_at) {
          setPrefsLastSavedTime(new Date(cloudPrefs.updated_at).toLocaleString('zh-CN'));
        }
        alert('已从云端加载偏好设置');
      } else {
        alert('云端暂无偏好设置');
      }
    } catch (error) {
      console.error('加载云端偏好设置失败:', error);
      alert('加载失败：' + error.message);
    } finally {
      setLoadingPrefsFromCloud(false);
    }
  };

  useEffect(() => {
    const checkUser = async () => {
      // 先检查是否应该使用云端存储
      const { shouldUseCloudStorage } = await import('../services/supabase');
      const useCloud = shouldUseCloudStorage();
      
      if (useCloud) {
        try {
          const supabase = getSupabase();
          const session = supabase.auth.getSession();
          
          if (session) {
            setCloudUser(session.user);
            // 尝试从云端加载用户信息和偏好设置
            try {
              const cloudProfile = await getUserProfile();
              if (cloudProfile) {
                setUser({
                  ...session.user,
                  name: cloudProfile.name,
                  email: cloudProfile.email,
                  loginTime: cloudProfile.login_time
                });
                setEditedName(cloudProfile.name || '');
                setEditedEmail(cloudProfile.email || '');
              } else {
                // 如果云端没有，使用 session 中的信息
                setUser(session.user);
                setEditedName(session.user.email?.split('@')[0] || '');
                setEditedEmail(session.user.email || '');
              }
              
              // 加载偏好设置
              const cloudPrefs = await getUserPreferences();
              if (cloudPrefs && cloudPrefs.preferences) {
                // 如果是旧格式（数组），转换为新格式
                if (Array.isArray(cloudPrefs.preferences)) {
                  // 尝试将旧格式的偏好映射到新格式
                  const newPrefs = {
                    destinationType: [],
                    travelTheme: [],
                    travelType: [],
                    interests: [],
                    travelPace: [],
                    custom: []
                  };
                  
                  // 映射旧偏好到新分类
                  cloudPrefs.preferences.forEach(pref => {
                    if (PREFERENCE_CATEGORIES.destinationType.options.includes(pref)) {
                      newPrefs.destinationType.push(pref);
                    } else if (PREFERENCE_CATEGORIES.travelTheme.options.includes(pref)) {
                      newPrefs.travelTheme.push(pref);
                    } else if (PREFERENCE_CATEGORIES.travelType.options.includes(pref)) {
                      newPrefs.travelType.push(pref);
                    } else if (PREFERENCE_CATEGORIES.interests.options.includes(pref)) {
                      newPrefs.interests.push(pref);
                    } else if (PREFERENCE_CATEGORIES.travelPace.options.includes(pref)) {
                      newPrefs.travelPace.push(pref);
                    } else {
                      newPrefs.custom.push(pref);
                    }
                  });
                  
                  setUserPrefs(newPrefs);
                } else {
                  // 新格式，直接使用
                  setUserPrefs({
                    destinationType: cloudPrefs.preferences.destinationType || [],
                    travelTheme: cloudPrefs.preferences.travelTheme || [],
                    travelType: cloudPrefs.preferences.travelType || [],
                    interests: cloudPrefs.preferences.interests || [],
                    travelPace: cloudPrefs.preferences.travelPace || [],
                    custom: cloudPrefs.preferences.custom || []
                  });
                }
                setPrefsLoadedFromCloud(true);
                if (cloudPrefs.updated_at) {
                  setPrefsLastSavedTime(new Date(cloudPrefs.updated_at).toLocaleString('zh-CN'));
                }
              }
            } catch (error) {
              console.error('加载云端数据失败:', error);
              // 回退到本地存储
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
            }
          }
        } catch (error) {
          console.error('加载云端数据失败:', error);
          // 回退到本地存储
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
        }
      } else {
        // 未登录，使用本地存储
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
      }
    };
    checkUser();
  }, []);

  const validateEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSave = async () => {
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

      // 如果已登录，保存到云端
      if (cloudUser) {
        try {
          await saveUserProfile({
            name: editedName.trim(),
            email: editedEmail.trim(),
            loginTime: user?.loginTime || new Date().toISOString()
          });
        } catch (error) {
          console.error('保存到云端失败:', error);
          // 即使云端保存失败，也继续更新本地
        }
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

  const togglePref = (category, option) => {
    setUserPrefs((prev) => {
      const current = prev[category] || [];
      const updated = current.includes(option)
        ? current.filter((x) => x !== option)
        : [...current, option];
      return {
        ...prev,
        [category]: updated
      };
    });
  };

  const addCustomPref = () => {
    if (customPrefInput.trim() && !userPrefs.custom.includes(customPrefInput.trim())) {
      setUserPrefs((prev) => ({
        ...prev,
        custom: [...prev.custom, customPrefInput.trim()]
      }));
      setCustomPrefInput('');
      setShowCustomInput(false);
    }
  };

  const removeCustomPref = (pref) => {
    setUserPrefs((prev) => ({
      ...prev,
      custom: prev.custom.filter((x) => x !== pref)
    }));
  };

  const handleSavePreferences = async () => {
    if (!cloudUser) {
      alert('请先登录以保存偏好设置到云端');
      return;
    }

    setSavingPrefs(true);
    setPrefsSaveStatus('');
    try {
      // 保存完整结构到云端
      await saveUserPreferences(userPrefs);
      setPrefsSaveStatus('偏好设置保存成功！');
      setPrefsLoadedFromCloud(true);
      setPrefsLastSavedTime(new Date().toLocaleString('zh-CN'));
      setTimeout(() => setPrefsSaveStatus(''), 3000);
    } catch (error) {
      setPrefsSaveStatus(`保存失败：${error.message}`);
      setTimeout(() => setPrefsSaveStatus(''), 5000);
    } finally {
      setSavingPrefs(false);
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

      {/* 偏好设置 */}
      <div className="card">
        <div className="section-title">偏好设置</div>
        <div className="col" style={{ gap: 24 }}>
          {/* 云端数据提示 */}
          {cloudUser && (
            <div style={{ 
              background: prefsLoadedFromCloud ? 'rgba(34, 197, 94, 0.1)' : 'rgba(59, 130, 246, 0.1)',
              border: prefsLoadedFromCloud ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '8px',
              padding: '12px 16px'
            }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4, fontSize: '14px' }}>
                    {prefsLoadedFromCloud ? '✅ 已从云端加载偏好设置' : '💾 偏好设置可保存到云端'}
                  </div>
                  {prefsLastSavedTime && (
                    <div className="muted" style={{ fontSize: '12px' }}>
                      最后保存时间：{prefsLastSavedTime}
                    </div>
                  )}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button 
                    className="btn secondary" 
                    onClick={loadPrefsFromCloud}
                    disabled={loadingPrefsFromCloud}
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                  >
                    {loadingPrefsFromCloud ? '加载中...' : '📥 从云端加载'}
                  </button>
                </div>
              </div>
            </div>
          )}
          
          <div className="muted" style={{ fontSize: '13px' }}>
            设置您的旅行偏好，这些偏好将在生成旅行规划时自动使用
          </div>
          
          {/* 分类偏好设置 */}
          {Object.entries(PREFERENCE_CATEGORIES).map(([key, category]) => (
            <div key={key} className="col" style={{ gap: 12 }}>
              <div style={{ 
                fontSize: '15px', 
                fontWeight: 600, 
                color: 'var(--text)',
                marginBottom: 4
              }}>
                {category.title}
              </div>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: '12px'
              }}>
                {category.options.map((option) => (
                  <label
                    key={option}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      background: userPrefs[key]?.includes(option) 
                        ? 'rgba(59, 130, 246, 0.1)' 
                        : 'transparent',
                      transition: 'all 0.2s',
                      fontSize: '14px'
                    }}
                    onMouseEnter={(e) => {
                      if (!userPrefs[key]?.includes(option)) {
                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.05)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!userPrefs[key]?.includes(option)) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={userPrefs[key]?.includes(option) || false}
                      onChange={() => togglePref(key, option)}
                      style={{
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer',
                        accentColor: 'var(--primary)'
                      }}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}

          {/* 自定义偏好 */}
          <div className="col" style={{ gap: 12 }}>
            <div style={{ 
              fontSize: '15px', 
              fontWeight: 600, 
              color: 'var(--text)',
              marginBottom: 4
            }}>
              其他
            </div>
            
            {/* 自定义偏好列表 */}
            {userPrefs.custom.length > 0 && (
              <div style={{ 
                display: 'flex', 
                flexWrap: 'wrap', 
                gap: '8px',
                marginBottom: 8
              }}>
                {userPrefs.custom.map((pref) => (
                  <div
                    key={pref}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      fontSize: '14px'
                    }}
                  >
                    <span>{pref}</span>
                    <button
                      onClick={() => removeCustomPref(pref)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: '16px',
                        lineHeight: 1,
                        opacity: 0.6
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = 0.6}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 添加自定义偏好 */}
            {showCustomInput ? (
              <div className="row" style={{ gap: 8 }}>
                <input
                  className="input"
                  type="text"
                  placeholder="输入自定义偏好"
                  value={customPrefInput}
                  onChange={(e) => setCustomPrefInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      addCustomPref();
                    }
                  }}
                  style={{ flex: 1 }}
                  autoFocus
                />
                <button className="btn" onClick={addCustomPref}>
                  添加
                </button>
                <button 
                  className="btn secondary" 
                  onClick={() => {
                    setShowCustomInput(false);
                    setCustomPrefInput('');
                  }}
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                className="btn secondary"
                onClick={() => setShowCustomInput(true)}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: '1px dashed var(--border)',
                  background: 'transparent'
                }}
              >
                自定义偏好
              </button>
            )}
          </div>

          {prefsSaveStatus && (
            <div style={{
              background: prefsSaveStatus.includes('成功') ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: prefsSaveStatus.includes('成功') ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              padding: '10px 12px',
              color: prefsSaveStatus.includes('成功') ? '#86efac' : '#fca5a5',
              fontSize: '14px'
            }}>
              {prefsSaveStatus}
            </div>
          )}

          {cloudUser && (
            <div className="row" style={{ gap: 12 }}>
              <button 
                className="btn" 
                onClick={handleSavePreferences}
                disabled={savingPrefs}
              >
                {savingPrefs ? '保存中...' : '💾 保存偏好设置到云端'}
              </button>
            </div>
          )}

          {!cloudUser && (
            <div className="muted" style={{ fontSize: '12px' }}>
              请先登录以保存偏好设置到云端
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


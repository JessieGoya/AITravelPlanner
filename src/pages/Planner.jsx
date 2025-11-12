import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import VoiceInput from '../shared/VoiceInput';
import MapView from '../shared/MapView';
import MarkdownPreview from '../shared/MarkdownPreview';
import { generatePlan } from '../services/llm';
import { getRuntimeConfig } from '../services/config';
import { parseTravelInput } from '../services/inputParser';
import { savePlan, getUserPlans, getPlan, deletePlan, getUserPreferences } from '../services/plans';
import { getSupabase } from '../services/supabase';
import { parsePlacesFromPlan, parseRouteSequence } from '../services/routeParser';

const PREFERENCES = ['美食', '自然', '历史', '艺术', '亲子', '动漫', '购物'];
const USER_KEY = 'demo_user_v1';
const DRAFT_STORAGE_KEY = 'planner_draft_state_v1';
const MAP_SNAPSHOT_STORAGE_KEY = 'planner_map_snapshot_v1';

export default function Planner() {
  const [destination, setDestination] = useState('');
  const [days, setDays] = useState(5);
  const [budget, setBudget] = useState(10000);
  const [people, setPeople] = useState(2);
  const [prefs, setPrefs] = useState(['美食']);
  const [startDate, setStartDate] = useState('');
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [planOutput, setPlanOutput] = useState('');
  const [currentPlanId, setCurrentPlanId] = useState(null);
  const [savedPlans, setSavedPlans] = useState([]);
  const [showPlansList, setShowPlansList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);
  const [places, setPlaces] = useState([]);
  const [routeSequence, setRouteSequence] = useState([]);
  const [routeStrategy, setRouteStrategy] = useState('driving');
  const [parsingPlaces, setParsingPlaces] = useState(false);
  const [mapSnapshot, setMapSnapshot] = useState(() => {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    try {
      const raw = window.sessionStorage.getItem(MAP_SNAPSHOT_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (error) {
      console.warn('读取地图快照失败:', error);
    }
    return null;
  });
  const isInitializedRef = useRef(false);

  const cfg = useMemo(getRuntimeConfig, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    if (!mapSnapshot) {
      try {
        window.sessionStorage.removeItem(MAP_SNAPSHOT_STORAGE_KEY);
      } catch (error) {
        console.warn('移除地图快照失败:', error);
      }
      return;
    }
    try {
      window.sessionStorage.setItem(MAP_SNAPSHOT_STORAGE_KEY, JSON.stringify(mapSnapshot));
    } catch (error) {
      console.warn('保存地图快照到会话存储失败:', error);
    }
  }, [mapSnapshot]);

  // 保存草稿状态到 localStorage
  const saveDraft = () => {
    const draft = {
      destination,
      days,
      budget,
      people,
      prefs,
      startDate,
      inputText,
      planOutput,
      places,
      routeSequence,
      routeStrategy,
      mapSnapshot,
      currentPlanId,
      timestamp: Date.now()
    };
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch (error) {
      console.error('保存草稿失败:', error);
    }
  };

  // 从 localStorage 加载草稿状态
  const loadDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        // 只恢复非空的状态，避免覆盖用户可能正在输入的内容
        if (draft.destination) setDestination(draft.destination);
        if (draft.days) setDays(draft.days);
        if (draft.budget) setBudget(draft.budget);
        if (draft.people) setPeople(draft.people);
        if (draft.prefs && draft.prefs.length > 0) setPrefs(draft.prefs);
        if (draft.startDate) setStartDate(draft.startDate);
        if (draft.inputText) setInputText(draft.inputText);
        if (draft.planOutput) setPlanOutput(draft.planOutput);
        if (draft.places && draft.places.length > 0) setPlaces(draft.places);
        if (draft.routeSequence && draft.routeSequence.length > 0) setRouteSequence(draft.routeSequence);
        if (draft.routeStrategy) setRouteStrategy(draft.routeStrategy);
        if (draft.mapSnapshot) setMapSnapshot(draft.mapSnapshot);
        if (draft.currentPlanId) setCurrentPlanId(draft.currentPlanId);
        return true;
      }
    } catch (error) {
      console.error('加载草稿失败:', error);
    }
    return false;
  };

  // 清除草稿状态
  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch (error) {
      console.error('清除草稿失败:', error);
    }
  };

  // 加载已保存的行程
  const loadPlans = async () => {
    try {
      const plans = await getUserPlans();
      setSavedPlans(plans);
    } catch (error) {
      console.error('加载行程失败:', error);
      if (error.message !== '请先登录') {
        setSavedPlans([]);
      }
    }
  };

  // 检查用户登录状态并加载偏好设置，同时恢复草稿状态
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
            setUser(session.user);
            await loadPlans();
            
            // 加载用户的偏好设置
            try {
              const userPrefs = await getUserPreferences();
              if (userPrefs && userPrefs.preferences) {
                // 将偏好设置扁平化为数组
                let flattenedPrefs = [];
                
                if (Array.isArray(userPrefs.preferences)) {
                  // 旧格式：直接是数组
                  flattenedPrefs = userPrefs.preferences;
                } else if (typeof userPrefs.preferences === 'object') {
                  // 新格式：分类结构，需要扁平化
                  const prefs = userPrefs.preferences;
                  flattenedPrefs = [
                    ...(prefs.destinationType || []),
                    ...(prefs.travelTheme || []),
                    ...(prefs.travelType || []),
                    ...(prefs.interests || []),
                    ...(prefs.travelPace || []),
                    ...(prefs.custom || [])
                  ];
                }
                
                if (flattenedPrefs.length > 0) {
                  // 合并云端偏好设置和当前偏好设置（去重）
                  setPrefs((currentPrefs) => {
                    const merged = [...new Set([...flattenedPrefs, ...currentPrefs])];
                    return merged;
                  });
                }
              }
            } catch (error) {
              console.error('加载用户偏好设置失败:', error);
            }
          }
        } catch (error) {
          console.error('加载云端数据失败:', error);
          // 回退到本地存储
          const raw = localStorage.getItem(USER_KEY);
          if (raw) {
            try {
              setUser(JSON.parse(raw));
            } catch (e) {
              setUser(null);
            }
          } else {
            setUser(null);
          }
        }
      } else {
        // 回退到本地存储
        const raw = localStorage.getItem(USER_KEY);
        if (raw) {
          try {
            setUser(JSON.parse(raw));
          } catch (e) {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }

      // 在用户信息加载完成后，恢复草稿状态（但只在首次初始化时）
      if (!isInitializedRef.current) {
        loadDraft();
        isInitializedRef.current = true;
      }
    };
    checkUser();
  }, []);

  // 自动保存草稿状态（当相关状态变化时）
  useEffect(() => {
    // 只在初始化完成后才保存，避免初始化时覆盖
    if (isInitializedRef.current) {
      const draft = {
        destination,
        days,
        budget,
        people,
        prefs,
        startDate,
        inputText,
        planOutput,
        places,
        routeSequence,
        routeStrategy,
        mapSnapshot,
        currentPlanId,
        timestamp: Date.now()
      };
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      } catch (error) {
        console.error('保存草稿失败:', error);
      }
    }
  }, [destination, days, budget, people, prefs, startDate, inputText, planOutput, places, routeSequence, routeStrategy, currentPlanId]);

  // 智能解析输入文本
  useEffect(() => {
    if (!inputText || !inputText.trim() || !cfg.llm.apiKey) {
      return;
    }

    // 延迟执行，避免用户输入时频繁调用
    const timer = setTimeout(async () => {
      setParsing(true);
      try {
        const parsed = await parseTravelInput(inputText);
        if (parsed) {
          if (parsed.destination) setDestination(parsed.destination);
          if (parsed.days > 0) setDays(parsed.days);
          if (parsed.budget > 0) setBudget(parsed.budget);
          if (parsed.people > 0) setPeople(parsed.people);
          if (parsed.preferences && parsed.preferences.length > 0) {
            setPrefs(parsed.preferences);
          }
          if (parsed.startDate) setStartDate(parsed.startDate);
        }
      } catch (error) {
        console.error('解析输入失败:', error);
      } finally {
        setParsing(false);
      }
    }, 5000); // 用户停止输入 5.0 秒后解析

    return () => clearTimeout(timer);
  }, [inputText, cfg.llm.apiKey]);

  const togglePref = (p) => {
    setPrefs((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  const handlePlan = async () => {
    setLoading(true);
    setPlaces([]);
    setRouteSequence([]);
    setMapSnapshot(null);
    // 生成新行程时，清除已保存的行程ID（因为这是新生成的）
    setCurrentPlanId(null);
    try {
      const userPrompt = `目的地:${destination}\n天数:${days}\n预算:${budget}\n人数:${people}\n偏好:${prefs.join(',')}\n${startDate ? `出发日期:${startDate}\n` : ''}请输出详细的逐日行程、交通、住宿、景点、餐饮和门票费用估算（人民币），并给出现实可查的地标名称。`;
      const res = await generatePlan(userPrompt);
      setPlanOutput(res);
      
      // 解析地点和路线
      if (res) {
        setParsingPlaces(true);
        try {
          const parsedPlaces = await parsePlacesFromPlan(res, destination);
          const parsedRoutes = parseRouteSequence(res);
          // 限制天数不超过用户请求的天数，避免错误解析导致的"多出天数"
          const limitedRoutes = Array.isArray(parsedRoutes) ? parsedRoutes.slice(0, Math.max(0, Number(days) || 0)) : [];
          setPlaces(parsedPlaces);
          setRouteSequence(limitedRoutes);
          setMapSnapshot(null);
        } catch (error) {
          console.error('解析地点和路线失败:', error);
        } finally {
          setParsingPlaces(false);
        }
      }
    } catch (e) {
      setPlanOutput(`生成失败：${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  // 保存行程
  const handleSavePlan = async () => {
    if (!user) {
      alert('请先登录以保存行程');
      return;
    }

    if (!destination || !planOutput) {
      alert('请先生成行程后再保存');
      return;
    }

    setSaving(true);
    try {
      const savedPlan = await savePlan({
        id: currentPlanId,
        destination,
        days,
        budget,
        people,
        preferences: prefs,
        startDate,
        planContent: planOutput,
        inputText,
        notes: ''
      });
      alert('保存成功！');
      // 保存成功后，更新 currentPlanId 为保存后的ID（如果有）
      if (savedPlan && savedPlan.id) {
        setCurrentPlanId(savedPlan.id);
      } else {
        setCurrentPlanId(null);
      }
      await loadPlans();
    } catch (error) {
      alert('保存失败：' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // 加载已保存的行程
  const handleLoadPlan = async (planId) => {
    try {
      const plan = await getPlan(planId);
      setDestination(plan.destination || '');
      setDays(plan.days || 5);
      setBudget(plan.budget || 10000);
      setPeople(plan.people || 2);
      setPrefs(plan.preferences || ['美食']);
      setStartDate(plan.start_date || '');
      setInputText(plan.input_text || '');
      const planContent = plan.plan_content || '';
      setPlanOutput(planContent);
      setMapSnapshot(null);
      setCurrentPlanId(plan.id);
      setShowPlansList(false);
      
      // 解析地点和路线
      if (planContent) {
        setParsingPlaces(true);
        try {
          const parsedPlaces = await parsePlacesFromPlan(planContent, plan.destination || '');
          const parsedRoutes = parseRouteSequence(planContent);
          setPlaces(parsedPlaces);
          setRouteSequence(parsedRoutes);
          setMapSnapshot(null);
        } catch (error) {
          console.error('解析地点和路线失败:', error);
        } finally {
          setParsingPlaces(false);
        }
      }
      
      alert('已加载行程');
    } catch (error) {
      alert('加载失败：' + error.message);
    }
  };

  // 删除行程
  const handleDeletePlan = async (planId) => {
    if (!confirm('确定要删除这个行程吗？')) {
      return;
    }

    try {
      await deletePlan(planId);
      await loadPlans();
      if (currentPlanId === planId) {
        // 如果删除的是当前正在编辑的行程，清空表单并清除草稿
        setCurrentPlanId(null);
        setDestination('');
        setDays(5);
        setBudget(10000);
        setPeople(2);
        setPrefs(['美食']);
        setStartDate('');
        setInputText('');
        setPlanOutput('');
        setPlaces([]);
        setRouteSequence([]);
        clearDraft();
        setMapSnapshot(null);
      }
      alert('删除成功');
    } catch (error) {
      alert('删除失败：' + error.message);
    }
  };

  const handleRouteStrategyChange = useCallback((value) => {
    setRouteStrategy(value);
    setMapSnapshot(null);
  }, []);

  return (
    <div className="col" style={{ gap: 20 }}>
      {/* 上半部分：需求输入（左侧）和地图（右侧） */}
      <div className="grid planner-top-grid" style={{ gap: 20 }}>
        {/* 左侧：需求输入（缩小） */}
        <div className="card" style={{ minWidth: 0 }}>
          <div className="section-title">需求输入</div>
          <div className="col">
            <label>目的地</label>
            <input className="input" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="如：日本东京" />
          </div>
          <div className="grid cols-3" style={{ marginTop: 12 }}>
            <div className="col">
              <label>天数</label>
              <input className="input" type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value))} />
            </div>
            <div className="col">
              <label>预算（元）</label>
              <input className="input" type="number" min={0} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
            </div>
            <div className="col">
              <label>人数</label>
              <input className="input" type="number" min={1} value={people} onChange={(e) => setPeople(Number(e.target.value))} />
            </div>
          </div>
          <div className="col" style={{ marginTop: 12 }}>
            <label>偏好</label>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {PREFERENCES.map((p) => (
                <button
                  key={p}
                  className="btn secondary"
                  onClick={() => togglePref(p)}
                  style={{ opacity: prefs.includes(p) ? 1 : 0.6, fontSize: '12px', padding: '4px 8px' }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="col" style={{ marginTop: 12 }}>
            <label>语音/文字输入 {parsing && <span className="muted" style={{ fontSize: '11px' }}>（正在解析...）</span>}</label>
            <VoiceInput onText={(t) => {
              // 如果已有文本，追加新文本；否则直接设置
              setInputText(prev => prev ? `${prev}，${t}` : t);
            }} />
            <textarea
              className="input"
              placeholder="请输入语音或文字，例如：我想去日本，5 天，预算 1 万元，喜欢美食和动漫，带孩子"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={2}
              style={{ fontSize: '13px' }}
            />
            {inputText && (
              <div className="muted" style={{ fontSize: '11px', marginTop: 4 }}>
                提示：系统会自动从您的输入中提取目的地、天数、预算等信息。
              </div>
            )}
          </div>
          
          {startDate && (
            <div className="col" style={{ marginTop: 12 }}>
              <label>出发日期</label>
              <input 
                className="input" 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)} 
                style={{ fontSize: '13px' }}
              />
            </div>
          )}

          <div className="row" style={{ marginTop: 12, gap: 6, flexWrap: 'wrap' }}>
            <button className="btn" onClick={handlePlan} disabled={loading || !cfg.llm.apiKey} style={{ fontSize: '13px', padding: '8px 12px' }}>
              {loading ? '生成中…' : cfg.llm.apiKey ? '生成行程' : '请先配置 LLM Key'}
            </button>
            {user && (
              <>
                <button 
                  className="btn secondary" 
                  onClick={handleSavePlan} 
                  disabled={saving || !planOutput}
                  style={{ fontSize: '13px', padding: '8px 12px' }}
                >
                  {saving ? '保存中…' : '保存'}
                </button>
                <button 
                  className="btn secondary" 
                  onClick={() => {
                    setShowPlansList(!showPlansList);
                    if (!showPlansList) {
                      loadPlans();
                    }
                  }}
                  style={{ fontSize: '13px', padding: '8px 12px' }}
                >
                  {showPlansList ? '隐藏' : '我的行程'}
                </button>
              </>
            )}
            {(destination || inputText || planOutput) && (
              <button 
                className="btn secondary" 
                onClick={() => {
                  if (confirm('确定要清除当前输入和生成的内容吗？此操作不可撤销。')) {
                    setDestination('');
                    setDays(5);
                    setBudget(10000);
                    setPeople(2);
                    setPrefs(['美食']);
                    setStartDate('');
                    setInputText('');
                    setPlanOutput('');
                    setPlaces([]);
                    setRouteSequence([]);
                    setCurrentPlanId(null);
                    clearDraft();
                  }
                }}
                style={{ fontSize: '13px', padding: '8px 12px', color: 'var(--muted)' }}
              >
                清除
              </button>
            )}
          </div>

          {showPlansList && user && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="section-title" style={{ fontSize: '14px' }}>我的行程列表</div>
              {savedPlans.length === 0 ? (
                <div className="muted" style={{ padding: '16px', textAlign: 'center', fontSize: '12px' }}>
                  暂无已保存的行程
                </div>
              ) : (
                <div className="col" style={{ gap: 6 }}>
                  {savedPlans.map((plan) => (
                    <div 
                      key={plan.id} 
                      className="row" 
                      style={{ 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        padding: '8px',
                        background: 'var(--bg-secondary)',
                        borderRadius: '6px',
                        border: currentPlanId === plan.id ? '2px solid var(--primary)' : '1px solid var(--border)'
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, marginBottom: 2, fontSize: '13px' }}>
                          {plan.destination || '未命名行程'}
                        </div>
                        <div className="muted" style={{ fontSize: '11px' }}>
                          {plan.days}天 · {plan.people}人 · ¥{plan.budget.toLocaleString()}
                          {plan.start_date && ` · ${plan.start_date}`}
                        </div>
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <button 
                          className="btn secondary" 
                          style={{ fontSize: '11px', padding: '4px 8px' }}
                          onClick={() => handleLoadPlan(plan.id)}
                        >
                          加载
                        </button>
                        <button 
                          className="btn secondary" 
                          style={{ fontSize: '11px', padding: '4px 8px' }}
                          onClick={() => handleDeletePlan(plan.id)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 右侧：地图（放大） */}
        <div className="card" style={{ minWidth: 0 }}>
          <div className="section-title">
            地图
            {parsingPlaces && <span className="muted" style={{ fontSize: '12px', marginLeft: 8 }}>（正在解析地点...）</span>}
          </div>
          <div className="row" style={{ marginBottom: 8, gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '12px' }}>路线类型：</label>
            <select 
              className="input" 
              value={routeStrategy} 
              onChange={(e) => handleRouteStrategyChange(e.target.value)}
              style={{ fontSize: '12px', padding: '4px 8px', width: 'auto' }}
            >
              <option value="driving">驾车</option>
              <option value="walking">步行</option>
              <option value="transit">公交</option>
            </select>
            {places.length > 0 && (
              <span className="muted" style={{ fontSize: '12px', marginLeft: 8 }}>
                已解析 {places.length} 个地点
              </span>
            )}
          </div>
          <MapView 
            destination={destination}
            places={places}
            routeSequence={routeSequence}
            routeStrategy={routeStrategy}
            persistedState={mapSnapshot}
            onStatePersist={(snapshot) => {
              if (!snapshot) return;
              setMapSnapshot(snapshot);
            }}
          />
          {!cfg.map.key && (
            <div className="muted" style={{ marginTop: 8, fontSize: '12px' }}>
              未配置地图 Key，前往设置页填入高德/百度 Key
            </div>
          )}
          {cfg.map.key && places.length === 0 && planOutput && (
            <div className="muted" style={{ marginTop: 8, fontSize: '12px' }}>
              提示：地图将在地点解析完成后自动显示
            </div>
          )}
        </div>
      </div>

      {/* 下半部分：AI 规划结果（全宽） */}
      {planOutput && (
        <div className="card">
          <div className="section-title">AI 规划结果</div>
          <MarkdownPreview content={planOutput} />
        </div>
      )}
    </div>
  );
}



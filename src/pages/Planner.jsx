import { useEffect, useMemo, useState } from 'react';
import VoiceInput from '../shared/VoiceInput';
import MapView from '../shared/MapView';
import MarkdownPreview from '../shared/MarkdownPreview';
import { generatePlan } from '../services/llm';
import { getRuntimeConfig } from '../services/config';
import { parseTravelInput } from '../services/inputParser';
import { savePlan, getUserPlans, getPlan, deletePlan } from '../services/plans';
import { getSupabase } from '../services/supabase';
import { parsePlacesFromPlan, parseRouteSequence } from '../services/routeParser';

const PREFERENCES = ['美食', '自然', '历史', '艺术', '亲子', '动漫', '购物'];
const USER_KEY = 'demo_user_v1';

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

  const cfg = useMemo(getRuntimeConfig, []);

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

  // 检查用户登录状态
  useEffect(() => {
    const checkUser = async () => {
      const supabase = getSupabase();
      const session = supabase.auth.getSession();
      if (session) {
        setUser(session.user);
        await loadPlans();
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
    };
    checkUser();
  }, []);

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
          // 限制天数不超过用户请求的天数，避免错误解析导致的“多出天数”
          const limitedRoutes = Array.isArray(parsedRoutes) ? parsedRoutes.slice(0, Math.max(0, Number(days) || 0)) : [];
          setPlaces(parsedPlaces);
          setRouteSequence(limitedRoutes);
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
      await savePlan({
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
      setCurrentPlanId(null); // 保存后重置，下次会创建新计划
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
        // 如果删除的是当前正在编辑的行程，清空表单
        setCurrentPlanId(null);
        setDestination('');
        setDays(5);
        setBudget(10000);
        setPeople(2);
        setPrefs(['美食']);
        setStartDate('');
        setInputText('');
        setPlanOutput('');
      }
      alert('删除成功');
    } catch (error) {
      alert('删除失败：' + error.message);
    }
  };

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
              onChange={(e) => setRouteStrategy(e.target.value)}
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



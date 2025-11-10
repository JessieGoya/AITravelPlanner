import { useEffect, useMemo, useState } from 'react';
import { getRuntimeConfig } from '../services/config';
import VoiceInput from '../shared/VoiceInput';
import MarkdownPreview from '../shared/MarkdownPreview';
import { parseBudgetInput, analyzeBudget } from '../services/inputParser';

const STORAGE_KEY = 'budget_entries_v1';
const BUDGET_KEY = 'total_budget_v1';

export default function Budget() {
  const cfg = useMemo(getRuntimeConfig, []);
  const [entries, setEntries] = useState([]);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]); // 默认今天
  const [category, setCategory] = useState('交通');
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const [totalBudget, setTotalBudget] = useState(0);
  const [voiceInput, setVoiceInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) setEntries(JSON.parse(raw));
    const budgetRaw = localStorage.getItem(BUDGET_KEY);
    if (budgetRaw) setTotalBudget(Number(budgetRaw) || 0);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    localStorage.setItem(BUDGET_KEY, String(totalBudget));
  }, [totalBudget]);

  // 智能解析语音输入
  useEffect(() => {
    if (!voiceInput || !voiceInput.trim()) {
      return;
    }

    // 如果没有配置 LLM API Key，使用后备解析
    if (!cfg.llm.apiKey) {
      const timer = setTimeout(async () => {
        setParsing(true);
        try {
          const parsed = await parseBudgetInput(voiceInput);
          if (parsed) {
            if (parsed.date) setDate(parsed.date);
            if (parsed.category) setCategory(parsed.category);
            if (parsed.amount > 0) setAmount(parsed.amount);
            if (parsed.note) setNote(parsed.note);
          }
        } catch (error) {
          console.error('解析语音输入失败:', error);
        } finally {
          setParsing(false);
          setVoiceInput('');
        }
      }, 500);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(async () => {
      setParsing(true);
      try {
        const parsed = await parseBudgetInput(voiceInput);
        if (parsed) {
          if (parsed.date) setDate(parsed.date);
          if (parsed.category) setCategory(parsed.category);
          if (parsed.amount > 0) setAmount(parsed.amount);
          if (parsed.note) setNote(parsed.note);
        }
      } catch (error) {
        console.error('解析语音输入失败:', error);
      } finally {
        setParsing(false);
        setVoiceInput('');
      }
    }, 2000); // 用户停止输入 2 秒后解析

    return () => clearTimeout(timer);
  }, [voiceInput, cfg.llm.apiKey]);

  const addEntry = () => {
    if (!date || !category || !amount) return;
    const e = { id: crypto.randomUUID(), date, category, amount, note };
    setEntries((prev) => [e, ...prev]);
    setAmount(0);
    setNote('');
  };

  const removeEntry = (id) => setEntries((prev) => prev.filter((x) => x.id !== id));

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalysisResult('');
    try {
      const result = await analyzeBudget(entries, totalBudget > 0 ? totalBudget : null);
      setAnalysisResult(result);
    } catch (error) {
      setAnalysisResult(`分析失败：${error.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const total = entries.reduce((s, e) => s + e.amount, 0);
  
  // 计算各类别支出统计
  const categoryStats = useMemo(() => {
    const stats = {};
    entries.forEach(entry => {
      const cat = entry.category || '其他';
      stats[cat] = (stats[cat] || 0) + (entry.amount || 0);
    });
    return stats;
  }, [entries]);

  return (
    <div className="col" style={{ gap: 16 }}>
      {/* 总预算设置 */}
      <div className="card">
        <div className="section-title">总预算设置</div>
        <div className="row" style={{ alignItems: 'center', gap: 12 }}>
          <input
            className="input"
            type="number"
            min={0}
            value={totalBudget || ''}
            onChange={(e) => setTotalBudget(Number(e.target.value) || 0)}
            placeholder="输入总预算（可选）"
            style={{ flex: 1, maxWidth: 300 }}
          />
          <span className="muted">元</span>
          {totalBudget > 0 && (
            <div style={{ marginLeft: 'auto' }}>
              <span className="muted">已花费：</span>
              <b style={{ color: total > totalBudget ? 'var(--error)' : 'var(--primary)' }}>
                {total.toLocaleString()} 元
              </b>
              <span className="muted"> / {totalBudget.toLocaleString()} 元</span>
              {totalBudget - total > 0 && (
                <span className="muted" style={{ marginLeft: 8 }}>
                  （剩余：{(totalBudget - total).toLocaleString()} 元）
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid cols-2" style={{ gap: 16 }}>
        <div className="card">
          <div className="section-title">新增支出</div>
          
          {/* 语音输入 */}
          <div className="col" style={{ marginBottom: 12 }}>
            <label>语音输入 {parsing && <span className="muted" style={{ fontSize: '12px' }}>（正在解析...）</span>}</label>
            <VoiceInput onText={(t) => {
              setVoiceInput(t);
            }} />
            <div className="muted" style={{ fontSize: '12px', marginTop: 4 }}>
              提示：可以说"今天交通费500元"、"昨天午餐200元"等，系统会自动识别日期、类别和金额
              {!cfg.llm.apiKey && (
                <span style={{ display: 'block', marginTop: 4, color: 'var(--warning)' }}>
                  注意：未配置 LLM API Key，将使用基础解析功能
                </span>
              )}
            </div>
          </div>

          {/* 手动输入表单 */}
          <div className="grid cols-3" style={{ marginTop: 12 }}>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {['交通', '住宿', '门票', '餐饮', '购物', '其他'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input className="input" type="number" min={0} value={amount || ''} onChange={(e) => setAmount(Number(e.target.value) || 0)} placeholder="金额" />
          </div>
          <div className="col" style={{ marginTop: 12 }}>
            <input className="input" placeholder="备注（可选）" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={addEntry} disabled={!date || !category || !amount}>
              添加
            </button>
          </div>
        </div>

        <div className="card">
          <div className="section-title">支出记录</div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <div>合计：<b>{total.toLocaleString()} 元</b></div>
            {cfg.budget.currency && <div className="muted">货币：{cfg.budget.currency}</div>}
          </div>
          
          {/* 类别统计 */}
          {Object.keys(categoryStats).length > 0 && (
            <div style={{ marginBottom: 12, padding: 8, background: 'var(--bg-secondary)', borderRadius: 4, fontSize: '12px' }}>
              <div className="muted" style={{ marginBottom: 4 }}>各类别支出：</div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                {Object.entries(categoryStats).map(([cat, amt]) => (
                  <span key={cat}>
                    <b>{cat}</b>: {amt.toLocaleString()} 元
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="col" style={{ gap: 8, maxHeight: 300, overflowY: 'auto' }}>
            {entries.length === 0 && <div className="muted">暂无记录</div>}
            {entries.map((e) => (
              <div key={e.id} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                <div>
                  <div><b>{e.category}</b> · {e.amount.toLocaleString()} 元</div>
                  <div className="muted" style={{ fontSize: 12 }}>{e.date} {e.note || ''}</div>
                </div>
                <button className="btn secondary" onClick={() => removeEntry(e.id)}>删除</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI 预算分析 */}
      <div className="card">
        <div className="section-title">AI 预算分析</div>
        <div className="row" style={{ marginBottom: 12, alignItems: 'center', gap: 12 }}>
          <button 
            className="btn" 
            onClick={handleAnalyze} 
            disabled={analyzing || entries.length === 0 || !cfg.llm.apiKey}
          >
            {analyzing ? '分析中...' : '🤖 开始 AI 分析'}
          </button>
          {!cfg.llm.apiKey && (
            <span className="muted" style={{ fontSize: '12px' }}>
              需要在设置页面配置 LLM API Key 才能使用 AI 分析功能
            </span>
          )}
        </div>
        {analysisResult && (
          <MarkdownPreview content={analysisResult} />
        )}
        {!analysisResult && entries.length > 0 && (
          <div className="muted" style={{ fontSize: '12px' }}>
            点击按钮获取 AI 智能预算分析，包括支出结构分析、预算控制建议和优化建议
          </div>
        )}
      </div>
    </div>
  );
}



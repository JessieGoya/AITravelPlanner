import { useEffect, useMemo, useState } from 'react';
import VoiceInput from '../shared/VoiceInput';
import MapView from '../shared/MapView';
import { generatePlan } from '../services/llm';
import { getRuntimeConfig } from '../services/config';

const PREFERENCES = ['美食', '自然', '历史', '艺术', '亲子', '动漫', '购物'];

export default function Planner() {
  const [destination, setDestination] = useState('');
  const [days, setDays] = useState(5);
  const [budget, setBudget] = useState(10000);
  const [people, setPeople] = useState(2);
  const [prefs, setPrefs] = useState(['美食']);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [planOutput, setPlanOutput] = useState('');

  const cfg = useMemo(getRuntimeConfig, []);

  useEffect(() => {
    if (inputText) {
      const m = inputText.match(/(去|到)([^，。\s]+).*?(\d+)\s*[天日].*?预算\s*(\d+)/);
      if (m) {
        setDestination(m[2]);
        setDays(Number(m[3]));
        setBudget(Number(m[4]));
      }
    }
  }, [inputText]);

  const togglePref = (p) => {
    setPrefs((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  const handlePlan = async () => {
    setLoading(true);
    try {
      const userPrompt = `目的地:${destination}\n天数:${days}\n预算:${budget}\n人数:${people}\n偏好:${prefs.join(',')}\n请输出详细的逐日行程、交通、住宿、景点、餐饮和门票费用估算（人民币），并给出现实可查的地标名称。`;
      const res = await generatePlan(userPrompt);
      setPlanOutput(res);
    } catch (e) {
      setPlanOutput(`生成失败：${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid cols-2">
      <div className="card">
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
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {PREFERENCES.map((p) => (
              <button
                key={p}
                className="btn secondary"
                onClick={() => togglePref(p)}
                style={{ opacity: prefs.includes(p) ? 1 : 0.6 }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="col" style={{ marginTop: 12 }}>
          <label>语音/文字输入</label>
          <VoiceInput onText={(t) => setInputText(t)} />
          <textarea
            className="input"
            placeholder="例如：我想去日本，5 天，预算 1 万元，喜欢美食和动漫，带孩子"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={3}
          />
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={handlePlan} disabled={loading || !cfg.llm.apiKey}>
            {loading ? '生成中…' : cfg.llm.apiKey ? '生成行程' : '请先到设置页配置 LLM Key'}
          </button>
        </div>
      </div>

      <div className="col" style={{ gap: 16 }}>
        <div className="card">
          <div className="section-title">地图</div>
          <MapView />
          {!cfg.map.key && <div className="muted" style={{ marginTop: 8 }}>未配置地图 Key，前往设置页填入高德/百度 Key</div>}
        </div>
        <div className="card">
          <div className="section-title">AI 规划结果</div>
          <div className="plan-output">{planOutput || '生成结果将显示在此'}</div>
        </div>
      </div>
    </div>
  );
}



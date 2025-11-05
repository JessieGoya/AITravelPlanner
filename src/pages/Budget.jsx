import { useEffect, useMemo, useState } from 'react';
import { getRuntimeConfig } from '../services/config';

const STORAGE_KEY = 'budget_entries_v1';

export default function Budget() {
  const cfg = useMemo(getRuntimeConfig, []);
  const [entries, setEntries] = useState([]);
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('交通');
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) setEntries(JSON.parse(raw));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  const addEntry = () => {
    if (!date || !category || !amount) return;
    const e = { id: crypto.randomUUID(), date, category, amount, note };
    setEntries((prev) => [e, ...prev]);
    setAmount(0);
    setNote('');
  };

  const removeEntry = (id) => setEntries((prev) => prev.filter((x) => x.id !== id));

  const total = entries.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="grid cols-2">
      <div className="card">
        <div className="section-title">新增支出</div>
        <div className="grid cols-3">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {['交通', '住宿', '门票', '餐饮', '购物', '其他'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} placeholder="金额" />
        </div>
        <div className="col" style={{ marginTop: 12 }}>
          <input className="input" placeholder="备注（可选）" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={addEntry}>添加</button>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>可在设置页配置云端同步（占位）。当前使用本地存储。</div>
      </div>

      <div className="card">
        <div className="section-title">支出记录</div>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <div>合计：<b>{total.toLocaleString()} 元</b></div>
          {cfg.budget.currency && <div className="muted">货币：{cfg.budget.currency}</div>}
        </div>
        <div className="col" style={{ gap: 8 }}>
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
  );
}



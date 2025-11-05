import { useEffect, useState } from 'react';
import { getRuntimeConfig, saveRuntimeConfig } from '../services/config';

export default function Settings() {
  const [llmBaseUrl, setLlmBaseUrl] = useState('');
  const [llmKey, setLlmKey] = useState('');
  const [llmModel, setLlmModel] = useState('gpt-4o-mini');
  const [mapKey, setMapKey] = useState('');
  const [mapProvider, setMapProvider] = useState('amap');
  const [currency, setCurrency] = useState('CNY');
  const [theme, setTheme] = useState('dark');
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    const cfg = getRuntimeConfig();
    setLlmBaseUrl(cfg.llm.baseUrl || '');
    setLlmKey(cfg.llm.apiKey || '');
    setLlmModel(cfg.llm.model || 'gpt-4o-mini');
    setMapKey(cfg.map.key || '');
    setMapProvider(cfg.map.provider || 'amap');
    setCurrency(cfg.budget.currency || 'CNY');
    setTheme(cfg.theme || 'dark');
  }, []);

  const save = () => {
    saveRuntimeConfig({
      llm: { baseUrl: llmBaseUrl, apiKey: llmKey, model: llmModel },
      map: { provider: mapProvider, key: mapKey },
      budget: { currency },
      theme
    });
    setSaveStatus('已保存！');
    setTimeout(() => setSaveStatus(''), 3000);
  };

  const exportConfig = () => {
    const config = {
      llm: { baseUrl: llmBaseUrl, apiKey: llmKey, model: llmModel },
      map: { provider: mapProvider, key: mapKey },
      budget: { currency },
      theme
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-travel-planner-config-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setSaveStatus('配置已导出！');
    setTimeout(() => setSaveStatus(''), 3000);
  };

  const importConfig = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const config = JSON.parse(event.target.result);
          if (config.llm) {
            setLlmBaseUrl(config.llm.baseUrl || '');
            setLlmKey(config.llm.apiKey || '');
            setLlmModel(config.llm.model || 'gpt-4o-mini');
          }
          if (config.map) {
            setMapProvider(config.map.provider || 'amap');
            setMapKey(config.map.key || '');
          }
          if (config.budget) {
            setCurrency(config.budget.currency || 'CNY');
          }
          if (config.theme) {
            setTheme(config.theme || 'dark');
          }
          save();
          setSaveStatus('配置已导入并保存！');
          setTimeout(() => setSaveStatus(''), 3000);
        } catch (error) {
          alert('导入失败：配置文件格式错误');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const resetConfig = () => {
    if (confirm('确定要重置所有设置吗？此操作不可撤销。')) {
      localStorage.removeItem('runtime_config_v1');
      window.location.reload();
    }
  };

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="grid cols-2">
        <div className="card">
          <div className="section-title">大语言模型配置</div>
          <div className="col" style={{ gap: 12 }}>
            <div className="col">
              <label style={{ fontSize: '14px', fontWeight: 500 }}>Base URL（兼容 OpenAI 格式）</label>
              <input
                className="input"
                value={llmBaseUrl}
                onChange={(e) => setLlmBaseUrl(e.target.value)}
                placeholder="如：https://api.openai.com/v1"
              />
            </div>
            <div className="col">
              <label style={{ fontSize: '14px', fontWeight: 500 }}>API Key</label>
              <input
                className="input"
                type="password"
                value={llmKey}
                onChange={(e) => setLlmKey(e.target.value)}
                placeholder="只保存在本地，不会上传"
              />
            </div>
            <div className="col">
              <label style={{ fontSize: '14px', fontWeight: 500 }}>模型名称</label>
              <input
                className="input"
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                placeholder="如：gpt-4o-mini, gpt-4"
              />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="section-title">地图与预算配置</div>
          <div className="col" style={{ gap: 12 }}>
            <div className="col">
              <label style={{ fontSize: '14px', fontWeight: 500 }}>地图服务商</label>
              <select className="input" value={mapProvider} onChange={(e) => setMapProvider(e.target.value)}>
                <option value="amap">高德地图</option>
                <option value="baidu">百度地图</option>
                <option value="google">Google Maps</option>
              </select>
            </div>
            <div className="col">
              <label style={{ fontSize: '14px', fontWeight: 500 }}>地图 API Key</label>
              <input
                className="input"
                type="password"
                value={mapKey}
                onChange={(e) => setMapKey(e.target.value)}
                placeholder="浏览器本地保存"
              />
            </div>
            <div className="col">
              <label style={{ fontSize: '14px', fontWeight: 500 }}>预算货币</label>
              <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="CNY">人民币 (CNY)</option>
                <option value="USD">美元 (USD)</option>
                <option value="EUR">欧元 (EUR)</option>
                <option value="GBP">英镑 (GBP)</option>
                <option value="JPY">日元 (JPY)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">界面设置</div>
        <div className="col" style={{ gap: 12 }}>
          <div className="col">
            <label style={{ fontSize: '14px', fontWeight: 500 }}>主题</label>
            <select className="input" value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="dark">深色模式</option>
              <option value="light">浅色模式</option>
              <option value="auto">跟随系统</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">配置管理</div>
        <div className="col" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <button className="btn" onClick={save}>
              {saveStatus ? saveStatus : '保存设置'}
            </button>
            <button className="btn secondary" onClick={exportConfig}>
              导出配置
            </button>
            <button className="btn secondary" onClick={importConfig}>
              导入配置
            </button>
            <button className="btn secondary" onClick={resetConfig} style={{ color: '#fca5a5' }}>
              重置设置
            </button>
          </div>
          <div className="muted" style={{ fontSize: '13px', marginTop: 8 }}>
            ⚠️ 所有 API Key 和敏感信息仅保存在浏览器本地（localStorage），不会上传到服务器或写入代码仓库。
          </div>
        </div>
      </div>
    </div>
  );
}



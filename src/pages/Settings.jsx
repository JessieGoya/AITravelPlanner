import { useEffect, useState } from 'react';
import { getRuntimeConfig, saveRuntimeConfig } from '../services/config';
import { saveFirebaseConfig } from '../services/supabase';

export default function Settings() {
  // const [llmBaseUrl, setLlmBaseUrl] = useState('');
  const [llmBaseUrl, setLlmBaseUrl] = useState('https://dashscope.aliyuncs.com/compatible-mode/v1');
  const [llmKey, setLlmKey] = useState('');
  // const [llmModel, setLlmModel] = useState('gpt-4o-mini');
  const [llmModel, setLlmModel] = useState('qwen-plus');
  const [mapKey, setMapKey] = useState('');
  const [mapProvider, setMapProvider] = useState('amap');
  const [currency, setCurrency] = useState('CNY');
  const [theme, setTheme] = useState('dark');
  const [saveStatus, setSaveStatus] = useState('');
  const [fbApiKey, setFbApiKey] = useState('');
  const [fbAuthDomain, setFbAuthDomain] = useState('');
  const [fbProjectId, setFbProjectId] = useState('');
  const [fbAppId, setFbAppId] = useState('');
  const [fbStorageBucket, setFbStorageBucket] = useState('');
  const [fbMsgSenderId, setFbMsgSenderId] = useState('');

  useEffect(() => {
    // 加载配置
    const cfg = getRuntimeConfig();
    // setLlmBaseUrl(cfg.llm.baseUrl || '');
    setLlmBaseUrl(cfg.llm.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1');
    setLlmKey(cfg.llm.apiKey || '');
    // setLlmModel(cfg.llm.model || 'gpt-4o-mini');
    setLlmModel(cfg.llm.model || 'qwen-plus');
    setMapKey(cfg.map.key || '');
    setMapProvider(cfg.map.provider || 'amap');
    setCurrency(cfg.budget.currency || 'CNY');
    setTheme(cfg.theme || 'dark');
    
    // 加载 Firebase 配置
    const fbConfigStr = localStorage.getItem('firebase_config');
    if (fbConfigStr) {
      try {
        const fbConfig = JSON.parse(fbConfigStr);
        setFbApiKey(fbConfig.apiKey || '');
        setFbAuthDomain(fbConfig.authDomain || '');
        setFbProjectId(fbConfig.projectId || '');
        setFbAppId(fbConfig.appId || '');
        setFbStorageBucket(fbConfig.storageBucket || '');
        setFbMsgSenderId(fbConfig.messagingSenderId || '');
      } catch (e) {
        console.error('Failed to parse Firebase config', e);
      }
    }
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
            // setLlmBaseUrl(config.llm.baseUrl || '');
            setLlmBaseUrl(config.llm.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1');
            setLlmKey(config.llm.apiKey || '');
            // setLlmModel(config.llm.model || 'gpt-4o-mini');
            setLlmModel(config.llm.model || 'qwen-plus');
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
                <option value="amap">高德地图（中国境内推荐）</option>
                <option value="baidu">百度地图（中国境内推荐）</option>
                <option value="osm">OpenStreetMap（全球覆盖，海外推荐）</option>
              </select>
              <div className="muted" style={{ fontSize: '12px', marginTop: 4 }}>
                {mapProvider === 'osm' ? 'OpenStreetMap 无需 API Key，全球覆盖清晰' : '中国地图服务在海外地区可能显示模糊'}
              </div>
            </div>
            <div className="col">
              <label style={{ fontSize: '14px', fontWeight: 500 }}>地图 API Key</label>
              <input
                className="input"
                type="password"
                value={mapKey}
                onChange={(e) => setMapKey(e.target.value)}
                placeholder={mapProvider === 'osm' ? 'OpenStreetMap 无需 API Key' : '浏览器本地保存'}
                disabled={mapProvider === 'osm'}
              />
              {mapProvider === 'osm' && (
                <div className="muted" style={{ fontSize: '12px', marginTop: 4 }}>
                  OpenStreetMap 是免费开源地图服务，无需 API Key
                </div>
              )}
              {mapProvider === 'amap' && (
                <div className="muted" style={{ fontSize: '12px', marginTop: 4, color: '#fbbf24' }}>
                  ⚠️ 重要：请申请"Web端（JS API）"类型的 Key，不是"Web服务"Key。申请地址：<a href="https://console.amap.com/dev/key/app" target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline' }}>高德开放平台</a>
                </div>
              )}
              {mapProvider === 'baidu' && (
                <div className="muted" style={{ fontSize: '12px', marginTop: 4 }}>
                  申请地址：<a href="https://lbsyun.baidu.com/apiconsole/key" target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline' }}>百度地图开放平台</a>，选择"浏览器端"类型
                </div>
              )}
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
        <div className="section-title">云端数据存储（Firebase）</div>
        <div className="col" style={{ gap: 12 }}>
          <div className="muted" style={{ fontSize: '13px', marginBottom: 8 }}>
            配置 Firebase 以启用云端数据同步。留空则使用本地存储模式。
          </div>

          <div className="grid cols-2" style={{ gap: 12 }}>
            <div className="col">
              <label style={{ fontSize: '14px', fontWeight: 500 }}>apiKey</label>
              <input
                className="input"
                value={fbApiKey}
                onChange={(e) => setFbApiKey(e.target.value)}
                placeholder="Firebase apiKey"
              />
            </div>
            <div className="col">
              <label style={{ fontSize: '14px', fontWeight: 500 }}>authDomain</label>
              <input
                className="input"
                value={fbAuthDomain}
                onChange={(e) => setFbAuthDomain(e.target.value)}
                placeholder="example.firebaseapp.com"
              />
            </div>
            <div className="col">
              <label style={{ fontSize: '14px', fontWeight: 500 }}>projectId</label>
              <input
                className="input"
                value={fbProjectId}
                onChange={(e) => setFbProjectId(e.target.value)}
                placeholder="your-project-id"
              />
            </div>
            <div className="col">
              <label style={{ fontSize: '14px', fontWeight: 500 }}>appId</label>
              <input
                className="input"
                value={fbAppId}
                onChange={(e) => setFbAppId(e.target.value)}
                placeholder="可选，但推荐填写"
              />
            </div>
            <div className="col">
              <label style={{ fontSize: '14px', fontWeight: 500 }}>storageBucket</label>
              <input
                className="input"
                value={fbStorageBucket}
                onChange={(e) => setFbStorageBucket(e.target.value)}
                placeholder="可选"
              />
            </div>
            <div className="col">
              <label style={{ fontSize: '14px', fontWeight: 500 }}>messagingSenderId</label>
              <input
                className="input"
                value={fbMsgSenderId}
                onChange={(e) => setFbMsgSenderId(e.target.value)}
                placeholder="可选"
              />
            </div>
          </div>

          <button 
            className="btn secondary" 
            onClick={() => {
              const requiredOk = fbApiKey && fbAuthDomain && fbProjectId;
              if (requiredOk) {
                saveFirebaseConfig({
                  apiKey: fbApiKey,
                  authDomain: fbAuthDomain,
                  projectId: fbProjectId,
                  appId: fbAppId || undefined,
                  storageBucket: fbStorageBucket || undefined,
                  messagingSenderId: fbMsgSenderId || undefined
                });
                setSaveStatus('Firebase 配置已保存！');
              } else {
                saveFirebaseConfig(null);
                setSaveStatus('已清除 Firebase 配置，将使用本地存储模式');
              }
              setTimeout(() => setSaveStatus(''), 3000);
            }}
          >
            保存 Firebase 配置
          </button>
          <div className="muted" style={{ fontSize: '12px', marginTop: 8 }}>
            提示：保存后直接生效。数据将保存在 Firestore 集合 <code>travel_plans</code> 下。
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



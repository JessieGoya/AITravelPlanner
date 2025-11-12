import { useEffect, useState } from 'react';
import { getRuntimeConfig, saveRuntimeConfig } from '../services/config';
import { saveSupabaseConfig } from '../services/supabase';

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
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('');
  const [supabaseServiceRoleKey, setSupabaseServiceRoleKey] = useState('');

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
    
    // 加载 Supabase 配置
    const supaConfigStr = localStorage.getItem('supabase_config');
    if (supaConfigStr) {
      try {
        const supaConfig = JSON.parse(supaConfigStr);
        setSupabaseUrl(supaConfig.url || '');
        setSupabaseAnonKey(supaConfig.anonKey || '');
        setSupabaseServiceRoleKey(supaConfig.serviceRoleKey || '');
      } catch (e) {
        console.error('Failed to parse Supabase config', e);
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
      theme,
      supabase: {
        url: supabaseUrl || '',
        anonKey: supabaseAnonKey || '',
        serviceRoleKey: supabaseServiceRoleKey || ''
      }
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
          if (config.supabase) {
            const { url = '', anonKey = '', serviceRoleKey = '' } = config.supabase;
            setSupabaseUrl(url);
            setSupabaseAnonKey(anonKey);
            setSupabaseServiceRoleKey(serviceRoleKey);
            if (url && anonKey) {
              saveSupabaseConfig({ url, anonKey, serviceRoleKey });
            } else {
              saveSupabaseConfig(null);
            }
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

  const saveSupabase = () => {
    if (!supabaseUrl.trim() || !supabaseAnonKey.trim()) {
      alert('请填写完整的 Supabase URL 和匿名密钥');
      return;
    }
    saveSupabaseConfig({
      url: supabaseUrl.trim(),
      anonKey: supabaseAnonKey.trim(),
      serviceRoleKey: supabaseServiceRoleKey.trim() || undefined
    });
    setSaveStatus('Supabase 配置已保存！');
    setTimeout(() => setSaveStatus(''), 3000);
  };

  const clearSupabase = () => {
    saveSupabaseConfig(null);
    setSupabaseUrl('');
    setSupabaseAnonKey('');
    setSupabaseServiceRoleKey('');
    setSaveStatus('Supabase 配置已清除！');
    setTimeout(() => setSaveStatus(''), 3000);
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
                placeholder="如：qwen-plus, qwen-max"
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
                {/* <option value="amap">高德地图（中国境内推荐）</option> */}
                {/* <option value="baidu">百度地图（中国境内推荐）</option> */}
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

      {/* <div className="card">
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
      </div> */}

      <div className="card">
        <div className="section-title">云端数据存储（Supabase）</div>
        <div className="col" style={{ gap: 12 }}>
          <div className="muted" style={{ fontSize: '13px', marginBottom: 8 }}>
            配置 Supabase 以启用云端数据同步。留空则使用本地存储模式。
          </div>

          <div className="grid cols-2" style={{ gap: 12 }}>
            <div className="col">
              <label style={{ fontSize: '14px', fontWeight: 500 }}>Supabase URL</label>
              <input
                className="input"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                placeholder="https://xxxx.supabase.co"
              />
            </div>
            <div className="col">
              <label style={{ fontSize: '14px', fontWeight: 500 }}>Supabase 匿名密钥</label>
              <input
                className="input"
                value={supabaseAnonKey}
                onChange={(e) => setSupabaseAnonKey(e.target.value)}
                placeholder="anon key"
              />
            </div>
          </div>
          <div className="col">
            <label style={{ fontSize: '14px', fontWeight: 500 }}>Service Role Key（可选，用于自动建表）</label>
            <input
              className="input"
              type="password"
              value={supabaseServiceRoleKey}
              onChange={(e) => setSupabaseServiceRoleKey(e.target.value)}
              placeholder="service role key"
            />
            <div className="muted" style={{ fontSize: '12px', marginTop: 4 }}>
              仅在受信任环境使用 Service Role Key，可启用自动建表功能，建议仅在本地或受控服务器部署时填写。
            </div>
          </div>

          <div className="row" style={{ gap: 12 }}>
            <button className="btn primary" onClick={saveSupabase}>
              保存 Supabase 配置
            </button>
            <button className="btn secondary" onClick={clearSupabase}>
              清除配置
            </button>
          </div>
          <div className="muted" style={{ fontSize: '12px', marginTop: 8 }}>
            提示：保存后直接生效。数据将保存在 Supabase 数据表 <code>travel_plans</code> 等表中。
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



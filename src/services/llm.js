import { getRuntimeConfig } from './config';

// 获取后端 API 地址
function getBackendUrl() {
  // 优先使用环境变量
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }
  // 开发环境默认使用 localhost:8080
  if (import.meta.env.DEV) {
    return 'http://localhost:8080';
  }
  // 生产环境：如果前后端在同一域名下，使用相对路径；否则需要配置 VITE_BACKEND_URL
  // 默认假设后端在相同域名的 8080 端口
  const host = window.location.hostname;
  return `${window.location.protocol}//${host}:8080`;
}

export async function generatePlan(prompt) {
  const cfg = getRuntimeConfig();
  if (!cfg.llm.baseUrl || !cfg.llm.apiKey) {
    throw new Error('未配置 LLM BaseURL 或 API Key');
  }

  // 通过后端代理调用 LLM API
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/api/llm/chat`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      baseUrl: cfg.llm.baseUrl,
      apiKey: cfg.llm.apiKey,
      model: cfg.llm.model || 'gpt-4o-mini',
      prompt: prompt
    })
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM 调用失败：${res.status} ${text}`);
  }
  
  const data = await res.json();
  if (data.error) {
    throw new Error(data.error);
  }
  
  return data.content || '（无返回内容）';
}



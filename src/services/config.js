const KEY = 'runtime_config_v1';

const defaultConfig = {
  llm: { baseUrl: '', apiKey: '', model: 'qwen-plus' },
  map: { provider: 'amap', key: '' },
  budget: { currency: 'CNY' },
  theme: 'dark'
};

export function getRuntimeConfig() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultConfig;
    const parsed = JSON.parse(raw);
    return {
      ...defaultConfig,
      ...parsed,
      llm: { ...defaultConfig.llm, ...(parsed.llm || {}) },
      map: { ...defaultConfig.map, ...(parsed.map || {}) },
      budget: { ...defaultConfig.budget, ...(parsed.budget || {}) }
    };
  } catch {
    return defaultConfig;
  }
}

export function saveRuntimeConfig(partial) {
  const curr = getRuntimeConfig();
  const merged = {
    llm: { ...curr.llm, ...(partial.llm || {}) },
    map: { ...curr.map, ...(partial.map || {}) },
    budget: { ...curr.budget, ...(partial.budget || {}) },
    theme: partial.theme !== undefined ? partial.theme : curr.theme
  };
  localStorage.setItem(KEY, JSON.stringify(merged));
}



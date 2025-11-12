import { saveRuntimeConfig } from './config';
import { saveSupabaseConfig } from './supabase';

const EXTERNAL_CONFIG_CACHE_KEY = '__ai_travel_planner_external_config__';
const RUNTIME_CONFIG_STORAGE_KEY = 'runtime_config_v1';
const SUPABASE_CONFIG_STORAGE_KEY = 'supabase_config';

function resolveConfigUrl(options = {}) {
  if (options.url) return options.url;
  if (typeof window !== 'undefined') {
    if (window.__AI_TRAVEL_PLANNER_CONFIG_URL__) {
      return window.__AI_TRAVEL_PLANNER_CONFIG_URL__;
    }
  }
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_CONFIG_URL) {
    return import.meta.env.VITE_APP_CONFIG_URL;
  }
  return '/ai-travel-planner-config.json';
}

function shouldWriteRuntimeConfig(externalConfig, options = {}) {
  if (!externalConfig?.llm && !externalConfig?.map && !externalConfig?.budget && !externalConfig?.theme) {
    return false;
  }
  if (options.forceOverride) {
    return true;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  return !window.localStorage.getItem(RUNTIME_CONFIG_STORAGE_KEY);
}

function shouldWriteSupabaseConfig(externalConfig, options = {}) {
  if (!externalConfig?.supabase?.url || !externalConfig.supabase?.anonKey) {
    return false;
  }
  if (options.forceOverrideSupabase) {
    return true;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  return !window.localStorage.getItem(SUPABASE_CONFIG_STORAGE_KEY);
}

let loadPromise = null;

export function initializeConfigFromFile(options = {}) {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }
  if (!options.forceReload && window[EXTERNAL_CONFIG_CACHE_KEY]) {
    return Promise.resolve(window[EXTERNAL_CONFIG_CACHE_KEY]);
  }
  if (loadPromise && !options.forceReload) {
    return loadPromise;
  }

  const configUrl = resolveConfigUrl(options);

  loadPromise = fetch(configUrl, {
    cache: options.cache || 'no-store'
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`无法加载外部配置文件：${response.status} ${response.statusText}`);
      }
      const config = await response.json();
      window[EXTERNAL_CONFIG_CACHE_KEY] = config;

      if (shouldWriteRuntimeConfig(config, options)) {
        const runtimePartial = {
          llm: config.llm || undefined,
          map: config.map || undefined,
          budget: config.budget || undefined,
          theme: config.theme
        };
        saveRuntimeConfig(runtimePartial);
      }

      if (shouldWriteSupabaseConfig(config, options)) {
        saveSupabaseConfig(config.supabase);
      } else if (options.forceOverrideSupabase && !config.supabase) {
        saveSupabaseConfig(null);
      }

      return config;
    })
    .catch((error) => {
      if (!options.silent) {
        console.warn('[ConfigLoader] 加载外部配置失败：', error);
      }
      window[EXTERNAL_CONFIG_CACHE_KEY] = null;
      return null;
    })
    .finally(() => {
      loadPromise = null;
    });

  return loadPromise;
}

export function getCachedExternalConfig() {
  if (typeof window === 'undefined') {
    return null;
  }
  return window[EXTERNAL_CONFIG_CACHE_KEY] || null;
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'initializeConfigFromFile', {
    configurable: true,
    enumerable: false,
    writable: false,
    value: initializeConfigFromFile
  });
}




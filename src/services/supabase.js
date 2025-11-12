import { createClient } from '@supabase/supabase-js';

// Supabase 云端数据适配层
// - 如果提供 Supabase 配置，使用真实 Supabase
// - 否则回退到本地存储模拟

const SUPABASE_CONFIG_KEY = 'supabase_config';
const SUPABASE_SESSION_KEY = 'supabase_session';
const SUPABASE_AUTH_STORAGE_KEY = 'ai-travel-planner-supabase-auth';

function getSupabaseConfig() {
  const configStr = localStorage.getItem(SUPABASE_CONFIG_KEY);
  if (!configStr) {
    return null;
  }
  try {
    const parsed = JSON.parse(configStr);
    if (parsed && typeof parsed.url === 'string' && typeof parsed.anonKey === 'string') {
      const sanitized = {
        url: parsed.url.trim(),
        anonKey: parsed.anonKey.trim()
      };
      let sanitizedServiceRoleKey =
        typeof parsed.serviceRoleKey === 'string' ? parsed.serviceRoleKey.trim() : undefined;

      if (sanitizedServiceRoleKey === '') {
        sanitizedServiceRoleKey = undefined;
      } else if (sanitizedServiceRoleKey && /[^\u0000-\u00ff]/.test(sanitizedServiceRoleKey)) {
        console.warn('检测到 Supabase Service Role Key 包含非 ASCII 字符，自动忽略。');
        sanitizedServiceRoleKey = undefined;
      }

      if (sanitizedServiceRoleKey) {
        sanitized.serviceRoleKey = sanitizedServiceRoleKey;
      }

      if (sanitized.url && sanitized.anonKey) {
        if (
          sanitized.url !== parsed.url ||
          sanitized.anonKey !== parsed.anonKey ||
          sanitizedServiceRoleKey !== parsed.serviceRoleKey
        ) {
          // 覆写存储以保持数据一致
          saveSupabaseConfig(sanitized);
        }
        return sanitized;
      }
    }
  } catch (error) {
    console.error('Failed to parse Supabase config', error);
  }
  return null;
}

function loadStoredSession() {
  const raw = localStorage.getItem(SUPABASE_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn('Failed to parse stored Supabase session:', error);
    return null;
  }
}

function storeSession(session) {
  if (session) {
    localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SUPABASE_SESSION_KEY);
  }
}

function normalizeSession(session, fallbackUser) {
  if (!session && !fallbackUser) {
    return null;
  }

  const user = session?.user || fallbackUser;
  if (!user) {
    return null;
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone || null,
      user_metadata: user.user_metadata || {}
    },
    access_token: session?.access_token || null,
    refresh_token: session?.refresh_token || null,
    expires_at: session?.expires_at || null,
    token_type: session?.token_type || 'bearer'
  };
}

// 模拟 Supabase 客户端（当未配置 Supabase 时使用本地存储）
class LocalSupabaseClient {
  constructor() {
    this.users = JSON.parse(localStorage.getItem('supabase_users') || '[]');
    this.plans = JSON.parse(localStorage.getItem('supabase_plans') || '[]');
    this.profiles = JSON.parse(localStorage.getItem('supabase_profiles') || '[]');
    this.preferences = JSON.parse(localStorage.getItem('supabase_preferences') || '[]');
    this.budgetRecords = JSON.parse(localStorage.getItem('supabase_budget_records') || '[]');
    this.auth = {
      session: loadStoredSession(),
      signUp: async (email, password) => {
        const existing = this.users.find(u => u.email === email);
        if (existing) {
          throw new Error('该邮箱已被注册');
        }
        const user = {
          id: crypto.randomUUID(),
          email,
          created_at: new Date().toISOString()
        };
        this.users.push(user);
        localStorage.setItem('supabase_users', JSON.stringify(this.users));
        this.auth.session = { user, access_token: 'local_token_' + user.id };
        storeSession(this.auth.session);
        return { user, session: this.auth.session };
      },
      signInWithPassword: async (email, password) => {
        const user = this.users.find(u => u.email === email);
        if (!user) {
          throw new Error('邮箱或密码错误');
        }
        this.auth.session = { user, access_token: 'local_token_' + user.id };
        storeSession(this.auth.session);
        return { user, session: this.auth.session };
      },
      signOut: async () => {
        this.auth.session = null;
        storeSession(null);
      },
      getSession: () => {
        if (this.auth.session) {
          return this.auth.session;
        }
        const restored = loadStoredSession();
        this.auth.session = restored;
        return restored;
      },
      onAuthStateChange: (callback) => {
        const interval = setInterval(() => {
          const session = this.auth.getSession();
          callback(session ? 'SIGNED_IN' : 'SIGNED_OUT', session);
        }, 1000);
        return { data: { subscription: null }, unsubscribe: () => clearInterval(interval) };
      }
    };

    // 初始化时同步一次 session
    this.auth.getSession();
  }

  ensureSchema() {
    return Promise.resolve(false);
  }

  from(table) {
    const getTableData = () => {
      switch (table) {
        case 'travel_plans':
          return { data: this.plans, key: 'supabase_plans' };
        case 'user_profiles':
          return { data: this.profiles, key: 'supabase_profiles' };
        case 'user_preferences':
          return { data: this.preferences, key: 'supabase_preferences' };
        case 'budget_records':
          return { data: this.budgetRecords, key: 'supabase_budget_records' };
        default:
          return null;
      }
    };

    const tableInfo = getTableData();
    if (!tableInfo) {
      return {
        select: () => ({ data: [], error: { message: 'Unsupported table' } }),
        insert: () => ({ data: null, error: { message: 'Unsupported table' } }),
        update: () => ({ eq: () => ({ data: null, error: { message: 'Unsupported table' } }) }),
        delete: () => ({ eq: () => ({ data: null, error: { message: 'Unsupported table' } }) })
      };
    }

    const { data: tableData, key: storageKey } = tableInfo;

    return {
      select: (columns = '*') => {
        const buildOrderResult = (rows, orderByColumn, options = { ascending: true }) => {
          const sorted = rows.slice().sort((a, b) => {
            const aVal = a[orderByColumn];
            const bVal = b[orderByColumn];
            if (options.ascending) {
              return aVal > bVal ? 1 : -1;
            } else {
              return aVal < bVal ? 1 : -1;
            }
          });
          return { data: sorted, error: null };
        };

        const eqImpl = (column, value) => {
          const filtered = tableData.filter(row => row[column] === value);
          return {
            order: (orderByColumn, options = { ascending: true }) => buildOrderResult(filtered, orderByColumn, options),
            get data() { return filtered; },
            get error() { return null; }
          };
        };

        return {
          eq: eqImpl,
          order: (orderByColumn, options = { ascending: true }) => buildOrderResult(tableData, orderByColumn, options),
          get data() { return tableData; },
          get error() { return null; }
        };
      },
      insert: (data) => {
        const record = {
          ...data,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        tableData.push(record);
        localStorage.setItem(storageKey, JSON.stringify(tableData));
        return { data: [record], error: null };
      },
      update: (data) => ({
        eq: (column, value) => {
          const index = tableData.findIndex(row => row[column] === value);
          if (index !== -1) {
            tableData[index] = {
              ...tableData[index],
              ...data,
              updated_at: new Date().toISOString()
            };
            localStorage.setItem(storageKey, JSON.stringify(tableData));
            return { data: [tableData[index]], error: null };
          }
          return { data: null, error: { message: 'Not found' } };
        }
      }),
      delete: () => ({
        eq: (column, value) => {
          const index = tableData.findIndex(row => row[column] === value);
          if (index !== -1) {
            const deleted = tableData.splice(index, 1)[0];
            localStorage.setItem(storageKey, JSON.stringify(tableData));
            return { data: [deleted], error: null };
          }
          return { data: null, error: { message: 'Not found' } };
        }
      })
    };
  }
}

class RemoteSupabaseClient {
  constructor(config) {
    this._config = config;
    this._client = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: SUPABASE_AUTH_STORAGE_KEY
      }
    });
    this._session = normalizeSession(loadStoredSession(), null);
    this._schemaPromise = null;
    this._schemaWarningShown = false;

    this.auth = {
      signUp: async (email, password) => {
        const { data, error } = await this._client.auth.signUp({ email, password });
        if (error) {
          throw error;
        }
        this._updateSession(data.session, data.user);
        return { user: data.user, session: this._session };
      },
      signInWithPassword: async (email, password) => {
        const { data, error } = await this._client.auth.signInWithPassword({ email, password });
        if (error) {
          throw error;
        }
        this._updateSession(data.session, data.user);
        return { user: data.user, session: this._session };
      },
      signOut: async () => {
        const { error } = await this._client.auth.signOut();
        if (error) {
          throw error;
        }
        this._updateSession(null);
      },
      getSession: () => {
        if (this._session) {
          return this._session;
        }
        const restored = normalizeSession(loadStoredSession(), null);
        this._session = restored;
        return restored;
      },
      onAuthStateChange: (callback) => {
        const { data } = this._client.auth.onAuthStateChange((event, session) => {
          this._updateSession(session);
          callback(event, this._session);
        });
        const subscription = data?.subscription;
        return {
          data,
          unsubscribe: () => {
            if (subscription?.unsubscribe) {
              subscription.unsubscribe();
            } else if (subscription?.subscription?.unsubscribe) {
              subscription.subscription.unsubscribe();
            }
          }
        };
      }
    };

    // 异步刷新一次 session，确保本地缓存与 Supabase 同步
    this._client.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.warn('Supabase getSession failed:', error);
        return;
      }
      this._updateSession(data?.session || null);
    });

    // 需要手动建表，给出提示
    this.ensureSchema().catch((error) => {
      console.warn('Supabase 数据表检查失败，请手动确认表结构。', error);
    });
  }

  _updateSession(session, fallbackUser) {
    this._session = normalizeSession(session, fallbackUser);
    storeSession(this._session);
  }

  ensureSchema(force = false) {
    if (!this._schemaWarningShown || force) {
      console.warn(
        'Supabase 自动建表已关闭，请在 Supabase 控制台手动创建所需数据表和策略。'
      );
      this._schemaWarningShown = true;
    }
    return Promise.resolve(false);
  }

  from(...args) {
    return this._client.from(...args);
  }

  rpc(...args) {
    return this._client.rpc(...args);
  }

  channel(...args) {
    return this._client.channel(...args);
  }

  get storage() {
    return this._client.storage;
  }

  get functions() {
    return this._client.functions;
  }
}

// 获取 Supabase 客户端实例
let supabaseInstance = null;

export async function ensureSupabaseTables(client) {
  const targetClient = client || supabaseInstance || getSupabase();
  if (targetClient && typeof targetClient.ensureSchema === 'function') {
    return targetClient.ensureSchema();
  }
  return false;
}

export function getSupabase() {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const config = getSupabaseConfig();
  if (config) {
    try {
      supabaseInstance = new RemoteSupabaseClient(config);
      return supabaseInstance;
    } catch (error) {
      console.error('初始化 Supabase 客户端失败，回退到本地模式:', error);
    }
  }

  supabaseInstance = new LocalSupabaseClient();
  return supabaseInstance;
}

export function saveSupabaseConfig(config) {
  if (config && typeof config.url === 'string' && typeof config.anonKey === 'string') {
    const sanitizedUrl = config.url.trim();
    const sanitizedAnonKey = config.anonKey.trim();
    let sanitizedServiceRoleKey =
      typeof config.serviceRoleKey === 'string' ? config.serviceRoleKey.trim() : undefined;

    if (sanitizedServiceRoleKey === '') {
      sanitizedServiceRoleKey = undefined;
    } else if (sanitizedServiceRoleKey && /[^\u0000-\u00ff]/.test(sanitizedServiceRoleKey)) {
      console.warn('Supabase Service Role Key 包含非 ASCII 字符，已忽略该值。');
      sanitizedServiceRoleKey = undefined;
    }

    if (sanitizedUrl && sanitizedAnonKey) {
      localStorage.setItem(
        SUPABASE_CONFIG_KEY,
        JSON.stringify({
          url: sanitizedUrl,
          anonKey: sanitizedAnonKey,
          serviceRoleKey: sanitizedServiceRoleKey
        })
      );
    } else {
      localStorage.removeItem(SUPABASE_CONFIG_KEY);
    }
  } else {
    localStorage.removeItem(SUPABASE_CONFIG_KEY);
  }
  supabaseInstance = null;
}

export function hasSupabaseConfig() {
  return !!getSupabaseConfig();
}

export function shouldUseCloudStorage() {
  if (!hasSupabaseConfig()) {
    return false;
  }
  const session = loadStoredSession();
  return !!(session && session.user && session.user.id);
}

// 仅用于开发调试：在浏览器控制台访问 Supabase 兼容客户端
if (typeof window !== 'undefined') {
  try {
    Object.defineProperty(window, '__getSupabase', {
      configurable: true,
      enumerable: false,
      writable: false,
      value: () => getSupabase()
    });
  } catch {
    // 忽略定义失败
  }
}



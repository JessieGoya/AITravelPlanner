// Supabase 客户端配置
// 注意：Supabase URL 和 Anon Key 应该通过环境变量或配置页面设置，而不是硬编码

function getSupabaseConfig() {
  // 优先从 localStorage 读取配置
  const configStr = localStorage.getItem('supabase_config');
  if (configStr) {
    try {
      return JSON.parse(configStr);
    } catch (e) {
      console.error('Failed to parse Supabase config', e);
    }
  }
  
  // 如果没有配置，返回 null（将使用本地存储模式）
  return null;
}

// 模拟 Supabase 客户端（当未配置 Supabase 时使用本地存储）
class LocalSupabaseClient {
  constructor() {
    this.users = JSON.parse(localStorage.getItem('supabase_users') || '[]');
    this.plans = JSON.parse(localStorage.getItem('supabase_plans') || '[]');
    this.auth = {
      session: null,
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
        localStorage.setItem('supabase_session', JSON.stringify(this.auth.session));
        return { user, session: this.auth.session };
      },
      signInWithPassword: async (email, password) => {
        const user = this.users.find(u => u.email === email);
        if (!user) {
          throw new Error('邮箱或密码错误');
        }
        this.auth.session = { user, access_token: 'local_token_' + user.id };
        localStorage.setItem('supabase_session', JSON.stringify(this.auth.session));
        return { user, session: this.auth.session };
      },
      signOut: async () => {
        this.auth.session = null;
        localStorage.removeItem('supabase_session');
      },
      getSession: () => {
        const sessionStr = localStorage.getItem('supabase_session');
        if (sessionStr) {
          try {
            this.auth.session = JSON.parse(sessionStr);
            return this.auth.session;
          } catch (e) {
            return null;
          }
        }
        return null;
      },
      onAuthStateChange: (callback) => {
        // 简单的轮询检查
        const interval = setInterval(() => {
          const session = this.auth.getSession();
          callback('SIGNED_IN', session);
        }, 1000);
        return { data: { subscription: null }, unsubscribe: () => clearInterval(interval) };
      }
    };
    
    // 初始化时检查是否有已保存的 session
    this.auth.getSession();
  }

  from(table) {
    return {
      select: (columns = '*') => ({
        eq: (column, value) => ({
          data: this.plans.filter(p => p[column] === value),
          error: null
        }),
        order: (column, options = { ascending: true }) => ({
          data: this.plans.slice().sort((a, b) => {
            const aVal = a[column];
            const bVal = b[column];
            if (options.ascending) {
              return aVal > bVal ? 1 : -1;
            } else {
              return aVal < bVal ? 1 : -1;
            }
          }),
          error: null
        }),
        data: this.plans,
        error: null
      }),
      insert: (data) => {
        const plan = {
          ...data,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        this.plans.push(plan);
        localStorage.setItem('supabase_plans', JSON.stringify(this.plans));
        return { data: [plan], error: null };
      },
      update: (data) => ({
        eq: (column, value) => {
          const index = this.plans.findIndex(p => p[column] === value);
          if (index !== -1) {
            this.plans[index] = {
              ...this.plans[index],
              ...data,
              updated_at: new Date().toISOString()
            };
            localStorage.setItem('supabase_plans', JSON.stringify(this.plans));
            return { data: [this.plans[index]], error: null };
          }
          return { data: null, error: { message: 'Not found' } };
        }
      }),
      delete: () => ({
        eq: (column, value) => {
          const index = this.plans.findIndex(p => p[column] === value);
          if (index !== -1) {
            const deleted = this.plans.splice(index, 1)[0];
            localStorage.setItem('supabase_plans', JSON.stringify(this.plans));
            return { data: [deleted], error: null };
          }
          return { data: null, error: { message: 'Not found' } };
        }
      })
    };
  }
}

// 获取 Supabase 客户端实例
let supabaseInstance = null;

export function getSupabase() {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const config = getSupabaseConfig();
  
  if (config && config.url && config.anonKey) {
    // 如果配置了 Supabase，使用真实的客户端
    // 注意：需要安装 @supabase/supabase-js 包
    // import { createClient } from '@supabase/supabase-js';
    // supabaseInstance = createClient(config.url, config.anonKey);
    
    // 目前使用本地存储模拟
    console.warn('Supabase 配置已提供，但未安装 @supabase/supabase-js。使用本地存储模式。');
    supabaseInstance = new LocalSupabaseClient();
  } else {
    // 使用本地存储模拟
    supabaseInstance = new LocalSupabaseClient();
  }

  return supabaseInstance;
}

export function saveSupabaseConfig(config) {
  localStorage.setItem('supabase_config', JSON.stringify(config));
  // 重置实例以重新初始化
  supabaseInstance = null;
}


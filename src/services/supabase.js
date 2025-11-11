// 云端数据存储适配层
// - 优先使用 Firebase（如果提供了 Firebase 配置）
// - 否则使用本地存储模拟（兼容现有 Supabase API 形状）

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

function getFirebaseConfig() {
  const cfg = localStorage.getItem('firebase_config');
  if (!cfg) return null;
  try {
    const parsed = JSON.parse(cfg);
    // 需要至少 apiKey、authDomain、projectId
    if (parsed && parsed.apiKey && parsed.authDomain && parsed.projectId) {
      return parsed;
    }
  } catch (e) {
    console.error('Failed to parse Firebase config', e);
  }
  return null;
}

async function ensureFirebaseSDKLoaded() {
  if (window.firebaseApp && window.firebaseAuth && window.firebaseFirestore) {
    return;
  }
  // 通过动态导入加载 Firebase ESM（兼容现代打包器/浏览器）
  const [
    appMod,
    authMod,
    firestoreMod
  ] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js')
  ]);
  window.firebaseApp = appMod;
  window.firebaseAuth = authMod;
  window.firebaseFirestore = firestoreMod;
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
      select: (columns = '*') => {
        const self = this;
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
          const filtered = self.plans.filter(p => p[column] === value);
          return {
            order: (orderByColumn, options = { ascending: true }) => buildOrderResult(filtered, orderByColumn, options),
            get data() { return filtered; },
            get error() { return null; }
          };
        };

        return {
          eq: eqImpl,
          order: (orderByColumn, options = { ascending: true }) => buildOrderResult(self.plans, orderByColumn, options),
          get data() { return self.plans; },
          get error() { return null; }
        };
      },
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

// 使用 Firebase 的 Supabase 兼容客户端
class FirebaseSupabaseCompatClient {
  constructor(firebaseConfig) {
    this._initialized = false;
    this._initPromise = this._initialize(firebaseConfig);
    this.auth = {
      signUp: async (email, password) => {
        await this._initPromise;
        const { createUserWithEmailAndPassword } = window.firebaseAuth;
        const cred = await createUserWithEmailAndPassword(this._auth, email, password);
        const user = { id: cred.user.uid, email: cred.user.email };
        const session = { user, access_token: 'firebase_token_' + user.id };
        localStorage.setItem('supabase_session', JSON.stringify(session));
        return { user, session };
      },
      signInWithPassword: async (email, password) => {
        await this._initPromise;
        const { signInWithEmailAndPassword } = window.firebaseAuth;
        const cred = await signInWithEmailAndPassword(this._auth, email, password);
        const user = { id: cred.user.uid, email: cred.user.email };
        const session = { user, access_token: 'firebase_token_' + user.id };
        localStorage.setItem('supabase_session', JSON.stringify(session));
        return { user, session };
      },
      signOut: async () => {
        await this._initPromise;
        const { signOut } = window.firebaseAuth;
        await signOut(this._auth);
        localStorage.removeItem('supabase_session');
      },
      getSession: () => {
        const raw = localStorage.getItem('supabase_session');
        if (!raw) return null;
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      },
      onAuthStateChange: (callback) => {
        // 简化的监听：读取存储的 session（可按需扩展实时监听）
        const interval = setInterval(() => {
          const session = this.auth.getSession();
          callback('SIGNED_IN', session);
        }, 1000);
        return { data: { subscription: null }, unsubscribe: () => clearInterval(interval) };
      }
    };
  }

  async _initialize(firebaseConfig) {
    if (this._initialized) return;
    await ensureFirebaseSDKLoaded();
    const { initializeApp, getApps } = window.firebaseApp;
    const { getAuth } = window.firebaseAuth;
    const { getFirestore } = window.firebaseFirestore;

    // 复用已存在的 app，避免重复初始化
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    this._auth = getAuth(app);
    this._db = getFirestore(app);
    this._initialized = true;
  }

  from(table) {
    // 仅实现 travel_plans 所需方法
    if (table !== 'travel_plans') {
      return {
        select: () => ({ data: [], error: { message: 'Unsupported table' } }),
        insert: () => ({ data: null, error: { message: 'Unsupported table' } }),
        update: () => ({ eq: () => ({ data: null, error: { message: 'Unsupported table' } }) }),
        delete: () => ({ eq: () => ({ data: null, error: { message: 'Unsupported table' } }) })
      };
    }

    const api = {
      select: (columns = '*') => {
        // 构建链式查询对象
        const buildQueryChain = (filters = []) => {
          const executeQuery = async () => {
            await this._initPromise;
            const { collection, query, where, getDocs } = window.firebaseFirestore;
            const colRef = collection(this._db, 'travel_plans');
            
            // 只使用第一个过滤条件（避免需要复合索引），其他条件在客户端过滤
            let q = colRef;
            if (filters.length > 0) {
              q = query(colRef, where(filters[0].column, '==', filters[0].value));
            }
            
            const snap = await getDocs(q);
            let data = [];
            snap.forEach(doc => {
              data.push(doc.data());
            });
            
            // 客户端应用剩余的过滤条件
            if (filters.length > 1) {
              for (let i = 1; i < filters.length; i++) {
                data = data.filter(row => row[filters[i].column] === filters[i].value);
              }
            }
            
            return data;
          };

          const addFilter = (column, value) => {
            return buildQueryChain([...filters, { column, value }]);
          };

          return {
            eq: addFilter,
            order: async (orderByColumn, options = { ascending: true }) => {
              const data = await executeQuery();
              
              // 客户端排序
              data.sort((a, b) => {
                const aVal = a[orderByColumn] || '';
                const bVal = b[orderByColumn] || '';
                if (options.ascending) {
                  return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
                } else {
                  return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
                }
              });
              return { data, error: null };
            },
            // 支持直接 await 或访问 data/error
            then: async (resolve, reject) => {
              try {
                const data = await executeQuery();
                const result = { data, error: null };
                if (resolve) resolve(result);
                return result;
              } catch (error) {
                const result = { data: null, error };
                if (reject) reject(error);
                return result;
              }
            },
            catch: async (fn) => {
              try {
                const data = await executeQuery();
                return { data, error: null };
              } catch (error) {
                return fn(error);
              }
            },
            // 兼容直接访问 data/error（异步）
            get data() {
              // 返回一个 Promise，这样可以直接 await
              return executeQuery().then(data => data);
            },
            get error() {
              return null;
            }
          };
        };
        
        return {
          eq: (column, value) => buildQueryChain([{ column, value }])
        };
      },
      insert: async (data) => {
        await this._initPromise;
        const { collection, addDoc, doc, setDoc, serverTimestamp } = window.firebaseFirestore;
        const colRef = collection(this._db, 'travel_plans');
        // 先生成 doc，再将 id 写入字段，保持与 Supabase 返回形状一致
        const newDocRef = await addDoc(colRef, {});
        const id = newDocRef.id;
        const nowIso = new Date().toISOString();
        const row = { ...data, id, created_at: nowIso, updated_at: nowIso };
        await setDoc(doc(this._db, 'travel_plans', id), row);
        return { data: [row], error: null };
      },
      update: (data) => {
        const buildUpdateChain = (filters = []) => {
          const addFilter = (column, value) => {
            return buildUpdateChain([...filters, { column, value }]);
          };

          return {
            eq: addFilter,
            then: async () => {
              await this._initPromise;
              const { collection, query, where, getDocs, doc, updateDoc } = window.firebaseFirestore;
              const colRef = collection(this._db, 'travel_plans');
              
              // 只使用第一个过滤条件，其他条件在客户端过滤
              let q = colRef;
              if (filters.length > 0) {
                q = query(colRef, where(filters[0].column, '==', filters[0].value));
              }
              
              const snap = await getDocs(q);
              let matches = [];
              snap.forEach(doc => {
                const row = doc.data();
                // 应用所有过滤条件
                const matchesAll = filters.every(f => row[f.column] === f.value);
                if (matchesAll) {
                  matches.push({ docId: doc.id, data: row });
                }
              });
              
              if (matches.length === 0) {
                return { data: null, error: { message: 'Not found' } };
              }
              
              // 更新第一个匹配的文档
              const { docId, data: oldData } = matches[0];
              const docRef = doc(this._db, 'travel_plans', docId);
              const updated = { ...oldData, ...data, updated_at: new Date().toISOString() };
              await updateDoc(docRef, updated);
              return { data: [updated], error: null };
            }
          };
        };
        
        // 让链式调用返回 thenable 对象，可以直接 await
        return {
          eq: (column, value) => {
            const next = buildUpdateChain([{ column, value }]);
            // 返回一个 thenable 对象，可以直接 await
            const thenable = {
              eq: (col, val) => {
                const nextChain = buildUpdateChain([{ column, value }, { column: col, value: val }]);
                return {
                  eq: nextChain.eq,
                  then: nextChain.then,
                  catch: (fn) => nextChain.then().catch(fn)
                };
              },
              then: next.then,
              catch: (fn) => next.then().catch(fn)
            };
            return thenable;
          }
        };
      },
      delete: () => {
        const buildDeleteChain = (filters = []) => {
          const addFilter = (column, value) => {
            return buildDeleteChain([...filters, { column, value }]);
          };

          return {
            eq: addFilter,
            then: async () => {
              await this._initPromise;
              const { collection, query, where, getDocs, doc, deleteDoc } = window.firebaseFirestore;
              const colRef = collection(this._db, 'travel_plans');
              
              // 只使用第一个过滤条件，其他条件在客户端过滤
              let q = colRef;
              if (filters.length > 0) {
                q = query(colRef, where(filters[0].column, '==', filters[0].value));
              }
              
              const snap = await getDocs(q);
              let matches = [];
              snap.forEach(doc => {
                const row = doc.data();
                // 应用所有过滤条件
                const matchesAll = filters.every(f => row[f.column] === f.value);
                if (matchesAll) {
                  matches.push({ docId: doc.id, data: row });
                }
              });
              
              if (matches.length === 0) {
                return { data: null, error: { message: 'Not found' } };
              }
              
              // 删除第一个匹配的文档
              const { docId, data: deletedData } = matches[0];
              await deleteDoc(doc(this._db, 'travel_plans', docId));
              return { data: [deletedData], error: null };
            }
          };
        };
        
        return {
          eq: (column, value) => {
            const next = buildDeleteChain([{ column, value }]);
            // 返回一个 thenable 对象，可以直接 await
            const thenable = {
              eq: (col, val) => {
                const nextChain = buildDeleteChain([{ column, value }, { column: col, value: val }]);
                return {
                  eq: nextChain.eq,
                  then: nextChain.then,
                  catch: (fn) => nextChain.then().catch(fn)
                };
              },
              then: next.then,
              catch: (fn) => next.then().catch(fn)
            };
            return thenable;
          }
        };
      }
    };

    return api;
  }
}

// 获取 Supabase 客户端实例
let supabaseInstance = null;

export function getSupabase() {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  // 优先使用 Firebase
  const firebaseCfg = getFirebaseConfig();
  if (firebaseCfg) {
    supabaseInstance = new FirebaseSupabaseCompatClient(firebaseCfg);
    return supabaseInstance;
  }

  // 次选：如果真的配置了 Supabase（本项目默认未集成包），仍回退到本地兼容
  const supaCfg = getSupabaseConfig();
  if (supaCfg && supaCfg.url && supaCfg.anonKey) {
    console.warn('检测到 Supabase 配置，但未集成 @supabase/supabase-js，使用本地存储模式。');
  }
  supabaseInstance = new LocalSupabaseClient();

  return supabaseInstance;
}

export function saveSupabaseConfig(config) {
  localStorage.setItem('supabase_config', JSON.stringify(config));
  // 重置实例以重新初始化
  supabaseInstance = null;
}

export function saveFirebaseConfig(config) {
  if (config) {
    localStorage.setItem('firebase_config', JSON.stringify(config));
  } else {
    localStorage.removeItem('firebase_config');
  }
  supabaseInstance = null;
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


import { getSupabase } from './supabase';

function withTimeout(promise, ms, message = '请求超时') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  // 确保 promise 是一个 Promise 对象（处理 thenable）
  const promiseObj = Promise.resolve(promise);
  return Promise.race([promiseObj, timeout]).finally(() => clearTimeout(timer));
}

/**
 * 保存旅行计划
 */
export async function savePlan(planData) {
  const supabase = getSupabase();
  const session = supabase.auth.getSession();
  
  if (!session) {
    throw new Error('请先登录');
  }

  const plan = {
    user_id: session.user.id,
    destination: planData.destination,
    days: planData.days,
    budget: planData.budget,
    people: planData.people,
    preferences: JSON.stringify(planData.preferences || []),
    start_date: planData.startDate || null,
    plan_content: planData.planContent || '',
    input_text: planData.inputText || '',
    notes: planData.notes || ''
  };

  if (planData.id) {
    // 更新现有计划
    const { data, error } = await withTimeout(supabase
      .from('travel_plans')
      .update(plan)
      .eq('id', planData.id)
      .eq('user_id', session.user.id), 10000, '保存超时，请检查云端配置或网络');

    if (error) throw error;
    return data?.[0];
  } else {
    // 创建新计划
    const { data, error } = await withTimeout(supabase
      .from('travel_plans')
      .insert(plan), 10000, '保存超时，请检查云端配置或网络');

    if (error) throw error;
    return data?.[0];
  }
}

/**
 * 获取用户的所有旅行计划
 */
export async function getUserPlans() {
  const supabase = getSupabase();
  const session = supabase.auth.getSession();
  
  if (!session) {
    throw new Error('请先登录');
  }

  const { data, error } = await withTimeout(supabase
    .from('travel_plans')
    .select('*')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false }), 10000, '加载计划超时，请检查云端配置或网络');

  if (error) throw error;

  // 解析 preferences JSON
  return data.map(plan => ({
    ...plan,
    preferences: plan.preferences ? JSON.parse(plan.preferences) : []
  }));
}

/**
 * 获取单个旅行计划
 */
export async function getPlan(planId) {
  const supabase = getSupabase();
  const session = supabase.auth.getSession();
  
  if (!session) {
    throw new Error('请先登录');
  }

  const { data, error } = await withTimeout(supabase
    .from('travel_plans')
    .select('*')
    .eq('id', planId)
    .eq('user_id', session.user.id), 10000, '加载计划超时，请检查云端配置或网络');

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('计划不存在');
  }

  const plan = data[0];
  return {
    ...plan,
    preferences: plan.preferences ? JSON.parse(plan.preferences) : []
  };
}

/**
 * 删除旅行计划
 */
export async function deletePlan(planId) {
  const supabase = getSupabase();
  const session = supabase.auth.getSession();
  
  if (!session) {
    throw new Error('请先登录');
  }

  const { data, error } = await withTimeout(supabase
    .from('travel_plans')
    .delete()
    .eq('id', planId)
    .eq('user_id', session.user.id), 10000, '删除计划超时，请检查云端配置或网络');

  if (error) throw error;
  return data?.[0];
}

/**
 * 保存用户信息到云端
 */
export async function saveUserProfile(userData) {
  const supabase = getSupabase();
  const session = supabase.auth.getSession();
  
  if (!session) {
    throw new Error('请先登录');
  }

  if (!session.user || !session.user.id) {
    throw new Error('用户会话无效，请重新登录');
  }

  const profile = {
    user_id: session.user.id,
    name: userData.name,
    email: userData.email,
    login_time: userData.loginTime || new Date().toISOString()
  };

  console.log('开始保存用户资料到云端:', { userId: session.user.id, profile });

  try {
    // 检查是否已存在 - 链式调用返回 thenable 对象，可以直接 await
    const queryPromise = supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', session.user.id);
    
    const queryResult = await withTimeout(queryPromise, 10000, '查询用户信息超时');
    const existing = queryResult?.data || [];
    console.log('查询现有用户资料结果:', existing);

    if (existing && existing.length > 0) {
      // 更新现有记录
      console.log('更新现有用户资料');
      const updatePromise = supabase
        .from('user_profiles')
        .update(profile)
        .eq('user_id', session.user.id);
      
      const updateResult = await withTimeout(updatePromise, 10000, '保存用户信息超时，请检查云端配置或网络');

      if (updateResult?.error) {
        console.error('更新用户资料失败:', updateResult.error);
        throw updateResult.error;
      }
      console.log('用户资料更新成功:', updateResult?.data?.[0]);
      return updateResult?.data?.[0];
    } else {
      // 创建新记录
      console.log('创建新用户资料');
      const insertPromise = supabase
        .from('user_profiles')
        .insert(profile);
      
      const insertResult = await withTimeout(insertPromise, 10000, '保存用户信息超时，请检查云端配置或网络');

      if (insertResult?.error) {
        console.error('创建用户资料失败:', insertResult.error);
        throw insertResult.error;
      }
      console.log('用户资料创建成功:', insertResult?.data?.[0]);
      return insertResult?.data?.[0];
    }
  } catch (error) {
    console.error('保存用户资料到云端时发生错误:', error);
    throw error;
  }
}

/**
 * 获取用户信息
 */
export async function getUserProfile() {
  const supabase = getSupabase();
  const session = supabase.auth.getSession();
  
  if (!session) {
    throw new Error('请先登录');
  }

  const { data, error } = await withTimeout(supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', session.user.id), 10000, '加载用户信息超时，请检查云端配置或网络');

  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
}

/**
 * 保存用户偏好设置到云端
 * preferences 可以是数组（旧格式）或对象（新格式：分类结构）
 */
export async function saveUserPreferences(preferences) {
  const supabase = getSupabase();
  const session = supabase.auth.getSession();
  
  if (!session) {
    throw new Error('请先登录');
  }

  const prefs = {
    user_id: session.user.id,
    preferences: JSON.stringify(preferences || {})
  };

  // 检查是否已存在
  const { data: existing } = await withTimeout(supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', session.user.id), 10000, '查询偏好设置超时');

  if (existing && existing.length > 0) {
    // 更新现有记录
    const { data, error } = await withTimeout(supabase
      .from('user_preferences')
      .update(prefs)
      .eq('user_id', session.user.id), 10000, '保存偏好设置超时，请检查云端配置或网络');

    if (error) throw error;
    const parsed = data?.[0]?.preferences ? JSON.parse(data[0].preferences) : {};
    return {
      ...data?.[0],
      preferences: parsed
    };
  } else {
    // 创建新记录
    const { data, error } = await withTimeout(supabase
      .from('user_preferences')
      .insert(prefs), 10000, '保存偏好设置超时，请检查云端配置或网络');

    if (error) throw error;
    const parsed = data?.[0]?.preferences ? JSON.parse(data[0].preferences) : {};
    return {
      ...data?.[0],
      preferences: parsed
    };
  }
}

/**
 * 获取用户偏好设置
 */
export async function getUserPreferences() {
  const supabase = getSupabase();
  const session = supabase.auth.getSession();
  
  if (!session) {
    throw new Error('请先登录');
  }

  const { data, error } = await withTimeout(supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', session.user.id), 10000, '加载偏好设置超时，请检查云端配置或网络');

  if (error) throw error;
  if (!data || data.length === 0) {
    return null;
  }

  const parsed = data[0].preferences ? JSON.parse(data[0].preferences) : {};
  return {
    ...data[0],
    preferences: parsed
  };
}

/**
 * 保存费用记录到云端
 */
export async function saveBudgetRecord(budgetData) {
  const supabase = getSupabase();
  const session = supabase.auth.getSession();
  
  if (!session) {
    throw new Error('请先登录');
  }

  const record = {
    user_id: session.user.id,
    entries: JSON.stringify(budgetData.entries || []),
    total_budget: budgetData.totalBudget || 0,
    analysis_result: budgetData.analysisResult || ''
  };

  // 检查是否已存在
  const { data: existing } = await withTimeout(supabase
    .from('budget_records')
    .select('*')
    .eq('user_id', session.user.id), 10000, '查询费用记录超时');

  if (existing && existing.length > 0) {
    // 更新现有记录（只保留最新的一条）
    const { data, error } = await withTimeout(supabase
      .from('budget_records')
      .update(record)
      .eq('user_id', session.user.id), 10000, '保存费用记录超时，请检查云端配置或网络');

    if (error) throw error;
    return {
      ...data?.[0],
      entries: data?.[0]?.entries ? JSON.parse(data[0].entries) : [],
      analysisResult: data?.[0]?.analysis_result || ''
    };
  } else {
    // 创建新记录
    const { data, error } = await withTimeout(supabase
      .from('budget_records')
      .insert(record), 10000, '保存费用记录超时，请检查云端配置或网络');

    if (error) throw error;
    return {
      ...data?.[0],
      entries: data?.[0]?.entries ? JSON.parse(data[0].entries) : [],
      analysisResult: data?.[0]?.analysis_result || ''
    };
  }
}

/**
 * 获取用户费用记录
 */
export async function getUserBudgetRecord() {
  const supabase = getSupabase();
  const session = supabase.auth.getSession();
  
  if (!session) {
    throw new Error('请先登录');
  }

  const { data, error } = await withTimeout(supabase
    .from('budget_records')
    .select('*')
    .eq('user_id', session.user.id), 10000, '加载费用记录超时，请检查云端配置或网络');

  if (error) throw error;
  if (!data || data.length === 0) {
    return null;
  }

  return {
    ...data[0],
    entries: data[0].entries ? JSON.parse(data[0].entries) : [],
    analysisResult: data[0].analysis_result || ''
  };
}


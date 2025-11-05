import { getSupabase } from './supabase';

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
    const { data, error } = await supabase
      .from('travel_plans')
      .update(plan)
      .eq('id', planData.id)
      .eq('user_id', session.user.id);

    if (error) throw error;
    return data?.[0];
  } else {
    // 创建新计划
    const { data, error } = await supabase
      .from('travel_plans')
      .insert(plan);

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

  const { data, error } = await supabase
    .from('travel_plans')
    .select('*')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false });

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

  const { data, error } = await supabase
    .from('travel_plans')
    .select('*')
    .eq('id', planId)
    .eq('user_id', session.user.id);

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

  const { data, error } = await supabase
    .from('travel_plans')
    .delete()
    .eq('id', planId)
    .eq('user_id', session.user.id);

  if (error) throw error;
  return data?.[0];
}


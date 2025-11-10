import { generatePlan } from './llm';

/**
 * 使用 LLM 智能解析用户输入的自然语言，提取旅行需求信息
 * @param {string} inputText - 用户输入的自然语言文本
 * @returns {Promise<Object>} 解析后的结构化数据
 */
export async function parseTravelInput(inputText) {
  if (!inputText || !inputText.trim()) {
    return null;
  }

  const parsePrompt = `请从以下用户输入中提取旅行规划信息，并返回 JSON 格式（只返回 JSON，不要其他文字说明）：
用户输入："${inputText}"

请提取以下信息：
1. destination: 目的地（如果没有则返回空字符串）
2. days: 天数（数字，如果没有则返回 0）
3. budget: 预算金额（数字，单位人民币，如果没有则返回 0）
4. people: 同行人数（数字，如果没有则返回 0）
5. preferences: 旅行偏好（数组，如 ["美食", "动漫", "亲子"]，如果没有则返回空数组）
6. startDate: 出发日期（YYYY-MM-DD 格式，如果没有则返回空字符串）
7. notes: 其他备注信息（字符串，如果没有则返回空字符串）

偏好关键词映射：
- 美食、吃、餐厅、料理 -> "美食"
- 自然、风景、山川、海 -> "自然"
- 历史、古迹、博物馆、文化 -> "历史"
- 艺术、展览、画廊、设计 -> "艺术"
- 亲子、孩子、儿童、家庭 -> "亲子"
- 动漫、动画、二次元、漫画 -> "动漫"
- 购物、买、shopping、商场 -> "购物"

JSON 格式示例：
{
  "destination": "日本",
  "days": 5,
  "budget": 10000,
  "people": 2,
  "preferences": ["美食", "动漫", "亲子"],
  "startDate": "",
  "notes": "带孩子一起"
}`;

  try {
    const response = await generatePlan(parsePrompt);
    
    // 尝试从响应中提取 JSON
    let jsonStr = response.trim();
    
    // 如果响应包含代码块，提取其中的 JSON
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    }
    
    // 如果响应直接是 JSON 对象，提取它
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    
    const parsed = JSON.parse(jsonStr);
    
    // 验证和清理数据
    return {
      destination: parsed.destination || '',
      days: Number(parsed.days) || 0,
      budget: Number(parsed.budget) || 0,
      people: Number(parsed.people) || 0,
      preferences: Array.isArray(parsed.preferences) ? parsed.preferences : [],
      startDate: parsed.startDate || '',
      notes: parsed.notes || ''
    };
  } catch (error) {
    console.error('解析输入失败:', error);
    // 如果 LLM 解析失败，尝试简单的正则匹配作为后备
    return fallbackParse(inputText);
  }
}

/**
 * 后备解析方案：使用正则表达式进行简单匹配
 */
function fallbackParse(inputText) {
  const result = {
    destination: '',
    days: 0,
    budget: 0,
    people: 0,
    preferences: [],
    startDate: '',
    notes: ''
  };

  // 匹配目的地：去/到 + 地点
  const destMatch = inputText.match(/(?:去|到|前往)([^，。\s，,]+)/);
  if (destMatch) {
    result.destination = destMatch[1].trim();
  }

  // 匹配天数：X天/X日
  const daysMatch = inputText.match(/(\d+)\s*[天日]/);
  if (daysMatch) {
    result.days = Number(daysMatch[1]);
  }

  // 匹配预算：预算 X 或 X 元/万元
  const budgetMatch = inputText.match(/预算[：:]\s*(\d+)|(\d+)\s*[万千]?元/);
  if (budgetMatch) {
    const amount = budgetMatch[1] || budgetMatch[2];
    const unit = inputText.includes('万') ? 10000 : 1;
    result.budget = Number(amount) * unit;
  }

  // 匹配人数：X人
  const peopleMatch = inputText.match(/(\d+)\s*人/);
  if (peopleMatch) {
    result.people = Number(peopleMatch[1]);
  }

  // 匹配偏好关键词
  const prefKeywords = {
    '美食': ['美食', '吃', '餐厅', '料理', '美食'],
    '自然': ['自然', '风景', '山川', '海', '山'],
    '历史': ['历史', '古迹', '博物馆', '文化'],
    '艺术': ['艺术', '展览', '画廊', '设计'],
    '亲子': ['亲子', '孩子', '儿童', '家庭', '带孩子'],
    '动漫': ['动漫', '动画', '二次元', '漫画'],
    '购物': ['购物', '买', 'shopping', '商场']
  };

  for (const [pref, keywords] of Object.entries(prefKeywords)) {
    if (keywords.some(keyword => inputText.includes(keyword))) {
      if (!result.preferences.includes(pref)) {
        result.preferences.push(pref);
      }
    }
  }

  return result;
}

/**
 * 使用 LLM 智能解析预算输入的自然语言，提取支出信息
 * @param {string} inputText - 用户输入的自然语言文本（如："今天交通费500元"）
 * @returns {Promise<Object>} 解析后的结构化数据
 */
export async function parseBudgetInput(inputText) {
  if (!inputText || !inputText.trim()) {
    return null;
  }

  const parsePrompt = `请从以下用户输入中提取旅行支出信息，并返回 JSON 格式（只返回 JSON，不要其他文字说明）：
用户输入："${inputText}"

请提取以下信息：
1. date: 日期（YYYY-MM-DD 格式，如果提到"今天"、"昨天"、"明天"等，请转换为具体日期，如果没有则返回空字符串）
2. category: 支出类别，必须是以下之一：交通、住宿、门票、餐饮、购物、其他（如果没有明确指定，根据上下文推断）
3. amount: 金额（数字，单位人民币，如果没有则返回 0）
4. note: 备注信息（字符串，如果没有则返回空字符串）

类别推断规则：
- 交通、打车、地铁、公交、飞机、火车、高铁、出租车 -> "交通"
- 住宿、酒店、民宿、旅馆 -> "住宿"
- 门票、景点、门票、游乐园 -> "门票"
- 餐饮、吃饭、餐厅、美食、午餐、晚餐、早餐 -> "餐饮"
- 购物、买、shopping、商场、纪念品 -> "购物"
- 其他情况 -> "其他"

JSON 格式示例：
{
  "date": "2025-01-15",
  "category": "交通",
  "amount": 500,
  "note": "打车费用"
}`;

  try {
    const response = await generatePlan(parsePrompt);
    
    // 尝试从响应中提取 JSON
    let jsonStr = response.trim();
    
    // 如果响应包含代码块，提取其中的 JSON
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    }
    
    // 如果响应直接是 JSON 对象，提取它
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    
    const parsed = JSON.parse(jsonStr);
    
    // 处理日期：如果是"今天"等相对日期，转换为具体日期
    let date = parsed.date || '';
    if (!date) {
      // 如果没有日期，使用今天
      date = new Date().toISOString().split('T')[0];
    } else if (date.includes('今天') || date.includes('今日')) {
      date = new Date().toISOString().split('T')[0];
    } else if (date.includes('昨天')) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      date = yesterday.toISOString().split('T')[0];
    } else if (date.includes('明天')) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      date = tomorrow.toISOString().split('T')[0];
    }
    
    // 验证类别
    const validCategories = ['交通', '住宿', '门票', '餐饮', '购物', '其他'];
    const category = validCategories.includes(parsed.category) ? parsed.category : '其他';
    
    // 验证和清理数据
    return {
      date: date,
      category: category,
      amount: Number(parsed.amount) || 0,
      note: parsed.note || ''
    };
  } catch (error) {
    console.error('解析预算输入失败:', error);
    // 如果 LLM 解析失败，尝试简单的正则匹配作为后备
    return fallbackBudgetParse(inputText);
  }
}

/**
 * 后备解析方案：使用正则表达式进行简单匹配
 */
function fallbackBudgetParse(inputText) {
  const result = {
    date: new Date().toISOString().split('T')[0], // 默认今天
    category: '其他',
    amount: 0,
    note: ''
  };

  // 匹配金额
  const amountMatch = inputText.match(/(\d+(?:\.\d+)?)\s*[万千]?元/);
  if (amountMatch) {
    const amount = Number(amountMatch[1]);
    const unit = inputText.includes('万') ? 10000 : 1;
    result.amount = amount * unit;
  }

  // 匹配类别
  const categoryKeywords = {
    '交通': ['交通', '打车', '地铁', '公交', '飞机', '火车', '高铁', '出租车', '车费'],
    '住宿': ['住宿', '酒店', '民宿', '旅馆', '宾馆'],
    '门票': ['门票', '景点', '游乐园', '入场'],
    '餐饮': ['餐饮', '吃饭', '餐厅', '美食', '午餐', '晚餐', '早餐', '餐费'],
    '购物': ['购物', '买', 'shopping', '商场', '纪念品']
  };

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(keyword => inputText.includes(keyword))) {
      result.category = category;
      break;
    }
  }

  // 提取备注（去除金额和类别关键词后的内容）
  let note = inputText;
  note = note.replace(/\d+(?:\.\d+)?\s*[万千]?元/g, '').trim();
  note = note.replace(/今天|昨天|明天|交通|住宿|门票|餐饮|购物/g, '').trim();
  if (note) {
    result.note = note;
  }

  return result;
}

/**
 * 使用 AI 分析预算情况
 * @param {Array} entries - 支出记录数组
 * @param {number} totalBudget - 总预算（可选）
 * @returns {Promise<string>} AI 分析结果文本
 */
export async function analyzeBudget(entries, totalBudget = null) {
  if (!entries || entries.length === 0) {
    return '暂无支出记录，无法进行分析。';
  }

  // 统计各类别支出
  const categoryStats = {};
  let totalSpent = 0;
  const today = new Date().toISOString().split('T')[0];
  
  entries.forEach(entry => {
    const cat = entry.category || '其他';
    categoryStats[cat] = (categoryStats[cat] || 0) + (entry.amount || 0);
    totalSpent += (entry.amount || 0);
  });

  // 构建分析提示
  const statsText = Object.entries(categoryStats)
    .map(([cat, amount]) => `${cat}: ${amount.toLocaleString()} 元`)
    .join('；');

  const budgetInfo = totalBudget ? `总预算：${totalBudget.toLocaleString()} 元，已花费：${totalSpent.toLocaleString()} 元，剩余：${(totalBudget - totalSpent).toLocaleString()} 元` : `总支出：${totalSpent.toLocaleString()} 元`;

  const analyzePrompt = `请分析以下旅行支出情况，并给出专业的预算建议：

${budgetInfo}
支出记录共 ${entries.length} 条
各类别支出：${statsText}

请从以下几个方面进行分析：
1. 支出结构分析：各类别支出占比是否合理
2. 预算控制建议：如果提供了总预算，分析是否超支或节省
3. 优化建议：如何更合理地分配预算
4. 风险提示：需要注意的支出风险

请用简洁、专业的中文回答，控制在 300 字以内。`;

  try {
    const response = await generatePlan(analyzePrompt);
    return response || '分析失败，请稍后重试。';
  } catch (error) {
    console.error('预算分析失败:', error);
    return `分析失败：${error.message}。您可以查看下方的支出统计信息。`;
  }
}


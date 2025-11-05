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


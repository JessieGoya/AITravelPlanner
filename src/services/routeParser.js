import { generatePlan } from './llm';

/**
 * 从 AI 生成的旅行规划文本中提取地点和路线信息
 * @param {string} planText - AI 生成的规划文本
 * @param {string} destination - 目的地（用于上下文）
 * @returns {Promise<Array<{name: string, day?: number, time?: string, address?: string}>>} 地点信息数组
 */
export async function parsePlacesFromPlan(planText, destination = '') {
  if (!planText || !planText.trim()) {
    return [];
  }

  // 首先尝试使用 LLM 提取地点信息
  try {
    const places = await parsePlacesWithLLM(planText, destination);
    if (places && places.length > 0) {
      return places;
    }
  } catch (error) {
    console.warn('使用 LLM 解析地点失败，尝试使用正则表达式:', error);
  }

  // 如果 LLM 解析失败，使用正则表达式提取
  return parsePlacesWithRegex(planText, destination);
}

/**
 * 使用 LLM 智能提取地点信息
 */
async function parsePlacesWithLLM(planText, destination) {
  const prompt = `请从以下旅行规划文本中提取所有涉及的地点（景点、餐厅、酒店、车站等），并返回 JSON 格式数组（只返回 JSON，不要其他文字说明）：

旅行规划文本：
${planText.substring(0, 3000)}${planText.length > 3000 ? '...' : ''}

目的地上下文：${destination || '未指定'}

要求：
1. 提取所有地点名称，包括景点、餐厅、酒店、车站、机场等
2. 如果文本中有日期或天数信息，尽量提取每个地点对应的日期/天数
3. 如果文本中有时间信息，尽量提取每个地点的时间
4. 尽量提取地点的完整地址（如果文本中有）

返回格式：
[
  {
    "name": "地点名称",
    "day": 1,  // 天数，可选
    "time": "09:00",  // 时间，可选
    "address": "详细地址"  // 地址，可选
  }
]

示例：
[
  {"name": "天安门广场", "day": 1, "time": "09:00", "address": "北京市东城区天安门广场"},
  {"name": "故宫博物院", "day": 1, "time": "10:30", "address": "北京市东城区景山前街4号"},
  {"name": "全聚德烤鸭店", "day": 1, "time": "12:00", "address": "北京市东城区前门大街30号"}
]`;

  try {
    const response = await generatePlan(prompt);
    // 尝试从响应中提取 JSON
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const places = JSON.parse(jsonMatch[0]);
      return Array.isArray(places) ? places : [];
    }
    return [];
  } catch (error) {
    console.error('LLM 解析地点失败:', error);
    return [];
  }
}

/**
 * 使用正则表达式提取地点信息（后备方案）
 */
function parsePlacesWithRegex(planText, destination) {
  const places = [];
  
  // 常见的地点模式
  const placePatterns = [
    // 第X天 + 地点
    /第[一二三四五六七八九十\d]+天[：:]\s*([^\n]+)/g,
    // 地点名称（常见景点、餐厅、酒店名称模式）
    /([^\n]+?)(?:景点|景区|公园|博物馆|纪念馆|寺|庙|塔|广场|大街|路|酒店|餐厅|饭店|小吃|美食)/g,
    // 时间 + 地点
    /\d{1,2}[:：]\d{2}\s*[-~]\s*([^\n]+)/g,
    // 地点名称（带引号或书名号）
    /["""'"'《》]([^"""'"'《》]+)["""'"'《》]/g,
  ];

  const foundPlaces = new Set();

  placePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(planText)) !== null) {
      const placeName = match[1]?.trim();
      if (placeName && placeName.length > 1 && placeName.length < 50) {
        // 过滤掉明显不是地名的内容
        if (!placeName.match(/^(交通|住宿|餐饮|门票|费用|预算|总计|合计|元|人民币)/)) {
          foundPlaces.add(placeName);
        }
      }
    }
  });

  // 如果找到地点，转换为标准格式
  foundPlaces.forEach(name => {
    places.push({
      name: name,
      address: destination ? `${destination}${name}` : name
    });
  });

  return places;
}

/**
 * 从规划文本中提取路线顺序（按日期和天数组织）
 * @param {string} planText - AI 生成的规划文本
 * @returns {Array<Array<string>>} 按天数分组的地点名称数组
 */
export function parseRouteSequence(planText) {
  if (!planText || !planText.trim()) return [];

  const lines = planText.split(/\r?\n/);
  const daySections = [];
  let currentDay = null;
  let currentBuffer = [];

  const commitCurrent = () => {
    if (currentDay == null) return;
    const content = currentBuffer.join('\n').trim();
    if (!content) return;
    const places = extractPlaceNames(content);
    if (places.length > 0) {
      daySections.push({ day: currentDay, places });
    }
  };

  const stripFormatting = (text) => {
    let t = text.trim();
    if (!t) return '';
    // 移除引用、标题、列表等常见 Markdown 前缀
    t = t.replace(/^>+\s*/, '');
    t = t.replace(/^#+\s*/, '');
    t = t.replace(/^[\u2022\u2023\u25CF\u25CB\u25A0\u25A1•●○□■\-–—]+\s*/, '');
    t = t.replace(/^\d+[.)、]\s*/, '');
    t = t.replace(/^\(?\d+\)?\s*/, '');
    // 去掉包裹在行首尾的粗体/斜体/删除线符号
    t = t.replace(/^[*_~`]+/, '').replace(/[*_~`]+$/, '');
    return t.trim();
  };

  lines.forEach((rawLine) => {
    const originalLine = rawLine || '';
    const line = originalLine.trim();
    const cleaned = stripFormatting(line);

    if (!cleaned) {
      if (currentBuffer.length > 0) currentBuffer.push('');
      return;
    }

    const dayMatch = cleaned.match(/^(?:第\s*([一二三四五六七八九十百千万\d]+)\s*天|第\s*([一二三四五六七八九十百千万\d]+)\s*日|第\s*([一二三四五六七八九十百千万\d]+)\s*晚|Day\s*(\d+)|DAY\s*(\d+))/i);
    if (dayMatch) {
      commitCurrent();
      currentDay = parseDayNumber(dayMatch[1] || dayMatch[2] || dayMatch[3] || dayMatch[4] || dayMatch[5]);
      currentBuffer = [];
      const remainder = cleaned
        .replace(/^(?:第\s*[一二三四五六七八九十百千万\d]+\s*(?:天|日|晚)|Day\s*\d+|DAY\s*\d+)/i, '')
        .replace(/^[:：\-——|｜\s]+/, '')
        .trim();
      if (remainder) currentBuffer.push(remainder);
    } else if (currentDay != null) {
      currentBuffer.push(cleaned);
    }
  });

  commitCurrent();

  if (daySections.length === 0) {
    const allPlaces = extractPlaceNames(planText);
    return allPlaces.length > 0 ? [allPlaces] : [];
  }

  daySections.sort((a, b) => a.day - b.day);
  return daySections.map(section => section.places);
}

/**
 * 解析中文数字或阿拉伯数字
 */
function parseDayNumber(str) {
  if (!str) return 1;
  const direct = parseInt(str, 10);
  if (!Number.isNaN(direct)) return direct;

  const cnNums = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const cnUnits = { 十: 10, 百: 100, 千: 1000, 万: 10000 };

  let result = 0;
  let unit = 1;
  let numBuffer = 0;

  const chars = str.split('');
  while (chars.length > 0) {
    const char = chars.pop();
    if (cnUnits[char]) {
      const tempUnit = cnUnits[char];
      if (numBuffer === 0) numBuffer = 1;
      result += numBuffer * tempUnit;
      numBuffer = 0;
      unit = tempUnit / 10;
    } else if (cnNums[char] !== undefined) {
      numBuffer = cnNums[char];
      if (unit < 1) unit = 1;
      result += numBuffer * unit;
      numBuffer = 0;
    }
  }

  if (numBuffer > 0) result += numBuffer * unit;
  return result || 1;
}

/**
 * 从文本中提取地点名称
 */
function extractPlaceNames(text) {
  const places = [];
  const patterns = [
    /([^\n，,。.]+?)(?:景点|景区|公园|博物馆|纪念馆|寺|庙|塔|广场|大街|路|酒店|餐厅|饭店|小吃|美食)/g,
    /["""'"'《》]([^"""'"'《》]+)["""'"'《》]/g,
  ];

  const found = new Set();
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1]?.trim();
      if (name && name.length > 1 && name.length < 50) {
        if (!name.match(/^(交通|住宿|餐饮|门票|费用|预算|总计|合计|元|人民币)/)) {
          found.add(name);
        }
      }
    }
  });

  return Array.from(found);
}


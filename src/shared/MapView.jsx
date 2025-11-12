import { useEffect, useMemo, useRef, useState } from 'react';
import { getRuntimeConfig } from '../services/config';
import { geocode, planRoute } from '../services/geocode';
import { getAdministrativeBoundaryGeoJSON } from '../services/boundary';

/**
 * MapView 组件 - 支持定位和路线导航
 * @param {Object} props
 * @param {string} props.destination - 目的地地址（用于定位）
 * @param {Array<{name: string, lng?: number, lat?: number, address?: string}>} props.places - 地点列表（用于显示标记和路线）
 * @param {Array<Array<string>>} props.routeSequence - 路线序列（按天数分组的地点名称）
 * @param {string} props.routeStrategy - 路线策略（driving/walking/transit）
 */
export default function MapView({ destination, places = [], routeSequence = [], routeStrategy = 'driving', persistedState = null, onStatePersist }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const polylinesRef = useRef([]);
  const restoredSignatureRef = useRef(null);
  const lastSnapshotRef = useRef(null);
  const [progress, setProgress] = useState({ active: false, percent: 0, message: '' });
  const [mapReady, setMapReady] = useState(false);
  const cfg = getRuntimeConfig();

  const inputSignature = useMemo(() => {
    const normalizedPlaces = Array.isArray(places)
      ? places.map((p) => ({
          name: (p?.name || '').trim(),
          address: (p?.address || '').trim(),
          day: p?.day ?? null,
          time: p?.time ?? null
        }))
      : [];
    const normalizedRouteSequence = Array.isArray(routeSequence)
      ? routeSequence.map((day) =>
          Array.isArray(day) ? day.map((name) => (name || '').trim()) : []
        )
      : [];
    return JSON.stringify({
      destination: (destination || '').trim(),
      routeStrategy: routeStrategy || '',
      places: normalizedPlaces,
      routeSequence: normalizedRouteSequence
    });
  }, [destination, places, routeSequence, routeStrategy]);

  useEffect(() => {
    restoredSignatureRef.current = null;
  }, [inputSignature]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (!persistedState || typeof persistedState !== 'object') return;
    const snapshotSignature = persistedState.signature || '__snapshot__';
    if (restoredSignatureRef.current === snapshotSignature) return;
    const signatureMatches = persistedState.signature && persistedState.signature === inputSignature;
    const noCurrentMarkers = markersRef.current.length === 0 && polylinesRef.current.length === 0;
    if (!signatureMatches && !noCurrentMarkers) return;
    const restored = restoreSnapshot(persistedState);
    if (restored) {
      restoredSignatureRef.current = snapshotSignature;
    }
  }, [mapReady, persistedState, inputSignature]);

  // 获取路线颜色（根据天数）
  const getRouteColor = (dayIndex) => {
    const colors = ['#3388ff', '#ff6600', '#00cc66', '#cc00ff', '#ffcc00', '#ff0066', '#00ccff'];
    return colors[dayIndex % colors.length];
  };

  // 获取标记样式（根据天数，返回颜色与简易“图案”类型）
  const getMarkerStyle = (dayIndex) => {
    // 与路线色保持一致，图案在高索引时添加条纹以区分
    const color = getRouteColor(dayIndex);
    const pattern = dayIndex % 2 === 0 ? 'solid' : 'stripe';
    return { color, pattern };
  };

  // 生成彩色 SVG dataURL，用于作为不同天的标记图标
  const buildSvgDataUrl = (color, pattern = 'solid') => {
    const size = 28; // 像素
    const radius = 10;
    // 简单的圆形标记 + 白色描边；奇数天加斜纹
    const stripeDefs = `
      <defs>
        <pattern id="diagonalHatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="6" height="6" fill="${color}" />
          <path d="M0 0 L0 6" stroke="rgba(255,255,255,0.55)" stroke-width="2" />
        </pattern>
      </defs>
    `;
    const fill = pattern === 'stripe' ? 'url(#diagonalHatch)' : color;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        ${pattern === 'stripe' ? stripeDefs : ''}
        <circle cx="${size / 2}" cy="${size / 2 - 2}" r="${radius}" fill="${fill}" stroke="#ffffff" stroke-width="3"/>
        <path d="M${size / 2} ${size / 2 + radius - 2} L ${size / 2 - 5} ${size - 4} L ${size / 2 + 5} ${size - 4} Z" fill="${fill}" stroke="#ffffff" stroke-width="2"/>
      </svg>
    `.trim();
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  };

  const ensureArrayLngLat = (path) => {
    if (!Array.isArray(path)) return [];
    return path
      .map((point) => {
        if (!point) return null;
        if (typeof point.lng === 'number' && typeof point.lat === 'number') {
          return {
            ...point,
            lng: Number(point.lng),
            lat: Number(point.lat)
          };
        }
        if (Array.isArray(point) && point.length >= 2) {
          const [lng, lat] = point;
          if (typeof lng === 'number' && typeof lat === 'number') {
            return { lng: Number(lng), lat: Number(lat) };
          }
        }
        const maybeLng = point?.x ?? point?.longitude ?? point?.lon;
        const maybeLat = point?.y ?? point?.latitude ?? point?.lat;
        if (typeof maybeLng === 'number' && typeof maybeLat === 'number') {
          return {
            ...point,
            lng: Number(maybeLng),
            lat: Number(maybeLat)
          };
        }
        return null;
      })
      .filter(Boolean);
  };

  const normalizeSnapshotPlaces = (rawPlaces) => {
    if (!Array.isArray(rawPlaces)) return [];
    return rawPlaces
      .map((place) => {
        if (!place) return null;
        const lng = typeof place.lng === 'number' ? Number(place.lng) : typeof place?.position?.lng === 'number' ? Number(place.position.lng) : null;
        const lat = typeof place.lat === 'number' ? Number(place.lat) : typeof place?.position?.lat === 'number' ? Number(place.position.lat) : null;
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        return {
          name: place.name || '',
          address: place.address || '',
          lng,
          lat,
          dayIndex: typeof place.dayIndex === 'number' ? place.dayIndex : null
        };
      })
      .filter(Boolean);
  };

  const normalizeSnapshotPolylines = (rawPolylines) => {
    if (!Array.isArray(rawPolylines)) return [];
    return rawPolylines
      .map((polyline) => {
        if (!polyline) return null;
        const path = ensureArrayLngLat(polyline.path || polyline.points || polyline.coords || []);
        if (!Array.isArray(path) || path.length < 2) return null;
        return {
          path: path.map(({ lng, lat }) => ({ lng, lat })),
          strokeColor: polyline.strokeColor || '#3388ff',
          strokeWeight: typeof polyline.strokeWeight === 'number' ? polyline.strokeWeight : 3,
          strokeOpacity: typeof polyline.strokeOpacity === 'number' ? polyline.strokeOpacity : 0.8,
          strokeStyle: polyline.strokeStyle === 'dashed' ? 'dashed' : 'solid',
          dayIndex: typeof polyline.dayIndex === 'number' ? polyline.dayIndex : null
        };
      })
      .filter(Boolean);
  };

  const normalizeViewportCoords = (coords) =>
    ensureArrayLngLat(Array.isArray(coords) ? coords : []);

  const getMapProviderInUse = () => {
    if (!mapRef.current) return cfg.map.provider;
    try {
      if (window.L && window.L.Map && mapRef.current instanceof window.L.Map) {
        return 'osm';
      }
    } catch (error) {
      console.warn('检测 Leaflet 地图实例失败:', error);
    }
    try {
      if (window.AMap && window.AMap.Map && mapRef.current instanceof window.AMap.Map) {
        return 'amap';
      }
    } catch (error) {
      console.warn('检测高德地图实例失败:', error);
    }
    try {
      if (window.BMapGL && window.BMapGL.Map && mapRef.current instanceof window.BMapGL.Map) {
        return 'baidu';
      }
    } catch (error) {
      console.warn('检测百度地图实例失败:', error);
    }
    return cfg.map.provider;
  };

  const addMarkerToMap = (coord, dayIndex, providerOverride) => {
    if (!mapRef.current || !coord || typeof coord.lng !== 'number' || typeof coord.lat !== 'number') return null;
    const provider = providerOverride || getMapProviderInUse();
    const markerStyle =
      dayIndex !== undefined && dayIndex !== null
        ? getMarkerStyle(dayIndex)
        : { color: '#999999', pattern: 'solid' };
    const iconUrl = buildSvgDataUrl(markerStyle.color, markerStyle.pattern);

    try {
      if (provider === 'baidu' && window.BMapGL) {
        const pt = new window.BMapGL.Point(coord.lng, coord.lat);
        const size = new window.BMapGL.Size(28, 28);
        const icon = new window.BMapGL.Icon(iconUrl, size, { imageSize: size });
        const marker = new window.BMapGL.Marker(pt, { icon });
        mapRef.current.addOverlay(marker);
        if (coord.name || coord.address) {
          const infoWindow = new window.BMapGL.InfoWindow(
            `<div style="padding: 8px;"><strong>${coord.name || ''}</strong><br/>${coord.address || ''}</div>`,
            { width: 200, height: 80 }
          );
          marker.addEventListener('click', () => {
            mapRef.current.openInfoWindow(infoWindow, pt);
          });
        }
        markersRef.current.push(marker);
        return marker;
      }

      if (provider === 'osm' && window.L) {
        const icon = window.L.icon({
          iconUrl,
          iconSize: [28, 28],
          iconAnchor: [14, 26],
          popupAnchor: [0, -24]
        });
        const marker = window.L.marker([coord.lat, coord.lng], { icon }).addTo(mapRef.current);
        if (coord.name || coord.address) {
          marker.bindPopup(`<div style="padding: 8px;"><strong>${coord.name || ''}</strong><br/>${coord.address || ''}</div>`);
        }
        markersRef.current.push(marker);
        return marker;
      }

      if (provider === 'amap' && window.AMap) {
        const markerEl = document.createElement('div');
        markerEl.style.width = '24px';
        markerEl.style.height = '24px';
        markerEl.style.transform = 'translate(-50%, -100%)';
        markerEl.style.backgroundImage = `url("${iconUrl}")`;
        markerEl.style.backgroundSize = 'cover';
        markerEl.style.pointerEvents = 'auto';
        const marker = new window.AMap.Marker({
          position: [coord.lng, coord.lat],
          title: coord.name || '',
          content: markerEl
        });
        if (coord.name || coord.address) {
          marker.on('click', () => {
            const infoWindow = new window.AMap.InfoWindow({
              content: `<div style="padding: 8px;"><strong>${coord.name || ''}</strong><br/>${coord.address || ''}</div>`
            });
            infoWindow.open(mapRef.current, [coord.lng, coord.lat]);
          });
        }
        mapRef.current.add(marker);
        markersRef.current.push(marker);
        return marker;
      }
    } catch (error) {
      console.warn('添加标记失败:', error);
    }

    return null;
  };

  const addPolylineToMap = (path, options = {}, providerOverride) => {
    if (!mapRef.current) return null;
    const coords = ensureArrayLngLat(path);
    if (coords.length < 2) return null;
    const { strokeColor, strokeWeight = 3, strokeOpacity = 0.8, strokeStyle = 'solid' } = options;
    const provider = providerOverride || getMapProviderInUse();

    try {
      if (provider === 'baidu' && window.BMapGL) {
        const points = coords.map((p) => new window.BMapGL.Point(p.lng, p.lat));
        const polyline = new window.BMapGL.Polyline(points, {
          strokeColor,
          strokeWeight,
          strokeOpacity,
          strokeStyle
        });
        mapRef.current.addOverlay(polyline);
        polylinesRef.current.push(polyline);
        return polyline;
      }

      if (provider === 'osm' && window.L) {
        const pathLatLng = coords.map((p) => [p.lat, p.lng]);
        const polyline = window.L
          .polyline(pathLatLng, {
            color: strokeColor,
            weight: strokeWeight,
            opacity: strokeOpacity,
            dashArray: strokeStyle === 'dashed' ? '6,6' : undefined
          })
          .addTo(mapRef.current);
        polylinesRef.current.push(polyline);
        return polyline;
      }

      if (provider === 'amap' && window.AMap) {
        const pathLngLat = coords.map((p) => [p.lng, p.lat]);
        const polyline = new window.AMap.Polyline({
          path: pathLngLat,
          strokeColor,
          strokeWeight,
          strokeOpacity,
          strokeStyle
        });
        mapRef.current.add(polyline);
        polylinesRef.current.push(polyline);
        return polyline;
      }
    } catch (error) {
      console.warn('添加折线失败:', error);
    }

    return null;
  };


  // 规范化名称：去空格、转小写、去常见标点与括号内容、去常见后缀
  const normalizeName = (name) => {
    if (!name || typeof name !== 'string') return '';
    const suffixes = ['景点', '景区', '公园', '博物馆', '纪念馆', '寺', '庙', '塔', '广场', '大街', '路', '酒店', '餐厅', '饭店', '店', '馆', '院', '楼', '中心'];
    const strip = (s) => suffixes.reduce((acc, suf) => acc.replace(new RegExp(suf, 'g'), ''), s);
    let normalized = (name || '')
      .toLowerCase()
      .replace(/\(.*?\)|（.*?）/g, '') // 去括号内容
      .replace(/[·\.\-_,，。；;：:！!？?/\\\s]+/g, '') // 去标点与空白
      .trim();
    // 去除常见前缀
    normalized = normalized.replace(/^(前往|打卡|游览|参观|途经|集合于|抵达|到达|出发至|出发到|入住于|入住|退房后前往)\s*/, '');
    normalized = normalized.replace(/\s*(集合|结束|返回|入住|用餐|自由活动|休息|酒店|青旅|旅馆|宾馆)$/, '');
    return strip(normalized);
  };

  // 为地点生成复合键（用于唯一标识），避免名称冲突
  const compositeKey = (p) => {
    const n = normalizeName(p?.name || '');
    const lng = typeof p?.lng === 'number' ? p.lng.toFixed(6) : 'NaN';
    const lat = typeof p?.lat === 'number' ? p.lat.toFixed(6) : 'NaN';
    return `${n}|${lng}|${lat}`;
  };

  // 名称匹配：与路线匹配时用到，与下方路线匹配逻辑保持一致
  const isNameMatch = (a, b) => {
    const na = (a || '').trim();
    const nb = (b || '').trim();
    if (!na || !nb) return false;
    // 完全相等
    if (na === nb) return true;
    // 包含关系（更宽松）
    if (na.includes(nb) || nb.includes(na)) return true;
    // 规范化后匹配
    const sa = normalizeName(na);
    const sb = normalizeName(nb);
    if (sa && sb) {
      if (sa === sb) return true;
      if (sa.includes(sb) || sb.includes(sa)) return true;
      // 如果规范化后的名称长度都大于2，且其中一个包含另一个的主要部分，也认为匹配
      if (sa.length > 2 && sb.length > 2) {
        const minLen = Math.min(sa.length, sb.length);
        const maxLen = Math.max(sa.length, sb.length);
        // 如果较短名称的长度至少是较长名称的60%，且较长名称包含较短名称，认为匹配
        if (minLen / maxLen >= 0.6 && (sa.length > sb.length ? sa.includes(sb) : sb.includes(sa))) {
          return true;
        }
      }
    }
    return false;
  };

  // 根据 routeSequence 计算每个地点的 dayIndex
  // 返回 Map<复合键 name|lng|lat, dayIndex>，避免同名地点跨天混淆
  const computePlaceDayIndexMap = (allPlaces, sequence) => {
    const keyToDay = new Map();
    if (!Array.isArray(allPlaces)) return keyToDay;

    // 第一步：优先使用地点已有的 day 属性（如果 parsePlacesFromPlan 已经提取了天数信息）
    for (let i = 0; i < allPlaces.length; i++) {
      const p = allPlaces[i];
      if (p && typeof p.day === 'number' && p.day > 0) {
        // day 是 1-based，转换为 0-based 的 dayIndex
        const dayIndex = p.day - 1;
        const key = compositeKey(p);
        keyToDay.set(key, dayIndex);
        console.log(`地点 ${p.name} 使用已有的 day 属性: ${p.day} -> dayIndex ${dayIndex}`);
      }
    }

    // 第二步：如果没有 routeSequence，直接返回（已基于 day 属性的映射）
    if (!Array.isArray(sequence) || sequence.length === 0) {
      return keyToDay;
    }

    // 第三步：基于 routeSequence 进行名称匹配（补充未匹配的地点）
    // 为每个规范化名称建立候选索引列表（可能有重复同名）
    const nameToIndices = new Map();
    for (let i = 0; i < allPlaces.length; i++) {
      const p = allPlaces[i];
      const norm = normalizeName(p?.name || '');
      if (!norm) continue;
      if (!nameToIndices.has(norm)) nameToIndices.set(norm, []);
      nameToIndices.get(norm).push(i);
    }
    // 跟踪已分配到某天的具体地点索引，避免同一实体跨天复用
    const assignedIndex = new Set();
    // 已经通过 day 属性分配的地点，不再参与 routeSequence 匹配
    for (let i = 0; i < allPlaces.length; i++) {
      const p = allPlaces[i];
      if (p && typeof p.day === 'number' && p.day > 0) {
        assignedIndex.add(i);
      }
    }

    // 按天按顺序，为每个目标名称选择一个尚未分配的最佳候选
    for (let dayIndex = 0; dayIndex < sequence.length; dayIndex++) {
      const dayPlaces = sequence[dayIndex] || [];
      for (const targetName of dayPlaces) {
        const normTarget = normalizeName(targetName || '');
        if (!normTarget) continue;
        
        // 首先尝试精确匹配（规范化后的名称）
        let candidates = (nameToIndices.get(normTarget) || [])
          .filter(idx => !assignedIndex.has(idx));
        
        // 如果精确匹配失败，尝试宽松匹配
        if (candidates.length === 0) {
          // 在所有地点里做宽松匹配，找一个未分配的
          const idx = allPlaces.findIndex((p, i) => {
            if (assignedIndex.has(i)) return false;
            // 尝试多种匹配方式
            const pName = (p?.name || '').trim();
            const tName = (targetName || '').trim();
            // 完全相等
            if (pName === tName) return true;
            // 包含关系
            if (pName.includes(tName) || tName.includes(pName)) return true;
            // 规范化后匹配
            return isNameMatch(pName, tName);
          });
          if (idx >= 0) {
            assignedIndex.add(idx);
            const key = compositeKey(allPlaces[idx]);
            // 如果该地点还没有 dayIndex，才设置
            if (!keyToDay.has(key)) {
              keyToDay.set(key, dayIndex);
              console.log(`地点 ${allPlaces[idx].name} 通过宽松匹配分配到第 ${dayIndex + 1} 天`);
            }
          }
          continue;
        }
        
        // 优先：完全相等的名称
        let chosen = candidates.find(i => (allPlaces[i]?.name || '').trim() === (targetName || '').trim());
        if (chosen == null) {
          // 次之：更长名称（更具体）
          chosen = candidates.sort((a, b) => (allPlaces[b]?.name || '').length - (allPlaces[a]?.name || '').length)[0];
        }
        if (chosen == null) chosen = candidates[0];
        assignedIndex.add(chosen);
        const key = compositeKey(allPlaces[chosen]);
        // 如果该地点还没有 dayIndex，才设置（避免覆盖已有的 day 属性）
        if (!keyToDay.has(key)) {
          keyToDay.set(key, dayIndex);
          console.log(`地点 ${allPlaces[chosen].name} 通过 routeSequence 匹配分配到第 ${dayIndex + 1} 天`);
        }
      }
    }
    
    console.log(`地点天数映射完成，共 ${keyToDay.size} 个地点有天数信息，总地点数 ${allPlaces.length}`);
    return keyToDay;
  };

  // 辅助：增强的地理编码，尝试多种查询组合（名称/地址 + 目的地上下文）
  const geocodeWithAugment = async (place, destinationCtx) => {
    const candidates = [];
    if (place?.address) candidates.push(place.address);
    if (place?.name) candidates.push(place.name);
    if (place?.name && destinationCtx) candidates.push(`${destinationCtx} ${place.name}`);
    // 提取目的地的“城市/区域关键词”
    if (place?.name && destinationCtx) {
      const city = String(destinationCtx).replace(/(省|市|自治区|特别行政区|县|区)$/g, '');
      if (city && city !== destinationCtx) {
        candidates.push(`${city} ${place.name}`);
      }
    }
    // 去重并保留顺序
    const unique = Array.from(new Set(candidates.filter(Boolean)));
    for (const q of unique) {
      try {
        const r = await geocode(q);
        if (r && typeof r.lng === 'number' && typeof r.lat === 'number') {
          return r;
        }
      } catch {
        // 尝试下一个候选
      }
    }
    throw new Error('增强地理编码失败');
  };

  // 去重：基于坐标网格（约 ~1m-10m 级别，避免重复点覆盖）
  const dedupeByCoordGrid = (coords, decimals = 5) => {
    const map = new Map();
    for (const c of coords) {
      if (!c || typeof c.lng !== 'number' || typeof c.lat !== 'number') continue;
      const key = `${c.lng.toFixed(decimals)},${c.lat.toFixed(decimals)}`;
      if (!map.has(key)) map.set(key, c);
    }
    return Array.from(map.values());
  };

  // 点是否在多边形内（支持 Polygon 与 MultiPolygon），采用射线法
  const pointInPolygon = (lng, lat, geometry) => {
    if (!geometry || !geometry.type || !geometry.coordinates) return false;
    const isPointInRing = (ptLng, ptLat, ring) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = yi > ptLat !== yj > ptLat &&
          ptLng < ((xj - xi) * (ptLat - yi)) / (yj - yi + 0.0) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    };
    if (geometry.type === 'Polygon') {
      const [outer, ...holes] = geometry.coordinates;
      if (!outer) return false;
      if (!isPointInRing(lng, lat, outer)) return false;
      // If inside outer, ensure not inside any hole
      for (const hole of holes) {
        if (isPointInRing(lng, lat, hole)) return false;
      }
      return true;
    }
    if (geometry.type === 'MultiPolygon') {
      for (const polygon of geometry.coordinates) {
        const [outer, ...holes] = polygon;
        if (!outer) continue;
        if (isPointInRing(lng, lat, outer)) {
          let inHole = false;
          for (const hole of holes) {
            if (isPointInRing(lng, lat, hole)) {
              inHole = true;
              break;
            }
          }
          if (!inHole) return true;
        }
      }
      return false;
    }
    return false;
  };

  // 计算两点之间的球面距离（单位：千米）
  const haversineKm = (lng1, lat1, lng2, lat2) => {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371; // 地球半径 km
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // 判断坐标是否在中国境内（粗略判断）
  const isInChina = (lng, lat) => {
    // 中国大致边界：经度 73-135，纬度 18-54
    return lng >= 73 && lng <= 135 && lat >= 18 && lat <= 54;
  };

  // 根据地点坐标自动选择合适的地图提供商
  const getEffectiveProvider = (coords) => {
    const providerInUse = getMapProviderInUse();
    if (providerInUse === 'osm') {
      return 'osm';
    }
    if (coords && coords.length > 0) {
      const allInChina = coords.every(
        (c) => c && typeof c.lng === 'number' && typeof c.lat === 'number' && isInChina(c.lng, c.lat)
      );
      if (!allInChina && providerInUse !== 'osm') {
        console.log('检测到海外地点，如需更好的显示效果，请考虑切换到 OpenStreetMap');
      }
    }
    return providerInUse;
  };

  // 清理标记
  const clearMarkers = () => {
    if (!mapRef.current) return;
    const provider = getMapProviderInUse();
    markersRef.current.forEach(marker => {
      try {
        if (provider === 'osm' && window.L && typeof mapRef.current.removeLayer === 'function') {
          mapRef.current.removeLayer(marker);
        } else if (provider === 'baidu' && typeof mapRef.current.removeOverlay === 'function') {
          mapRef.current.removeOverlay(marker);
        } else if (provider === 'amap' && typeof mapRef.current.remove === 'function') {
          mapRef.current.remove(marker);
        } else if (marker && typeof marker.remove === 'function') {
          marker.remove();
        }
      } catch (e) {
        // 忽略清理错误
      }
    });
    markersRef.current = [];
  };

  // 清理路线
  const clearPolylines = () => {
    if (!mapRef.current) return;
    const provider = getMapProviderInUse();
    polylinesRef.current.forEach(polyline => {
      try {
        if (provider === 'osm' && window.L && typeof mapRef.current.removeLayer === 'function') {
          mapRef.current.removeLayer(polyline);
        } else if (provider === 'baidu' && typeof mapRef.current.removeOverlay === 'function') {
          mapRef.current.removeOverlay(polyline);
        } else if (provider === 'amap' && typeof mapRef.current.remove === 'function') {
          mapRef.current.remove(polyline);
        } else if (polyline && typeof polyline.remove === 'function') {
          polyline.remove();
        }
      } catch (e) {
        // 忽略清理错误
      }
    });
    polylinesRef.current = [];
  };

  const restoreSnapshot = (snapshot) => {
    if (!snapshot || typeof snapshot !== 'object') return false;
    if (!mapRef.current) {
      console.warn('地图尚未初始化，无法恢复快照');
      return false;
    }
    const providerInUse = getMapProviderInUse();
    if (snapshot.provider && snapshot.provider !== providerInUse) {
      console.warn('地图快照的提供商与当前地图不匹配，跳过恢复', {
        snapshotProvider: snapshot.provider,
        providerInUse
      });
      return false;
    }
    try {
      clearMarkers();
      clearPolylines();
      const provider = providerInUse;
      const snapshotPlaces = normalizeSnapshotPlaces(snapshot.places);
      snapshotPlaces.forEach((place) => {
        addMarkerToMap(place, place.dayIndex ?? null, provider);
      });
      const snapshotPolylines = normalizeSnapshotPolylines(snapshot.polylines);
      snapshotPolylines.forEach((polyline) => {
        addPolylineToMap(
          polyline.path,
          {
            strokeColor:
              polyline.strokeColor ??
              (polyline.dayIndex != null ? getRouteColor(polyline.dayIndex) : '#3388ff'),
            strokeWeight: polyline.strokeWeight ?? 3,
            strokeOpacity: polyline.strokeOpacity ?? 0.8,
            strokeStyle: polyline.strokeStyle ?? 'solid'
          },
          provider
        );
      });
      const viewportCoords = normalizeViewportCoords(snapshot.viewportCoords);
      if (viewportCoords.length > 0) {
        adjustMapView(viewportCoords);
      } else if (snapshotPlaces.length > 0) {
        adjustMapView(snapshotPlaces);
      }
      const normalizedSnapshot = {
        provider,
        places: snapshotPlaces,
        polylines: snapshotPolylines,
        viewportCoords: viewportCoords.length > 0 ? viewportCoords : snapshotPlaces.map(({ lng, lat }) => ({ lng, lat })),
        signature: snapshot.signature || inputSignature
      };
      lastSnapshotRef.current = normalizedSnapshot;
      setProgress({ active: false, percent: 100, message: '' });
      return true;
    } catch (error) {
      console.error('恢复地图状态失败:', error);
      return false;
    }
  };

  const persistSnapshot = (data) => {
    if (!data) return;
    const normalizedPlaces = normalizeSnapshotPlaces(data.places);
    const normalizedPolylines = normalizeSnapshotPolylines(data.polylines);
    const normalizedViewport = normalizeViewportCoords(data.viewportCoords);
    const snapshot = {
      provider: data.provider || getMapProviderInUse(),
      places: normalizedPlaces,
      polylines: normalizedPolylines,
      viewportCoords:
        normalizedViewport.length > 0
          ? normalizedViewport
          : normalizedPlaces.map(({ lng, lat }) => ({ lng, lat })),
      signature: inputSignature
    };
    restoredSignatureRef.current = snapshot.signature;
    lastSnapshotRef.current = snapshot;
    if (typeof onStatePersist !== 'function') return;
    try {
      onStatePersist({
        ...snapshot,
        timestamp: Date.now()
      });
    } catch (error) {
      console.warn('保存地图状态快照失败:', error);
    }
  };

  // 加载地图脚本和样式
  const loadMapScript = (provider) => {
    return new Promise((resolve, reject) => {
      // 检查是否已加载
      if (provider === 'baidu' && window.BMapGL && window.BMapGL.Map) {
        resolve();
        return;
      }
      if (provider === 'amap' && window.AMap && window.AMap.Map) {
        resolve();
        return;
      }
      if (provider === 'osm' && window.L && window.L.map) {
        resolve();
        return;
      }

      if (provider === 'osm') {
        // 加载 Leaflet CSS
        if (!document.querySelector('link[href*="leaflet.css"]')) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
          link.crossOrigin = '';
          document.head.appendChild(link);
        }
        
        // 加载 Leaflet JS
        if (!document.querySelector('script[src*="leaflet"]')) {
          const script = document.createElement('script');
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
          script.crossOrigin = '';
          script.async = true;
          script.onload = () => {
            const checkInterval = setInterval(() => {
              if (window.L && window.L.map) {
                clearInterval(checkInterval);
                resolve();
              }
            }, 100);
            setTimeout(() => {
              clearInterval(checkInterval);
              if (window.L && window.L.map) {
                resolve();
              } else {
                reject(new Error('Leaflet 加载超时'));
              }
            }, 10000);
          };
          script.onerror = () => reject(new Error('Leaflet 脚本加载失败'));
          document.head.appendChild(script);
        } else {
          // 脚本已存在，等待加载
          const checkInterval = setInterval(() => {
            if (window.L && window.L.map) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);
          setTimeout(() => {
            clearInterval(checkInterval);
            if (window.L && window.L.map) {
              resolve();
            } else {
              reject(new Error('Leaflet 加载超时'));
            }
          }, 10000);
        }
        return;
      }

      // 检查是否已有脚本标签（百度/高德）
      const existing = Array.from(document.querySelectorAll('script')).find(
        s => s.src && s.src.includes(provider === 'baidu' ? 'api.map.baidu.com' : 'webapi.amap.com')
      );
      
      if (existing) {
        const checkInterval = setInterval(() => {
          if ((provider === 'baidu' && window.BMapGL && window.BMapGL.Map) ||
              (provider === 'amap' && window.AMap && window.AMap.Map)) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(checkInterval);
          if ((provider === 'baidu' && window.BMapGL && window.BMapGL.Map) ||
              (provider === 'amap' && window.AMap && window.AMap.Map)) {
            resolve();
          } else {
            reject(new Error('地图 API 加载超时'));
          }
        }, 10000);
        return;
      }

      // 创建新脚本（百度/高德）
      const script = document.createElement('script');
      script.src = provider === 'baidu' 
        ? `https://api.map.baidu.com/api?v=1.0&type=webgl&ak=${encodeURIComponent(cfg.map.key)}`
        : `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(cfg.map.key)}`;
      script.async = true;
      script.onload = () => {
        const checkInterval = setInterval(() => {
          if (provider === 'amap' && window.AMap && window.AMap.Map) {
            // 检查是否有高德地图的错误信息（通常在控制台，但我们可以检查一些全局错误）
            clearInterval(checkInterval);
            resolve();
          } else if (provider === 'baidu' && window.BMapGL && window.BMapGL.Map) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(checkInterval);
          if ((provider === 'baidu' && window.BMapGL && window.BMapGL.Map) ||
              (provider === 'amap' && window.AMap && window.AMap.Map)) {
            resolve();
          } else {
            const errorMsg = provider === 'amap'
              ? '高德地图 API 加载超时。可能原因：1) API Key 类型错误（需要"Web端（JS API）"类型）；2) 网络问题；3) Key 未启用或配置错误'
              : '地图 API 加载超时';
            reject(new Error(errorMsg));
          }
        }, 10000);
      };
      script.onerror = () => {
        const errorMsg = provider === 'amap' 
          ? '高德地图脚本加载失败。请检查：1) API Key 是否正确；2) 是否申请了"Web端（JS API）"类型的 Key（不是"Web服务"Key）；3) Key 是否已启用并配置了正确的安全密钥（如设置了域名白名单，请确保当前域名在白名单中）'
          : provider === 'baidu'
          ? '百度地图脚本加载失败。请检查 API Key 是否正确'
          : '地图脚本加载失败';
        reject(new Error(errorMsg));
      };
      document.head.appendChild(script);
    });
  };

  // 初始化地图
  useEffect(() => {
    if (!ref.current) return;
    
    // OSM 不需要 API Key
    if (cfg.map.provider !== 'osm' && !cfg.map.key) {
      setMapReady(false);
      return;
    }

    let isMounted = true;
    let mapInstance = null;
    const effectiveProvider = cfg.map.provider;

    const initMap = async () => {
      try {
        console.log('开始初始化地图，提供商:', effectiveProvider);

        // 确保容器有尺寸
        if (ref.current.offsetWidth === 0 || ref.current.offsetHeight === 0) {
          console.warn('地图容器尺寸为0，等待尺寸设置...');
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (!isMounted || !ref.current) return;

        // 加载地图脚本
        await loadMapScript(effectiveProvider);
        if (!isMounted) return;

        if (effectiveProvider === 'baidu') {
          console.log('百度地图 API 已加载，创建地图实例');
          mapInstance = new window.BMapGL.Map(ref.current);
          const pt = new window.BMapGL.Point(116.397428, 39.90923);
          mapInstance.centerAndZoom(pt, 11);
          mapInstance.enableScrollWheelZoom(true);
        } else if (effectiveProvider === 'amap') {
          console.log('高德地图 API 已加载，创建地图实例');
          try {
            mapInstance = new window.AMap.Map(ref.current, { 
              zoom: 10, 
              center: [116.397428, 39.90923],
              viewMode: '3D'
            });
            // 监听地图错误事件
            mapInstance.on('error', (e) => {
              console.error('高德地图错误:', e);
              if (e && e.message) {
                const errorMsg = e.message;
                if (errorMsg.includes('USERKEY_PLAT_NOMATCH') || errorMsg.includes('INVALID_USER_KEY')) {
                  throw new Error('API Key 类型错误：请确保申请的是"Web端（JS API）"类型的 Key，不是"Web服务"Key');
                } else if (errorMsg.includes('INVALID_USER_SCODE')) {
                  throw new Error('安全密钥验证失败：请检查安全密钥配置');
                } else if (errorMsg.includes('DAILY_QUERY_OVER_LIMIT')) {
                  throw new Error('API 调用次数超限：请检查配额或升级服务');
                }
              }
            });
            
            // 加载必要的插件（用于路线规划）
            if (window.AMap && window.AMap.plugin) {
              const pluginsToLoad = ['AMap.Geocoder', 'AMap.Driving', 'AMap.Walking', 'AMap.Transit'];
              const missingPlugins = pluginsToLoad.filter(pluginName => {
                const parts = pluginName.split('.');
                let obj = window.AMap;
                for (const part of parts) {
                  if (!obj || !obj[part]) return true;
                  obj = obj[part];
                }
                return false;
              });
              
              if (missingPlugins.length > 0) {
                console.log('加载高德地图插件:', missingPlugins);
                window.AMap.plugin(missingPlugins, () => {
                  console.log('高德地图插件加载完成');
                  // 验证插件是否真正加载
                  const allLoaded = missingPlugins.every(pluginName => {
                    const parts = pluginName.split('.');
                    let obj = window.AMap;
                    for (const part of parts) {
                      if (!obj || !obj[part]) return false;
                      obj = obj[part];
                    }
                    return true;
                  });
                  if (allLoaded) {
                    console.log('所有高德地图插件已成功加载');
                  } else {
                    console.warn('部分高德地图插件可能未加载成功:', missingPlugins);
                  }
                });
              } else {
                console.log('所有高德地图插件已存在，无需加载');
              }
            } else {
              console.warn('高德地图 plugin 方法不可用，插件可能已包含在主脚本中或需要手动加载');
            }
          } catch (initError) {
            // 如果创建地图实例时抛出错误，检查是否是key相关错误
            const errorMsg = initError.message || String(initError);
            if (errorMsg.includes('USERKEY') || errorMsg.includes('KEY') || errorMsg.includes('key')) {
              throw new Error('高德地图初始化失败：请检查 API Key 是否正确，并确保申请的是"Web端（JS API）"类型的 Key');
            }
            throw initError;
          }
        } else if (effectiveProvider === 'osm') {
          console.log('OpenStreetMap (Leaflet) 已加载，创建地图实例');
          // 修复 Leaflet 图标路径
          delete window.L.Icon.Default.prototype._getIconUrl;
          window.L.Icon.Default.mergeOptions({
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
          });
          mapInstance = window.L.map(ref.current).setView([39.90923, 116.397428], 10);
          window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
          }).addTo(mapInstance);
        }

        if (!isMounted) {
          // 组件已卸载，清理地图实例
          if (mapInstance) {
            if (effectiveProvider === 'baidu') {
              mapInstance = null;
            } else if (effectiveProvider === 'osm' && window.L) {
              mapInstance.remove();
            } else {
              mapInstance.destroy();
            }
          }
          return;
        }

        mapRef.current = mapInstance;
        setMapReady(true);
        console.log('地图初始化成功');
      } catch (error) {
        console.error('地图初始化失败:', error);
        setMapReady(false);
        // 显示错误提示
        if (ref.current) {
          const errorMsg = error.message || '地图初始化失败';
          ref.current.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 20px; text-align: center; color: var(--muted);">
              <div style="font-size: 16px; margin-bottom: 10px; color: #fca5a5;">⚠️ 地图加载失败</div>
              <div style="font-size: 13px; line-height: 1.6;">${errorMsg}</div>
              ${effectiveProvider === 'amap' ? '<div style="font-size: 12px; margin-top: 10px; color: var(--muted);">提示：高德地图需要申请"Web端（JS API）"类型的 Key，不是"Web服务"Key</div>' : ''}
            </div>
          `;
        }
      }
    };

    initMap();

    return () => {
      isMounted = false;
      clearMarkers();
      clearPolylines();
      if (mapRef.current) {
        if (effectiveProvider === 'baidu') {
          mapRef.current = null;
        } else if (effectiveProvider === 'osm' && window.L) {
          try {
            mapRef.current.remove();
          } catch (e) {
            // 忽略销毁错误
          }
        } else {
          try {
            mapRef.current.destroy();
          } catch (e) {
            // 忽略销毁错误
          }
        }
      }
      mapRef.current = null;
      setMapReady(false);
    };
  }, [cfg.map.key, cfg.map.provider]);

  // 定位到目的地（仅在没有地点时显示，或者作为初始定位）
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    // 如果有有效地点，不单独显示目的地（地点显示会包含目的地）
    if (places && Array.isArray(places) && places.length > 0) return;
    if (!destination) return;
    // OSM 不需要 API Key
    if (cfg.map.provider !== 'osm' && !cfg.map.key) return;

    // 使用 AbortController 来取消旧的请求
    const abortController = new AbortController();
    let isCancelled = false;

    const locateDestination = async () => {
      try {
        console.log('开始定位目的地:', destination);
        const location = await geocode(destination, abortController.signal);
        
        // 检查请求是否已被取消
        if (isCancelled || abortController.signal.aborted) {
          console.log('定位请求已取消（新的请求已发起）');
          return;
        }
        
        console.log('目的地坐标:', location);
        
        if (location && mapRef.current && !isCancelled) {
          // 再次检查是否被取消（双重检查）
          if (abortController.signal.aborted) return;
          
          // 清理旧的标记（如果有）
          clearMarkers();
          
          // 使用实际的地图实例类型，而不是 getEffectiveProvider 的结果
          // 因为地图实例已经根据 cfg.map.provider 初始化，坐标系统应该匹配
          const actualProvider = cfg.map.provider;
          
          if (actualProvider === 'baidu') {
            // 百度地图使用 BD09 坐标系，geocode 返回的坐标应该已经是 BD09
            const pt = new window.BMapGL.Point(location.lng, location.lat);
            mapRef.current.centerAndZoom(pt, 12);
            const marker = new window.BMapGL.Marker(pt);
            mapRef.current.addOverlay(marker);
            const infoWindow = new window.BMapGL.InfoWindow(destination, { width: 200, height: 50 });
            marker.addEventListener('click', () => {
              mapRef.current.openInfoWindow(infoWindow, pt);
            });
            markersRef.current.push(marker);
          } else if (actualProvider === 'osm') {
            // OSM 使用 WGS84 坐标系，geocode 返回的坐标应该已经是 WGS84
            mapRef.current.setView([location.lat, location.lng], 12);
            const marker = window.L.marker([location.lat, location.lng]).addTo(mapRef.current);
            marker.bindPopup(destination);
            markersRef.current.push(marker);
          } else {
            // 高德地图使用 GCJ02 坐标系，geocode 返回的坐标应该已经是 GCJ02
            // 高德地图的 setCenter 接受 [lng, lat] 数组或 AMap.LngLat 对象
            mapRef.current.setCenter([location.lng, location.lat]);
            mapRef.current.setZoom(12);
            const marker = new window.AMap.Marker({
              position: [location.lng, location.lat],
              title: destination
            });
            mapRef.current.add(marker);
            markersRef.current.push(marker);
          }
          console.log('目的地定位成功，使用地图提供商:', actualProvider, '坐标:', location);
        }
      } catch (error) {
        // 如果请求被取消，不显示错误
        if (isCancelled || abortController.signal.aborted) {
          console.log('定位请求已取消');
          return;
        }
        console.error('定位目的地失败:', error);
      }
    };

    locateDestination();

    // 清理函数：取消请求
    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [destination, places, mapReady, cfg.map.key, cfg.map.provider]);

  // 显示地点标记和路线
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    // 如果没有地点，不显示（但会由目的地定位useEffect处理）
    if (!places || !Array.isArray(places) || places.length === 0) return;
    if (
      persistedState &&
      persistedState.signature &&
      restoredSignatureRef.current === persistedState.signature &&
      persistedState.signature === inputSignature
    ) {
      console.log('地图已从快照恢复，跳过重新绘制');
      return;
    }

    // 简易并发控制的 map（promise 并发限制）
    const pMap = async (iterable, mapper, { concurrency = 4, onProgress } = {}) => {
      const results = new Array(iterable.length);
      let inFlight = 0;
      let index = 0;
      let resolved = 0;
      return await new Promise((resolve) => {
        const next = () => {
          if (resolved === iterable.length) {
            resolve(results);
            return;
          }
          while (inFlight < concurrency && index < iterable.length) {
            const currentIndex = index++;
            inFlight++;
            Promise.resolve()
              .then(() => mapper(iterable[currentIndex], currentIndex))
              .then((res) => {
                results[currentIndex] = res;
              })
              .catch(() => {
                results[currentIndex] = undefined;
              })
              .finally(() => {
                inFlight--;
                resolved++;
                if (typeof onProgress === 'function') {
                  onProgress(resolved, iterable.length);
                }
                next();
              });
          }
        };
        next();
      });
    };

    // 批量向地图添加标记，避免主线程长时间阻塞
    const addMarkersInBatches = async (coords, makeMarker, { batchSize = 20 } = {}) => {
      for (let i = 0; i < coords.length; i += batchSize) {
        const batch = coords.slice(i, i + batchSize);
        for (const coord of batch) {
          makeMarker(coord);
        }
        // 让出主线程，提升 UI 响应
        await new Promise((r) => {
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => r());
          } else {
            setTimeout(r, 0);
          }
        });
        setProgress((prev) => ({
          active: true,
          percent: Math.min(95, prev.percent + Math.max(1, Math.round((batch.length / Math.max(1, coords.length)) * 35))),
          message: `正在绘制标记（${Math.min(coords.length, i + batch.length)}/${coords.length}）`
        }));
      }
    };

    const displayPlacesAndRoute = async () => {
      try {
        console.log('开始显示地点和路线，地点数量:', places.length, '路线序列:', routeSequence);
        
        // 清理旧的标记和路线
        clearMarkers();
        clearPolylines();

        // 获取所有地点的坐标
        let placeCoords = [];
        let destCenter = null;
        let destBoundary = null;
        setProgress({ active: true, percent: 3, message: '开始地理编码…' });
        const geocodeResults = await pMap(
          places,
          async (place) => {
            if (place && typeof place.lng === 'number' && typeof place.lat === 'number') {
              return { ...place };
            }
            try {
              const geocodeResult = await geocodeWithAugment(place, destination);
              return { ...place, ...geocodeResult };
            } catch (error) {
              console.warn(`无法获取地点 ${place?.name} 的坐标:`, error);
              return undefined;
            }
          },
          {
            concurrency: 6,
            onProgress: (done, total) => {
              const base = 3;
              const span = 30; // 地理编码阶段权重
              const percent = base + Math.floor((done / Math.max(1, total)) * span);
              setProgress({ active: true, percent, message: `地理编码中（${done}/${total}）…` });
            }
          }
        );
        placeCoords = geocodeResults.filter(Boolean);

        // 坐标去重，避免重复标记覆盖
        placeCoords = dedupeByCoordGrid(placeCoords);

        // 若提供了目的地，优先使用行政区边界过滤；若失败则回退半径过滤
        if (destination) {
          try {
            setProgress((prev) => ({ active: true, percent: Math.max(prev.percent, 36), message: '获取目的地范围…' }));
            const destLoc = await geocode(destination);
            destCenter = destLoc;
            // 尝试获取行政区边界（GeoJSON）
            destBoundary = await getAdministrativeBoundaryGeoJSON(destination);
            const radiusKm = (cfg.map && typeof cfg.map.destinationRadiusKm === 'number')
              ? Math.max(1, cfg.map.destinationRadiusKm)
              : 60;
            const before = placeCoords.length;
            const filterOnce = (coords, useBoundary, radius) => coords.filter(p => {
              if (typeof p.lng !== 'number' || typeof p.lat !== 'number') return false;
              // 优先多边形过滤
              if (useBoundary && destBoundary && destBoundary.geometry) {
                return pointInPolygon(p.lng, p.lat, destBoundary.geometry);
              }
              // 回退：半径过滤
              const d = haversineKm(p.lng, p.lat, destLoc.lng, destLoc.lat);
              return d <= radius;
            });
            // 第一次过滤（严格）
            placeCoords = filterOnce(placeCoords, true, radiusKm);
            let dropped = before - placeCoords.length;
            // 如果丢弃太多（>50%或剩余<2），放宽到半径过滤；半径*2
            if (placeCoords.length < 2 || dropped > before * 0.5) {
              placeCoords = filterOnce(placeCoords, false, radiusKm * 2);
              // 如果仍然过少，最后不做过滤
              if (placeCoords.length < 2) {
                console.warn('范围过滤过于严格，已放宽为不过滤。');
                // 回到不过滤的原始集合（去重后）
                placeCoords = dedupeByCoordGrid(places.map(p => p.lng && p.lat ? { ...p } : null)
                  .filter(Boolean));
              }
            }
            if (dropped > 0) {
              if (destBoundary && destBoundary.geometry) {
                console.warn(`有 ${dropped} 个地点不在目的地行政区边界内，已忽略。`);
              } else {
                console.warn(`有 ${dropped} 个地点超出目的地范围（${radiusKm}km），已忽略。`);
              }
            }
            setProgress((prev) => ({ active: true, percent: Math.max(prev.percent, 42), message: '范围过滤完成' }));
          } catch (e) {
            console.warn('无法定位目的地用于范围过滤，跳过范围限制。', e);
          }
        }

        // 根据坐标确定有效的地图提供商
        const effectiveProvider = getEffectiveProvider(placeCoords);
        
        // 如果检测到需要切换地图，重新初始化地图
        if (effectiveProvider !== cfg.map.provider && effectiveProvider === 'osm') {
          console.log('检测到海外地点，需要切换到 OpenStreetMap');
          // 这里可以触发地图重新初始化，但为了简化，我们继续使用当前地图
          // 实际应用中可能需要更复杂的切换逻辑
        }

        // 计算每个地点属于哪一天（用于不同颜色/图案），基于复合键避免同名冲突
        const keyToDayMap = computePlaceDayIndexMap(placeCoords, routeSequence);
        const snapshotPlaces = placeCoords
          .filter((coord) => coord && typeof coord.lng === 'number' && typeof coord.lat === 'number')
          .map((coord) => {
            const key = compositeKey(coord);
            let dayIndex = keyToDayMap.get(key);
            // 如果 keyToDayMap 中没有，但地点本身有 day 属性，使用它
            if (dayIndex === undefined && coord.day && typeof coord.day === 'number' && coord.day > 0) {
              dayIndex = coord.day - 1; // day 是 1-based，转换为 0-based
            }
            return {
              name: coord.name || '',
              address: coord.address || '',
              lng: coord.lng,
              lat: coord.lat,
              dayIndex: dayIndex ?? null
            };
          });
        const snapshotPolylines = [];

        // 添加标记（按天显示不同颜色或图案）
        setProgress((prev) => ({ active: true, percent: Math.max(prev.percent, 45), message: '开始绘制标记…' }));
        const makeMarker = (coord) => {
          const key = compositeKey(coord);
          let dayIndex = keyToDayMap.get(key);
          // 如果 keyToDayMap 中没有，但地点本身有 day 属性，使用它
          if (dayIndex === undefined && coord.day && typeof coord.day === 'number' && coord.day > 0) {
            dayIndex = coord.day - 1; // day 是 1-based，转换为 0-based
          }
          const markerStyle = dayIndex !== undefined && dayIndex !== null ? getMarkerStyle(dayIndex) : { color: '#999999', pattern: 'solid' };
          const iconUrl = buildSvgDataUrl(markerStyle.color, markerStyle.pattern);

          if (effectiveProvider === 'baidu') {
            const pt = new window.BMapGL.Point(coord.lng, coord.lat);
            const size = new window.BMapGL.Size(28, 28);
            const icon = new window.BMapGL.Icon(iconUrl, size, { imageSize: size });
            const marker = new window.BMapGL.Marker(pt, { icon });
            mapRef.current.addOverlay(marker);
            const infoWindow = new window.BMapGL.InfoWindow(
              `<div style="padding: 8px;"><strong>${coord.name || ''}</strong><br/>${coord.address || ''}</div>`,
              { width: 200, height: 80 }
            );
            marker.addEventListener('click', () => {
              mapRef.current.openInfoWindow(infoWindow, pt);
            });
            markersRef.current.push(marker);
          } else if (effectiveProvider === 'osm' && window.L) {
            const icon = window.L.icon({
              iconUrl,
              iconSize: [28, 28],
              iconAnchor: [14, 26],
              popupAnchor: [0, -24]
            });
            const marker = window.L.marker([coord.lat, coord.lng], { icon }).addTo(mapRef.current);
            marker.bindPopup(`<div style="padding: 8px;"><strong>${coord.name || ''}</strong><br/>${coord.address || ''}</div>`);
            markersRef.current.push(marker);
          } else {
            // 高德：使用自定义 content（HTML）以达到彩色/图案效果
            const markerEl = document.createElement('div');
            markerEl.style.width = '24px';
            markerEl.style.height = '24px';
            markerEl.style.transform = 'translate(-50%, -100%)';
            markerEl.style.backgroundImage = `url("${iconUrl}")`;
            markerEl.style.backgroundSize = 'cover';
            markerEl.style.pointerEvents = 'auto';
            const marker = new window.AMap.Marker({ position: [coord.lng, coord.lat], title: coord.name || '', content: markerEl });
            marker.on('click', () => {
              const infoWindow = new window.AMap.InfoWindow({
                content: `<div style="padding: 8px;"><strong>${coord.name || ''}</strong><br/>${coord.address || ''}</div>`
              });
              infoWindow.open(mapRef.current, [coord.lng, coord.lat]);
            });
            mapRef.current.add(marker);
            markersRef.current.push(marker);
          }
        };
        await addMarkersInBatches(placeCoords, makeMarker, { batchSize: 24 });

        console.log('已获取坐标的地点:', placeCoords.map(p => ({ name: p.name, lng: p.lng, lat: p.lat })));

        // 如果有路线序列，显示路线
        if (routeSequence && routeSequence.length > 0) {
          console.log('开始显示路线序列，天数:', routeSequence.length);
          for (let dayIndex = 0; dayIndex < routeSequence.length; dayIndex++) {
            setProgress({
              active: true,
              percent: Math.min(98, 60 + Math.floor(((dayIndex) / Math.max(1, routeSequence.length)) * 35)),
              message: `规划第 ${dayIndex + 1} 天路线…`
            });
            const dayPlaces = routeSequence[dayIndex];
            if (!dayPlaces || dayPlaces.length < 2) {
              console.log(`第${dayIndex + 1}天地点数量不足，跳过`);
              continue;
            }

            console.log(`第${dayIndex + 1}天地点:`, dayPlaces);

            // 获取当天的地点坐标
            const dayCoords = [];
            const usedIndexThisDay = new Set();
            for (const placeName of dayPlaces) {
              // 优先从已计算的 key->day 映射中选出属于当天的候选，避免跨天混淆
              let placeIdx = -1;
              for (let i = 0; i < placeCoords.length; i++) {
                if (usedIndexThisDay.has(i)) continue;
                const p = placeCoords[i];
                const key = compositeKey(p);
                const mappedDay = keyToDayMap.get(key);
                if (mappedDay === dayIndex && isNameMatch(p?.name, placeName)) {
                  placeIdx = i;
                  break;
                }
              }
              // 回退：使用宽松匹配（无映射或解析新增地点）
              if (placeIdx < 0) {
                placeIdx = placeCoords.findIndex((p, i) => !usedIndexThisDay.has(i) && isNameMatch(p?.name, placeName));
              }
              if (placeIdx >= 0) {
                const place = placeCoords[placeIdx];
                usedIndexThisDay.add(placeIdx);
                dayCoords.push({ lng: place.lng, lat: place.lat });
                console.log(`找到地点 ${placeName} 的坐标:`, place.lng, place.lat, '匹配的地点:', place.name);
              } else {
                console.warn(`未找到地点 ${placeName} 的坐标，已解析的地点:`, placeCoords.map(p => p.name));
                // 尝试直接通过名称进行地理编码
                try {
                  const geocodeResult = await geocodeWithAugment({ name: placeName }, destination);
                  if (geocodeResult && geocodeResult.lng && geocodeResult.lat) {
                    // 如果有目的地中心/边界，过滤超出范围/边界的地理编码结果
                    if (destCenter) {
                      const radiusKm = (cfg.map && typeof cfg.map.destinationRadiusKm === 'number')
                        ? Math.max(1, cfg.map.destinationRadiusKm)
                        : 60;
                      const outOfBoundary =
                        destBoundary && destBoundary.geometry
                          ? !pointInPolygon(geocodeResult.lng, geocodeResult.lat, destBoundary.geometry)
                          : haversineKm(geocodeResult.lng, geocodeResult.lat, destCenter.lng, destCenter.lat) > radiusKm;
                      if (outOfBoundary) {
                        if (destBoundary && destBoundary.geometry) {
                          console.warn(`地点 ${placeName} 不在目的地行政区边界内，忽略。`);
                        } else {
                          console.warn(`地点 ${placeName} 超出目的地范围（${radiusKm}km），忽略。`);
                        }
                        continue;
                      }
                    }
                    dayCoords.push({ lng: geocodeResult.lng, lat: geocodeResult.lat });
                    console.log(`通过地理编码找到地点 ${placeName} 的坐标:`, geocodeResult.lng, geocodeResult.lat);
                  }
                } catch (error) {
                  console.warn(`无法通过地理编码获取地点 ${placeName} 的坐标:`, error);
                }
              }
            }

            if (dayCoords.length < 2) {
              console.log(`第${dayIndex + 1}天有效坐标数量不足 (${dayCoords.length})，跳过路线`);
              continue;
            }

            console.log(`第${dayIndex + 1}天有效坐标数量:`, dayCoords.length);

            // 规划路线
            const effectiveProvider = getEffectiveProvider(dayCoords);
            try {
              const routePoints = await planRoute(dayCoords, routeStrategy);
              console.log(`第${dayIndex + 1}天路线规划成功，路线点数量:`, routePoints.length);
              
              // 规范化路线点，确保格式正确
              const normalizedRoutePoints = ensureArrayLngLat(routePoints);
              if (normalizedRoutePoints.length < 2) {
                console.warn(`第${dayIndex + 1}天路线点数量不足，使用fallback连线`);
                throw new Error('路线点数量不足');
              }
              
              snapshotPolylines.push({
                path: normalizedRoutePoints.map((p) => ({ lng: p.lng, lat: p.lat })),
                strokeColor: getRouteColor(dayIndex),
                strokeWeight: 3,
                strokeOpacity: 0.8,
                strokeStyle: 'solid',
                dayIndex
              });
              
              if (effectiveProvider === 'baidu') {
                const points = normalizedRoutePoints.map(p => new window.BMapGL.Point(p.lng, p.lat));
                const polyline = new window.BMapGL.Polyline(points, {
                  strokeColor: getRouteColor(dayIndex),
                  strokeWeight: 3,
                  strokeOpacity: 0.8
                });
                mapRef.current.addOverlay(polyline);
                polylinesRef.current.push(polyline);
              } else if (effectiveProvider === 'osm' && window.L) {
                const path = normalizedRoutePoints.map(p => [p.lat, p.lng]);
                const polyline = window.L.polyline(path, {
                  color: getRouteColor(dayIndex),
                  weight: 3,
                  opacity: 0.8
                }).addTo(mapRef.current);
                polylinesRef.current.push(polyline);
              } else {
                const path = normalizedRoutePoints.map(p => [p.lng, p.lat]);
                const polyline = new window.AMap.Polyline({
                  path: path,
                  strokeColor: getRouteColor(dayIndex),
                  strokeWeight: 3,
                  strokeOpacity: 0.8,
                  strokeStyle: 'solid'
                });
                mapRef.current.add(polyline);
                polylinesRef.current.push(polyline);
              }
            } catch (error) {
              console.warn(`规划第${dayIndex + 1}天路线失败:`, error);
              // 如果路线规划失败，直接连线
              const fallbackPath = dayCoords.map(c => ({ lng: c.lng, lat: c.lat }));
              snapshotPolylines.push({
                path: fallbackPath,
                strokeColor: getRouteColor(dayIndex),
                strokeWeight: 2,
                strokeOpacity: 0.6,
                strokeStyle: 'solid',
                dayIndex
              });
              if (effectiveProvider === 'baidu') {
                const points = dayCoords.map(c => new window.BMapGL.Point(c.lng, c.lat));
                const polyline = new window.BMapGL.Polyline(points, {
                  strokeColor: getRouteColor(dayIndex),
                  strokeWeight: 2,
                  strokeOpacity: 0.6
                });
                mapRef.current.addOverlay(polyline);
                polylinesRef.current.push(polyline);
              } else if (effectiveProvider === 'osm' && window.L) {
                const path = dayCoords.map(c => [c.lat, c.lng]);
                const polyline = window.L.polyline(path, {
                  color: getRouteColor(dayIndex),
                  weight: 2,
                  opacity: 0.6
                }).addTo(mapRef.current);
                polylinesRef.current.push(polyline);
              } else {
                const path = dayCoords.map(c => [c.lng, c.lat]);
                const polyline = new window.AMap.Polyline({
                  path: path,
                  strokeColor: getRouteColor(dayIndex),
                  strokeWeight: 2,
                  strokeOpacity: 0.6
                });
                mapRef.current.add(polyline);
                polylinesRef.current.push(polyline);
              }
            }
          }
        } else if (placeCoords.length >= 2) {
          // 如果没有路线序列，但有多于一个地点，显示连接线
          console.log('没有路线序列，显示所有地点的连接线');
          setProgress({ active: true, percent: 80, message: '规划整体路线…' });
          const effectiveProvider = getEffectiveProvider(placeCoords);
          try {
            const routePoints = await planRoute(
              placeCoords.map(p => ({ lng: p.lng, lat: p.lat })),
              routeStrategy
            );
            
            // 规范化路线点，确保格式正确
            const normalizedRoutePoints = ensureArrayLngLat(routePoints);
            if (normalizedRoutePoints.length < 2) {
              console.warn('路线点数量不足，使用fallback连线');
              throw new Error('路线点数量不足');
            }
            
            snapshotPolylines.push({
              path: normalizedRoutePoints.map((p) => ({ lng: p.lng, lat: p.lat })),
              strokeColor: '#3388ff',
              strokeWeight: 3,
              strokeOpacity: 0.8,
              strokeStyle: 'solid',
              dayIndex: null
            });
            
            if (effectiveProvider === 'baidu') {
              const points = normalizedRoutePoints.map(p => new window.BMapGL.Point(p.lng, p.lat));
              const polyline = new window.BMapGL.Polyline(points, {
                strokeColor: '#3388ff',
                strokeWeight: 3,
                strokeOpacity: 0.8
              });
              mapRef.current.addOverlay(polyline);
              polylinesRef.current.push(polyline);
            } else if (effectiveProvider === 'osm' && window.L) {
              const path = normalizedRoutePoints.map(p => [p.lat, p.lng]);
              const polyline = window.L.polyline(path, {
                color: '#3388ff',
                weight: 3,
                opacity: 0.8
              }).addTo(mapRef.current);
              polylinesRef.current.push(polyline);
            } else {
              const path = normalizedRoutePoints.map(p => [p.lng, p.lat]);
              const polyline = new window.AMap.Polyline({
                path: path,
                strokeColor: '#3388ff',
                strokeWeight: 3,
                strokeOpacity: 0.8
              });
              mapRef.current.add(polyline);
              polylinesRef.current.push(polyline);
            }
          } catch (error) {
            console.warn('规划路线失败:', error);
            // 回退：直接连线所有地点
            const effectiveProviderFallback = getEffectiveProvider(placeCoords);
            const fallbackPath = placeCoords.map(p => ({ lng: p.lng, lat: p.lat }));
            snapshotPolylines.push({
              path: fallbackPath,
              strokeColor: '#3388ff',
              strokeWeight: 2,
              strokeOpacity: 0.6,
              strokeStyle: 'solid',
              dayIndex: null
            });
            if (effectiveProviderFallback === 'baidu') {
              const points = placeCoords.map(p => new window.BMapGL.Point(p.lng, p.lat));
              const polyline = new window.BMapGL.Polyline(points, {
                strokeColor: '#3388ff',
                strokeWeight: 2,
                strokeOpacity: 0.6
              });
              mapRef.current.addOverlay(polyline);
              polylinesRef.current.push(polyline);
            } else if (effectiveProviderFallback === 'osm' && window.L) {
              const path = placeCoords.map(p => [p.lat, p.lng]);
              const polyline = window.L.polyline(path, {
                color: '#3388ff',
                weight: 2,
                opacity: 0.6
              }).addTo(mapRef.current);
              polylinesRef.current.push(polyline);
            } else {
              const path = placeCoords.map(p => [p.lng, p.lat]);
              const polyline = new window.AMap.Polyline({
                path: path,
                strokeColor: '#3388ff',
                strokeWeight: 2,
                strokeOpacity: 0.6
              });
              mapRef.current.add(polyline);
              polylinesRef.current.push(polyline);
            }
          }
        }

        // 调整地图视野以包含所有地点
        if (placeCoords.length > 0 && mapRef.current) {
          console.log('调整地图视野，包含', placeCoords.length, '个地点');
          setProgress((prev) => ({ active: true, percent: Math.max(prev.percent, 96), message: '调整视野…' }));
          adjustMapView(placeCoords);
        } else {
          console.warn('没有有效的地点坐标，无法调整地图视野');
        }
        persistSnapshot({
          provider: effectiveProvider,
          places: snapshotPlaces,
          polylines: snapshotPolylines,
          viewportCoords: snapshotPlaces.map(({ lng, lat }) => ({ lng, lat }))
        });
        setProgress({ active: false, percent: 100, message: '' });
      } catch (error) {
        console.error('显示地点和路线失败:', error);
        setProgress({ active: false, percent: 0, message: '' });
      }
    };

    displayPlacesAndRoute();
  }, [places, routeSequence, routeStrategy, mapReady, cfg.map.key, cfg.map.provider, persistedState, inputSignature]);

  // 调整地图视野
  const adjustMapView = (coords) => {
    if (!mapRef.current || !coords || coords.length === 0) {
      console.warn('调整地图视野：参数无效', { coords, length: coords?.length });
      return;
    }

    try {
      // 过滤掉无效的坐标
      const validCoords = coords.filter(c => c && typeof c.lng === 'number' && typeof c.lat === 'number' && !isNaN(c.lng) && !isNaN(c.lat));
      if (validCoords.length === 0) {
        console.warn('调整地图视野：没有有效的坐标');
        return;
      }

      const effectiveProvider = getEffectiveProvider(validCoords);

      if (effectiveProvider === 'baidu') {
        const points = validCoords.map(c => new window.BMapGL.Point(c.lng, c.lat));
        const viewport = mapRef.current.getViewport(points);
        if (viewport && viewport.center) {
          mapRef.current.centerAndZoom(viewport.center, viewport.zoom);
          console.log('地图视野已调整（百度地图）:', viewport.center, 'zoom:', viewport.zoom);
        }
      } else if (effectiveProvider === 'osm' && window.L) {
        const bounds = window.L.latLngBounds(validCoords.map(c => [c.lat, c.lng]));
        mapRef.current.fitBounds(bounds, { padding: [20, 20] });
        console.log('地图视野已调整（OpenStreetMap），包含', validCoords.length, '个地点');
      } else {
        const bounds = new window.AMap.Bounds();
        validCoords.forEach(c => {
          bounds.extend([c.lng, c.lat]);
        });
        mapRef.current.setBounds(bounds, false, [20, 20, 20, 20]); // 添加边距
        console.log('地图视野已调整（高德地图），包含', validCoords.length, '个地点');
      }
    } catch (error) {
      console.warn('调整地图视野失败:', error);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <div ref={ref} className="map" style={{ width: '100%', height: '420px', minHeight: '420px' }} />
      {progress.active && (
        <div
          style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            zIndex: 999,
            pointerEvents: 'none',
            background: 'rgba(0,0,0,0.55)',
            color: '#fff',
            padding: '8px 10px',
            borderRadius: 6,
            fontSize: 12,
            minWidth: 160,
            maxWidth: '60%'
          }}
        >
          <div style={{ marginBottom: 6 }}>{progress.message || '处理中…'}</div>
          <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.25)', borderRadius: 4 }}>
            <div
              style={{
                width: `${Math.max(5, Math.min(100, Math.floor(progress.percent || 0)))}%`,
                height: '100%',
                background: '#22c55e',
                borderRadius: 4,
                transition: 'width 180ms ease'
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

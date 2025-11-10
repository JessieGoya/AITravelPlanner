import { useEffect, useRef, useState } from 'react';
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
export default function MapView({ destination, places = [], routeSequence = [], routeStrategy = 'driving' }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const polylinesRef = useRef([]);
  const [mapReady, setMapReady] = useState(false);
  const cfg = getRuntimeConfig();

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

  // 规范化名称：去空格、转小写、去常见标点与括号内容、去常见后缀
  const normalizeName = (name) => {
    const suffixes = ['景点', '景区', '公园', '博物馆', '纪念馆', '寺', '庙', '塔', '广场', '大街', '路', '酒店', '餐厅', '饭店'];
    const strip = (s) => suffixes.reduce((acc, suf) => acc.replace(new RegExp(suf, 'g'), ''), s);
    return strip(
      (name || '')
        .toLowerCase()
        .replace(/\(.*?\)|（.*?）/g, '') // 去括号内容
        .replace(/[·\.\-_,，。/\\\s]+/g, '') // 去标点与空白
        .trim()
    );
  };

  // 名称匹配：与路线匹配时用到，与下方路线匹配逻辑保持一致
  const isNameMatch = (a, b) => {
    const na = (a || '').trim();
    const nb = (b || '').trim();
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (na.includes(nb) || nb.includes(na)) return true;
    const sa = normalizeName(na);
    const sb = normalizeName(nb);
    return !!sa && !!sb && (sa === sb || sa.includes(sb) || sb.includes(sa));
  };

  // 根据 routeSequence 计算每个地点的 dayIndex，返回 Map<规范化名称, dayIndex>
  const computePlaceDayIndexMap = (allPlaces, sequence) => {
    const map = new Map();
    if (!sequence || sequence.length === 0) return map;
    for (let dayIndex = 0; dayIndex < sequence.length; dayIndex++) {
      const dayPlaces = sequence[dayIndex] || [];
      for (const targetName of dayPlaces) {
        // 找到与 allPlaces 中匹配的条目，把其 name 作为 key
        const found = (allPlaces || []).find(p => isNameMatch(p.name, targetName));
        if (found && found.name && !map.has(found.name)) {
          map.set(found.name, dayIndex);
        }
      }
    }
    return map;
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
    // 如果用户明确选择了 OSM，使用 OSM
    if (cfg.map.provider === 'osm') {
      return 'osm';
    }
    
    // 如果有坐标，检查是否都在中国境内
    if (coords && coords.length > 0) {
      const allInChina = coords.every(c => c && c.lng && c.lat && isInChina(c.lng, c.lat));
      // 如果有海外地点，自动切换到 OSM
      if (!allInChina && cfg.map.provider !== 'osm') {
        console.log('检测到海外地点，自动切换到 OpenStreetMap 以获得更好的显示效果');
        return 'osm';
      }
    }
    
    return cfg.map.provider;
  };

  // 清理标记
  const clearMarkers = () => {
    if (!mapRef.current) return;
    markersRef.current.forEach(marker => {
      try {
        if (window.L && marker.remove) {
          // Leaflet 标记
          mapRef.current.removeLayer(marker);
        } else if (cfg.map.provider === 'baidu') {
          mapRef.current.removeOverlay(marker);
        } else {
          mapRef.current.remove(marker);
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
    polylinesRef.current.forEach(polyline => {
      try {
        if (window.L && polyline.remove) {
          // Leaflet 路线
          mapRef.current.removeLayer(polyline);
        } else if (cfg.map.provider === 'baidu') {
          mapRef.current.removeOverlay(polyline);
        } else {
          mapRef.current.remove(polyline);
        }
      } catch (e) {
        // 忽略清理错误
      }
    });
    polylinesRef.current = [];
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
      };
      script.onerror = () => reject(new Error('地图脚本加载失败'));
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
          mapInstance = new window.AMap.Map(ref.current, { 
            zoom: 10, 
            center: [116.397428, 39.90923],
            viewMode: '3D'
          });
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

    const locateDestination = async () => {
      try {
        console.log('开始定位目的地:', destination);
        const location = await geocode(destination);
        console.log('目的地坐标:', location);
        
        if (location && mapRef.current) {
          // 清理旧的标记（如果有）
          clearMarkers();
          
          const effectiveProvider = getEffectiveProvider([location]);
          
          if (effectiveProvider === 'baidu') {
            const pt = new window.BMapGL.Point(location.lng, location.lat);
            mapRef.current.centerAndZoom(pt, 12);
            const marker = new window.BMapGL.Marker(pt);
            mapRef.current.addOverlay(marker);
            const infoWindow = new window.BMapGL.InfoWindow(destination, { width: 200, height: 50 });
            marker.addEventListener('click', () => {
              mapRef.current.openInfoWindow(infoWindow, pt);
            });
            markersRef.current.push(marker);
          } else if (effectiveProvider === 'osm') {
            mapRef.current.setView([location.lat, location.lng], 12);
            const marker = window.L.marker([location.lat, location.lng]).addTo(mapRef.current);
            marker.bindPopup(destination);
            markersRef.current.push(marker);
          } else {
            mapRef.current.setCenter([location.lng, location.lat]);
            mapRef.current.setZoom(12);
            const marker = new window.AMap.Marker({
              position: [location.lng, location.lat],
              title: destination
            });
            mapRef.current.add(marker);
            markersRef.current.push(marker);
          }
          console.log('目的地定位成功');
        }
      } catch (error) {
        console.error('定位目的地失败:', error);
      }
    };

    locateDestination();
  }, [destination, places, mapReady, cfg.map.key, cfg.map.provider]);

  // 显示地点标记和路线
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    // 如果没有地点，不显示（但会由目的地定位useEffect处理）
    if (!places || !Array.isArray(places) || places.length === 0) return;

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
        for (const place of places) {
          let coord;
          if (place.lng && place.lat) {
            coord = { ...place, lng: place.lng, lat: place.lat };
          } else {
            try {
              const geocodeResult = await geocodeWithAugment(place, destination);
              coord = { ...place, ...geocodeResult };
            } catch (error) {
              console.warn(`无法获取地点 ${place.name} 的坐标:`, error);
              continue;
            }
          }
          placeCoords.push(coord);
        }

        // 坐标去重，避免重复标记覆盖
        placeCoords = dedupeByCoordGrid(placeCoords);

        // 若提供了目的地，优先使用行政区边界过滤；若失败则回退半径过滤
        if (destination) {
          try {
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

        // 计算每个地点属于哪一天（用于不同颜色/图案）
        const nameToDayMap = computePlaceDayIndexMap(placeCoords, routeSequence);

        // 添加标记（按天显示不同颜色或图案）
        for (const coord of placeCoords) {
          const dayIndex = nameToDayMap.has(coord.name) ? nameToDayMap.get(coord.name) : undefined;
          const markerStyle = dayIndex !== undefined ? getMarkerStyle(dayIndex) : { color: '#3388ff', pattern: 'solid' };
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
        }

        console.log('已获取坐标的地点:', placeCoords.map(p => ({ name: p.name, lng: p.lng, lat: p.lat })));

        // 如果有路线序列，显示路线
        if (routeSequence && routeSequence.length > 0) {
          console.log('开始显示路线序列，天数:', routeSequence.length);
          for (let dayIndex = 0; dayIndex < routeSequence.length; dayIndex++) {
            const dayPlaces = routeSequence[dayIndex];
            if (!dayPlaces || dayPlaces.length < 2) {
              console.log(`第${dayIndex + 1}天地点数量不足，跳过`);
              continue;
            }

            console.log(`第${dayIndex + 1}天地点:`, dayPlaces);

            // 获取当天的地点坐标
            const dayCoords = [];
            for (const placeName of dayPlaces) {
              // 从已获取坐标的地点中查找匹配的地点
              const place = placeCoords.find(p => {
                // 支持多种匹配方式，因为名称可能不完全一致
                const normalizedName = (p.name || '').trim();
                const normalizedPlaceName = (placeName || '').trim();
                
                // 完全匹配
                if (normalizedName === normalizedPlaceName) return true;
                
                // 包含匹配（双向）
                if (normalizedName.includes(normalizedPlaceName) || normalizedPlaceName.includes(normalizedName)) return true;
                
                // 去除常见后缀后匹配（如"景点"、"公园"等）
                const suffixes = ['景点', '景区', '公园', '博物馆', '纪念馆', '寺', '庙', '塔', '广场', '大街', '路', '酒店', '餐厅', '饭店'];
                const nameWithoutSuffix = suffixes.reduce((name, suffix) => name.replace(suffix, ''), normalizedName);
                const placeNameWithoutSuffix = suffixes.reduce((name, suffix) => name.replace(suffix, ''), normalizedPlaceName);
                if (nameWithoutSuffix === placeNameWithoutSuffix || 
                    nameWithoutSuffix.includes(placeNameWithoutSuffix) || 
                    placeNameWithoutSuffix.includes(nameWithoutSuffix)) {
                  return true;
                }
                
                return false;
              });
              if (place) {
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
              
              if (effectiveProvider === 'baidu') {
                const points = routePoints.map(p => new window.BMapGL.Point(p.lng, p.lat));
                const polyline = new window.BMapGL.Polyline(points, {
                  strokeColor: getRouteColor(dayIndex),
                  strokeWeight: 3,
                  strokeOpacity: 0.8
                });
                mapRef.current.addOverlay(polyline);
                polylinesRef.current.push(polyline);
              } else if (effectiveProvider === 'osm' && window.L) {
                const path = routePoints.map(p => [p.lat, p.lng]);
                const polyline = window.L.polyline(path, {
                  color: getRouteColor(dayIndex),
                  weight: 3,
                  opacity: 0.8
                }).addTo(mapRef.current);
                polylinesRef.current.push(polyline);
              } else {
                const path = routePoints.map(p => [p.lng, p.lat]);
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
          const effectiveProvider = getEffectiveProvider(placeCoords);
          try {
            const routePoints = await planRoute(
              placeCoords.map(p => ({ lng: p.lng, lat: p.lat })),
              routeStrategy
            );
            
            if (effectiveProvider === 'baidu') {
              const points = routePoints.map(p => new window.BMapGL.Point(p.lng, p.lat));
              const polyline = new window.BMapGL.Polyline(points, {
                strokeColor: '#3388ff',
                strokeWeight: 3,
                strokeOpacity: 0.8
              });
              mapRef.current.addOverlay(polyline);
              polylinesRef.current.push(polyline);
            } else if (effectiveProvider === 'osm' && window.L) {
              const path = routePoints.map(p => [p.lat, p.lng]);
              const polyline = window.L.polyline(path, {
                color: '#3388ff',
                weight: 3,
                opacity: 0.8
              }).addTo(mapRef.current);
              polylinesRef.current.push(polyline);
            } else {
              const path = routePoints.map(p => [p.lng, p.lat]);
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
          adjustMapView(placeCoords);
        } else {
          console.warn('没有有效的地点坐标，无法调整地图视野');
        }
      } catch (error) {
        console.error('显示地点和路线失败:', error);
      }
    };

    displayPlacesAndRoute();
  }, [places, routeSequence, routeStrategy, mapReady, cfg.map.key, cfg.map.provider]);

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

  return <div ref={ref} className="map" style={{ width: '100%', height: '420px', minHeight: '420px' }} />;
}

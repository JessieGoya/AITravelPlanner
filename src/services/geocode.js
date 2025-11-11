import { getRuntimeConfig } from './config';

/**
 * 地理编码：将地址转换为坐标
 * @param {string} address - 地址字符串
 * @returns {Promise<{lng: number, lat: number, address: string}>} 坐标和地址信息
 */
export async function geocode(address) {
  if (!address || !address.trim()) {
    throw new Error('地址不能为空');
  }

  const cfg = getRuntimeConfig();
  // OSM 不需要 Key
  if (cfg.map.provider !== 'osm' && !cfg.map.key) {
    throw new Error('未配置地图 API Key');
  }

  try {
    if (cfg.map.provider === 'osm') {
      return await geocodeOsm(address);
    } else if (cfg.map.provider === 'baidu') {
      return await geocodeBaidu(address, cfg.map.key);
    } else {
      return await geocodeAmap(address, cfg.map.key);
    }
  } catch (error) {
    console.error('地理编码失败:', error);
    throw error;
  }
}

/**
 * OpenStreetMap Nominatim 地理编码
 * 无需 Key，注意频率限制（前端使用请控制请求并添加合适的 UA）
 */
async function geocodeOsm(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`;
  const response = await fetch(url, {
    headers: {
      // 一些 Nominatim 实例要求设置 UA；浏览器 UA 已有，这里补一个名称
      'Accept': 'application/json'
    }
  });
  const data = await response.json();

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('未找到地址');
  }

  const item = data[0];
  return {
    lng: parseFloat(item.lon),
    lat: parseFloat(item.lat),
    address: item.display_name || address
  };
}

/**
 * 高德地图地理编码 - 使用 JS API（避免 USERKEY_PLAT_NOMATCH 错误）
 */
async function geocodeAmap(address, key) {
  // 等待高德地图 JS API 加载完成
  await waitForAmap(key);
  
  return new Promise((resolve, reject) => {
    if (!window.AMap || !window.AMap.Geocoder) {
      reject(new Error('高德地图 JS API 未加载'));
      return;
    }

    const geocoder = new window.AMap.Geocoder({
      city: '全国' // 全国范围搜索
    });

    geocoder.getLocation(address, (status, result) => {
      if (status === 'complete' && result.geocodes && result.geocodes.length > 0) {
        const geocode = result.geocodes[0];
        resolve({
          lng: geocode.location.lng,
          lat: geocode.location.lat,
          address: geocode.formattedAddress || address
        });
      } else {
        reject(new Error(`地理编码失败: ${result.info || '未找到地址'}`));
      }
    });
  });
}

/**
 * 等待高德地图 JS API 加载完成
 * 高德地图 2.0 版本中，Geocoder、Driving 等类需要作为插件加载
 */
function waitForAmap(key) {
  return new Promise((resolve, reject) => {
    const TIMEOUT = 60000; // 60秒超时
    const CHECK_INTERVAL = 100; // 检查间隔100ms
    const startTime = Date.now();
    
    // 如果所需服务都已加载，直接返回
    if (window.AMap && window.AMap.Geocoder && window.AMap.Driving && window.AMap.Walking && window.AMap.Transit) {
      resolve();
      return;
    }

    // 加载基础 API 和插件
    const ensureBaseAPI = () => {
      return new Promise((resolveBase, rejectBase) => {
        // 如果基础 API 已加载
        if (window.AMap && window.AMap.Map) {
          resolveBase();
          return;
        }

        // 检查脚本是否已加载（可能由 MapView 组件加载）
        const existing = Array.from(document.querySelectorAll('script')).find(
          s => s.src && s.src.includes('webapi.amap.com')
        );

        if (existing) {
          // 脚本已存在，等待 API 加载
          let attempts = 0;
          const maxAttempts = 300; // 最多等待30秒
          
          const checkInterval = setInterval(() => {
            attempts++;
            
            if (window.AMap && window.AMap.Map) {
              clearInterval(checkInterval);
              resolveBase();
              return;
            }
            
            if (attempts >= maxAttempts || Date.now() - startTime > TIMEOUT) {
              clearInterval(checkInterval);
              if (window.AMap && window.AMap.Map) {
                resolveBase();
              } else {
                rejectBase(new Error('高德地图基础 API 加载超时'));
              }
            }
          }, CHECK_INTERVAL);
          
          return;
        }

        // 脚本不存在，需要加载
        if (!key) {
          rejectBase(new Error('高德地图 API Key 未配置'));
          return;
        }

        const script = document.createElement('script');
        script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
        script.async = true;
        
        let checkInterval = null;
        let attempts = 0;
        const maxAttempts = 300;
        
        script.onload = () => {
          // 脚本加载完成，等待 API 初始化
          checkInterval = setInterval(() => {
            attempts++;
            
            if (window.AMap && window.AMap.Map) {
              if (checkInterval) clearInterval(checkInterval);
              resolveBase();
              return;
            }
            
            if (attempts >= maxAttempts || Date.now() - startTime > TIMEOUT) {
              if (checkInterval) clearInterval(checkInterval);
              if (window.AMap && window.AMap.Map) {
                resolveBase();
              } else {
                rejectBase(new Error('高德地图脚本加载完成但 API 未初始化'));
              }
            }
          }, CHECK_INTERVAL);
        };
        
        script.onerror = () => {
          if (checkInterval) clearInterval(checkInterval);
          rejectBase(new Error('高德地图脚本加载失败，请检查网络连接和 API Key'));
        };
        
        document.head.appendChild(script);
      });
    };

    // 加载必要的插件
    const loadPlugins = () => {
      return new Promise((resolvePlugins) => {
        if (!window.AMap) {
          resolvePlugins(); // 如果基础 API 未加载，直接返回（会在后续检查中失败）
          return;
        }

        // 检查需要加载的插件
        const pluginsToLoad = [];
        if (!window.AMap.Geocoder) {
          pluginsToLoad.push('AMap.Geocoder');
        }
        if (!window.AMap.Driving) {
          pluginsToLoad.push('AMap.Driving');
        }
        if (!window.AMap.Walking) {
          pluginsToLoad.push('AMap.Walking');
        }
        if (!window.AMap.Transit) {
          pluginsToLoad.push('AMap.Transit');
        }

        if (pluginsToLoad.length === 0) {
          resolvePlugins();
          return;
        }

        // 设置超时，防止 Promise 永远不 resolve
        const pluginTimeout = setTimeout(() => {
          console.warn('高德地图插件加载超时，但继续尝试使用');
          resolvePlugins();
        }, 10000);

        // 使用 AMap.plugin 加载插件
        if (window.AMap.plugin) {
          try {
            let callbackCalled = false;
            let pluginLoadResolved = false;
            
            window.AMap.plugin(pluginsToLoad, () => {
              callbackCalled = true;
              if (pluginLoadResolved) return; // 防止重复resolve
              
              // 插件加载回调，等待插件真正可用
              let attempts = 0;
              const maxAttempts = 100; // 最多等待10秒
              
              const checkPlugins = setInterval(() => {
                attempts++;
                
                const allLoaded = pluginsToLoad.every(pluginName => {
                  const parts = pluginName.split('.');
                  let obj = window.AMap;
                  for (const part of parts) {
                    if (!obj || !obj[part]) return false;
                    obj = obj[part];
                  }
                  return true;
                });

                if (allLoaded) {
                  clearInterval(checkPlugins);
                  clearTimeout(pluginTimeout);
                  pluginLoadResolved = true;
                  console.log('高德地图插件加载成功:', pluginsToLoad);
                  resolvePlugins();
                } else if (attempts >= maxAttempts || Date.now() - startTime > TIMEOUT) {
                  clearInterval(checkPlugins);
                  clearTimeout(pluginTimeout);
                  pluginLoadResolved = true;
                  console.warn('高德地图插件加载超时，但继续尝试使用');
                  resolvePlugins();
                }
              }, CHECK_INTERVAL);
            });
            
            // 如果插件已经加载，回调可能不会立即调用，检查一下
            setTimeout(() => {
              if (!callbackCalled && !pluginLoadResolved) {
                const allLoaded = pluginsToLoad.every(pluginName => {
                  const parts = pluginName.split('.');
                  let obj = window.AMap;
                  for (const part of parts) {
                    if (!obj || !obj[part]) return false;
                    obj = obj[part];
                  }
                  return true;
                });
                
                if (allLoaded) {
                  clearTimeout(pluginTimeout);
                  pluginLoadResolved = true;
                  console.log('高德地图插件已存在:', pluginsToLoad);
                  resolvePlugins();
                }
              }
            }, 500);
          } catch (error) {
            clearTimeout(pluginTimeout);
            console.warn('加载高德地图插件时出错:', error);
            // 即使出错也继续，可能插件已经可用
            setTimeout(() => {
              resolvePlugins();
            }, 500);
          }
        } else {
          clearTimeout(pluginTimeout);
          // 如果没有 plugin 方法，可能是旧版本 API 或插件已包含在主脚本中
          // 等待一段时间让插件加载
          console.warn('高德地图 plugin 方法不可用，等待插件自动加载');
          setTimeout(() => {
            resolvePlugins();
          }, 1000);
        }
      });
    };

    // 执行加载流程
    ensureBaseAPI()
      .then(() => {
        if (Date.now() - startTime > TIMEOUT) {
          reject(new Error('高德地图 JS API 加载超时'));
          return;
        }
        return loadPlugins();
      })
      .then(() => {
        // 最终检查
        if (Date.now() - startTime > TIMEOUT) {
          reject(new Error('高德地图 JS API 加载超时'));
          return;
        }
        
        if (window.AMap && window.AMap.Geocoder) {
          resolve();
        } else if (window.AMap) {
          // 如果基础 API 已加载但插件未加载，仍然尝试使用
          console.warn('高德地图插件可能未完全加载，但继续尝试使用');
          resolve();
        } else {
          reject(new Error('高德地图 JS API 加载超时'));
        }
      })
      .catch((error) => {
        reject(error);
      });
  });
}

/**
 * 百度地图地理编码
 */
async function geocodeBaidu(address, key) {
  const url = `https://api.map.baidu.com/geocoding/v3/?address=${encodeURIComponent(address)}&output=json&ak=${encodeURIComponent(key)}`;
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.status !== 0 || !data.result || !data.result.location) {
    throw new Error(`地理编码失败: ${data.message || '未找到地址'}`);
  }

  return {
    lng: data.result.location.lng,
    lat: data.result.location.lat,
    address: data.result.formatted_address || address
  };
}

/**
 * 路径规划：计算两点之间的路线
 * @param {Array<{lng: number, lat: number}>} points - 路线点数组
 * @param {string} strategy - 路线策略（driving: 驾车, walking: 步行, transit: 公交）
 * @returns {Promise<Array<{lng: number, lat: number}>>} 路线坐标点数组
 */
export async function planRoute(points, strategy = 'driving') {
  if (!points || points.length < 2) {
    throw new Error('至少需要两个点才能规划路线');
  }

  const cfg = getRuntimeConfig();
  // OSM 不依赖第三方路线服务时不需要 Key
  if (cfg.map.provider !== 'osm' && !cfg.map.key) {
    throw new Error('未配置地图 API Key');
  }

  try {
    if (cfg.map.provider === 'osm') {
      // OSM 模式下默认使用“按点顺序连线”的简易路径
      return points;
    } else if (cfg.map.provider === 'baidu') {
      return await planRouteBaidu(points, strategy, cfg.map.key);
    } else {
      return await planRouteAmap(points, strategy, cfg.map.key);
    }
  } catch (error) {
    console.error('路径规划失败:', error);
    throw error;
  }
}

/**
 * 高德地图路径规划 - 使用 JS API（避免 USERKEY_PLAT_NOMATCH 错误）
 */
async function planRouteAmap(points, strategy, key) {
  // 等待高德地图 JS API 加载完成
  await waitForAmap(key);
  
  return new Promise((resolve, reject) => {
    if (!window.AMap) {
      reject(new Error('高德地图 JS API 未加载'));
      return;
    }

    const origin = [points[0].lng, points[0].lat];
    const destination = [points[points.length - 1].lng, points[points.length - 1].lat];
    const waypoints = points.length > 2 ? points.slice(1, -1).map(p => [p.lng, p.lat]) : [];

    // 如果只有一个点，直接返回
    if (points.length < 2) {
      resolve(points);
      return;
    }

    // 检查必要的插件是否已加载
    let routeService;
    try {
      if (strategy === 'walking') {
        if (!window.AMap.Walking) {
          throw new Error('高德地图 Walking 插件未加载。请确保使用的是"Web端（JS API）"类型的 Key，并且插件已正确加载。');
        }
        routeService = new window.AMap.Walking({
          map: null
        });
      } else if (strategy === 'transit') {
        if (!window.AMap.Transit) {
          throw new Error('高德地图 Transit 插件未加载。请确保使用的是"Web端（JS API）"类型的 Key，并且插件已正确加载。');
        }
        routeService = new window.AMap.Transit({
          map: null,
          city: '全国'
        });
      } else {
        // 驾车路线
        if (!window.AMap.Driving) {
          throw new Error('高德地图 Driving 插件未加载。请确保使用的是"Web端（JS API）"类型的 Key，并且插件已正确加载。');
        }
        routeService = new window.AMap.Driving({
          map: null,
          strategy: window.AMap.Driving.LEAST_TIME // 速度优先
        });
      }
    } catch (pluginError) {
      console.error('路线规划插件错误:', pluginError);
      reject(pluginError);
      return;
    }

    // 处理途经点：如果有途经点，需要分段规划
    const planRouteSegment = (start, end, waypointsList) => {
      return new Promise((resolveSegment) => {
        if (waypointsList.length === 0) {
          // 没有途经点，直接规划
          routeService.search(start, end, (status, result) => {
            if (status === 'complete' && result.routes && result.routes.length > 0) {
              const route = result.routes[0];
              const routePoints = extractRoutePoints(route);
              resolveSegment(routePoints.length > 0 ? routePoints : [start, end]);
            } else {
              // 规划失败，直接连线
              resolveSegment([start, end]);
            }
          });
        } else {
          // 有途经点，分段规划
          const allSegments = [];
          let currentStart = start;
          
          const planNext = (index) => {
            if (index >= waypointsList.length) {
              // 最后一段：当前起点到终点
              routeService.search(currentStart, end, (status, result) => {
                if (status === 'complete' && result.routes && result.routes.length > 0) {
                  const route = result.routes[0];
                  const routePoints = extractRoutePoints(route);
                  allSegments.push(routePoints.length > 0 ? routePoints : [currentStart, end]);
                } else {
                  allSegments.push([currentStart, end]);
                }
                // 合并所有段
                const merged = [];
                allSegments.forEach((segment, i) => {
                  if (i > 0) {
                    // 去除重复的起点（与上一段的终点相同）
                    merged.push(...segment.slice(1));
                  } else {
                    merged.push(...segment);
                  }
                });
                resolveSegment(merged);
              });
            } else {
              // 规划到下一个途经点
              const waypoint = waypointsList[index];
              routeService.search(currentStart, waypoint, (status, result) => {
                if (status === 'complete' && result.routes && result.routes.length > 0) {
                  const route = result.routes[0];
                  const routePoints = extractRoutePoints(route);
                  allSegments.push(routePoints.length > 0 ? routePoints : [currentStart, waypoint]);
                } else {
                  allSegments.push([currentStart, waypoint]);
                }
                currentStart = waypoint;
                planNext(index + 1);
              });
            }
          };
          
          planNext(0);
        }
      });
    };

    // 提取路径坐标点
    const extractRoutePoints = (route) => {
      const routePoints = [];
      
      if (route.steps && Array.isArray(route.steps)) {
        route.steps.forEach(step => {
          if (step.path && Array.isArray(step.path)) {
            step.path.forEach(point => {
              if (point && typeof point.lng === 'number' && typeof point.lat === 'number') {
                routePoints.push({ lng: point.lng, lat: point.lat });
              } else if (Array.isArray(point) && point.length >= 2) {
                routePoints.push({ lng: point[0], lat: point[1] });
              }
            });
          }
        });
      }
      
      return routePoints;
    };

    planRouteSegment(origin, destination, waypoints).then(routePoints => {
      // 转换为统一格式
      const formattedPoints = routePoints.map(p => {
        if (Array.isArray(p)) {
          return { lng: p[0], lat: p[1] };
        }
        return p;
      });
      resolve(formattedPoints.length > 0 ? formattedPoints : points);
    }).catch(error => {
      console.warn('路径规划失败，使用直接连线:', error);
      const allPoints = [origin, ...waypoints, destination];
      resolve(allPoints.map(p => ({ lng: p[0], lat: p[1] })));
    });
  });
}

/**
 * 百度地图路径规划
 */
async function planRouteBaidu(points, strategy, key) {
  // 将策略转换为百度地图的路线类型
  const baiduTactics = {
    driving: '11', // 最短时间
    walking: 'walking',
    transit: 'transit'
  }[strategy] || '11';

  const origin = `${points[0].lat},${points[0].lng}`;
  const destination = `${points[points.length - 1].lat},${points[points.length - 1].lng}`;
  
  let url = '';
  if (strategy === 'transit') {
    url = `https://api.map.baidu.com/direction/v2/transit?origin=${origin}&destination=${destination}&ak=${encodeURIComponent(key)}`;
  } else if (strategy === 'walking') {
    url = `https://api.map.baidu.com/direction/v2/walking?origin=${origin}&destination=${destination}&ak=${encodeURIComponent(key)}`;
  } else {
    url = `https://api.map.baidu.com/direction/v2/driving?origin=${origin}&destination=${destination}&tactics=${baiduTactics}&ak=${encodeURIComponent(key)}`;
  }

  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== 0 || !data.result || !data.result.routes || data.result.routes.length === 0) {
    throw new Error(`路径规划失败: ${data.message || '无法规划路线'}`);
  }

  // 解析路径坐标点（百度地图返回的是加密坐标，需要转换为普通坐标）
  const route = data.result.routes[0];
  const routePoints = [];

  if (route.steps) {
    route.steps.forEach(step => {
      if (step.path) {
        // 百度地图返回的是加密坐标字符串，需要解码
        const coords = decodePolyline(step.path);
        routePoints.push(...coords);
      }
    });
  }

  return routePoints.length > 0 ? routePoints : points; // 如果解析失败，返回原始点
}

/**
 * 解码百度地图的加密坐标字符串（简化版，实际可能需要更复杂的解码）
 */
function decodePolyline(polyline) {
  // 百度地图的坐标通常是加密的，这里简化处理
  // 实际使用时可能需要调用百度地图的坐标转换 API
  const points = [];
  const coords = polyline.split(';');
  coords.forEach(coord => {
    const [lat, lng] = coord.split(',');
    if (lat && lng) {
      points.push({ lng: parseFloat(lng), lat: parseFloat(lat) });
    }
  });
  return points;
}


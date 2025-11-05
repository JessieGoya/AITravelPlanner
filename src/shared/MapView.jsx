import { useEffect, useRef } from 'react';
import { getRuntimeConfig } from '../services/config';

export default function MapView() {
  const ref = useRef(null);
  const cfg = getRuntimeConfig();

  useEffect(() => {
    if (!ref.current) return;
    if (!cfg.map.key) return;
    const cleanupList = [];

    const loadScript = (src) => new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('地图脚本加载失败'));
      document.head.appendChild(s);
      cleanupList.push(() => { s.remove(); });
    });

    const init = async () => {
      try {
        if (cfg.map.provider === 'baidu') {
          await loadScript(`https://api.map.baidu.com/api?v=1.0&&type=webgl&ak=${encodeURIComponent(cfg.map.key)}`);
          const map = new window.BMapGL.Map(ref.current);
          const pt = new window.BMapGL.Point(116.397428, 39.90923);
          map.centerAndZoom(pt, 11);
          map.enableScrollWheelZoom(true);
        } else {
          await loadScript(`https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(cfg.map.key)}`);
          // eslint-disable-next-line no-undef
          const map = new window.AMap.Map(ref.current, { zoom: 10, center: [116.397428, 39.90923] });
        }
      } catch (e) {
        // 忽略错误，显示空容器
      }
    };

    init();
    return () => { cleanupList.forEach((fn) => fn()); };
  }, [cfg.map.key, cfg.map.provider]);

  return <div ref={ref} className="map" />;
}



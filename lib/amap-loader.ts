/**
 * 高德地图加载器
 * 确保符合 GCJ-02 坐标系规范
 * 
 * 使用说明：
 * 1. 在组件中调用 loadAMap() 确保高德地图 SDK 已加载
 * 2. 使用 getAMapInstance() 获取 AMap 实例
 */

declare global {
  interface Window {
    AMap: any;
    _AMapSecurityConfig: {
      securityJsCode: string;
    };
  }
}

let amapLoaded = false;
let amapLoading = false;
let amapLoadPromise: Promise<void> | null = null;

/**
 * 加载高德地图 JS SDK 2.0
 * @returns Promise<void>
 */
export function loadAMap(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (amapLoaded && window.AMap) {
    return Promise.resolve();
  }

  if (amapLoading && amapLoadPromise) {
    return amapLoadPromise;
  }

  amapLoading = true;
  amapLoadPromise = new Promise(async (resolve, reject) => {
    try {
      // 配置安全密钥
      const securityKey = process.env.NEXT_PUBLIC_AMAP_SECURITY_KEY;
      if (securityKey) {
        window._AMapSecurityConfig = {
          securityJsCode: securityKey,
        };
      }

      // 动态加载 AMapLoader
      if (!(window as any).AMapLoader) {
        const loaderScript = document.createElement("script");
        loaderScript.type = "text/javascript";
        loaderScript.async = true;
        loaderScript.src = `https://webapi.amap.com/loader.js`;
        
        await new Promise<void>((loaderResolve, loaderReject) => {
          loaderScript.onload = () => loaderResolve();
          loaderScript.onerror = () => loaderReject(new Error("Failed to load AMapLoader"));
          document.head.appendChild(loaderScript);
        });
      }

      // 使用 AMapLoader.load 加载 SDK 和所有插件
      const AMapLoader = (window as any).AMapLoader;
      const AMap = await AMapLoader.load({
        key: process.env.NEXT_PUBLIC_AMAP_KEY,
        version: "2.0",
        plugins: [
          'AMap.Scale',        // 比例尺控件
          'AMap.ToolBar',      // 工具条控件
          'AMap.Geolocation',  // 定位插件
          'AMap.Walking',       // 步行导航
          'AMap.Riding',        // 骑行/电动车路径规划
          'AMap.Polyline',      // 折线（关键：画线需要）
          'AMap.Marker',        // 点标记
          'AMap.Polygon',       // 多边形（用于画边界）
          'AMap.PlaceSearch',   // 地点搜索
          'AMap.AutoComplete',  // 自动完成
          'AMap.MouseTool',     // 鼠标工具（用于绘制）
          'AMap.PolygonEditor', // 多边形编辑器（用于编辑边界）
        ],
      });

      // 将 AMap 实例挂载到 window（AMapLoader.load 返回的是 AMap 命名空间）
      window.AMap = AMap;
      amapLoaded = true;
      amapLoading = false;
      resolve();
    } catch (error) {
      amapLoading = false;
      amapLoadPromise = null;
      reject(new Error(`Failed to load AMap SDK: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  });

  return amapLoadPromise;
}

/**
 * 获取高德地图实例
 * @returns AMap 实例
 * @throws Error 如果 SDK 未加载
 */
export function getAMapInstance(): any {
  if (typeof window === "undefined" || !window.AMap) {
    throw new Error("AMap SDK is not loaded. Please call loadAMap() first.");
  }
  return window.AMap;
}

/**
 * 检查高德地图是否已加载
 * @returns boolean
 */
export function isAMapLoaded(): boolean {
  return typeof window !== "undefined" && amapLoaded && !!window.AMap;
}

/**
 * 加载高德地图插件
 * @param pluginName 插件名称，如 'AMap.Geolocation'
 * @returns Promise<void>
 */
export function loadAMapPlugin(pluginName: string, timeout: number = 10000): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Window is not defined"));
  }

  // 确保主脚本已加载
  if (!window.AMap) {
    return Promise.reject(new Error("AMap SDK is not loaded. Please call loadAMap() first."));
  }

  const AMap = window.AMap;

  // 辅助函数：检查插件是否已加载
  // 增强版：支持嵌套对象（如 AMap.PolygonEditor）
  const checkPluginLoaded = (): boolean => {
    try {
      // 方法1：使用 reduce 遍历嵌套路径
      const pluginClass = pluginName.split('.').reduce((obj, key) => {
        if (obj && typeof obj === 'object' && key in obj) {
          return obj[key];
        }
        return undefined;
      }, AMap);
      
      // 方法2：直接访问（作为备选方案）
      if (pluginClass === undefined || pluginClass === null) {
        // 尝试直接访问，例如 window.AMap.PolygonEditor
        const directAccess = pluginName.split('.').reduce((obj: any, key) => {
          return obj?.[key];
        }, window.AMap);
        if (directAccess !== undefined && directAccess !== null) {
          return true;
        }
      }
      
      return pluginClass !== undefined && pluginClass !== null && typeof pluginClass === 'function';
    } catch {
      // 如果访问出错，尝试直接检查 window.AMap 对象
      try {
        const parts = pluginName.split('.');
        if (parts.length === 2 && parts[0] === 'AMap') {
          const pluginKey = parts[1];
          return !!(window.AMap && window.AMap[pluginKey] && typeof window.AMap[pluginKey] === 'function');
        }
      } catch {
        return false;
      }
      return false;
    }
  };

  // 健壮性优化：检查插件是否已经加载（可能在主加载器中已加载）
  if (checkPluginLoaded()) {
    // 插件已存在，直接 resolve，避免重复加载导致的冲突
    return Promise.resolve();
  }

  // 如果插件未检测到，等待一小段时间后再次检查（因为主加载器可能还在加载中）
  return new Promise((resolve, reject) => {
    // 先等待一小段时间，让主加载器完成
    const checkInterval = setInterval(() => {
      if (checkPluginLoaded()) {
        clearInterval(checkInterval);
        clearTimeout(timeoutId);
        resolve();
      }
    }, 100); // 每 100ms 检查一次

    // 设置总超时
    const timeoutId = setTimeout(() => {
      clearInterval(checkInterval);
      
      // 超时前最后检查一次
      if (checkPluginLoaded()) {
        resolve();
        return;
      }

      // 如果仍未加载，尝试通过 AMap.plugin 动态加载
      try {
        AMap.plugin(pluginName, () => {
          clearTimeout(timeoutId);
          clearInterval(checkInterval);
          
          // 关键修复：增加异步重试检测机制
          // 因为高德 2.0 中，插件挂载可能存在极短的延迟
          let retryCount = 0;
          const maxRetries = 3;
          const retryDelay = 100; // 100ms
          
          const retryCheck = () => {
            // 针对 PolygonEditor 的特殊检查（已知高频故障点）
            if (pluginName === 'AMap.PolygonEditor') {
              // 直接检查 window.AMap.PolygonEditor
              if (window.AMap && window.AMap.PolygonEditor && typeof window.AMap.PolygonEditor === 'function') {
                resolve();
                return;
              }
              // 兼容性检查：尝试 PolyEditor（某些版本可能使用此名称）
              if (window.AMap && (window.AMap as any).PolyEditor && typeof (window.AMap as any).PolyEditor === 'function') {
                resolve();
                return;
              }
            }
            
            // 通用检查
            if (checkPluginLoaded()) {
              resolve();
              return;
            }
            
            // 如果仍未检测到，进行重试
            if (retryCount < maxRetries) {
              retryCount++;
              setTimeout(retryCheck, retryDelay);
            } else {
              // 重试失败，返回错误
              reject(new Error(`Failed to load plugin: ${pluginName} - Plugin not found after ${maxRetries} retries`));
            }
          };
          
          // 立即执行第一次检查
          retryCheck();
        });
      } catch (error) {
        clearInterval(checkInterval);
        reject(new Error(`Failed to load plugin: ${pluginName} - ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    }, 2000); // 等待 2 秒让主加载器完成，然后再尝试动态加载
  });
}

/**
 * 批量加载高德地图插件
 * @param pluginNames 插件名称数组
 * @returns Promise<void>
 */
export async function loadAMapPlugins(pluginNames: string[]): Promise<void> {
  await Promise.all(pluginNames.map((name) => loadAMapPlugin(name)));
}

/**
 * 坐标转换工具类
 * 注意：高德地图使用 GCJ-02 坐标系（火星坐标系）
 * 如果需要从 WGS-84（GPS 原始坐标）转换，需要使用专门的转换算法
 */
export class CoordinateConverter {
  /**
   * 验证坐标是否为有效的 GCJ-02 坐标
   * @param lng 经度
   * @param lat 纬度
   * @returns boolean
   */
  static isValidGCJ02(lng: number, lat: number): boolean {
    // GCJ-02 坐标范围：中国境内大致范围
    return (
      lng >= 73 && lng <= 135 &&
      lat >= 3 && lat <= 54 &&
      typeof lng === "number" &&
      typeof lat === "number" &&
      !isNaN(lng) &&
      !isNaN(lat)
    );
  }

  /**
   * 格式化坐标为 [lng, lat] 数组（符合 GeoJSON 规范）
   * @param lng 经度
   * @param lat 纬度
   * @returns [lng, lat]
   */
  static formatCoordinate(lng: number, lat: number): [number, number] {
    if (!this.isValidGCJ02(lng, lat)) {
      throw new Error(`Invalid GCJ-02 coordinate: [${lng}, ${lat}]`);
    }
    return [lng, lat];
  }

  /**
   * 从 [lng, lat] 数组中提取坐标
   * @param coord [lng, lat] 数组
   * @returns { lng: number, lat: number }
   */
  static parseCoordinate(coord: [number, number]): { lng: number; lat: number } {
    if (!Array.isArray(coord) || coord.length !== 2) {
      throw new Error(`Invalid coordinate array: ${JSON.stringify(coord)}`);
    }
    const [lng, lat] = coord;
    if (!this.isValidGCJ02(lng, lat)) {
      throw new Error(`Invalid GCJ-02 coordinate in array: [${lng}, ${lat}]`);
    }
    return { lng, lat };
  }
}


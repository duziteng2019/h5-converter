/**
 * 图片懒加载工具类
 * 支持智能预加载、本地缓存、错误重试等功能
 */

class ImageLazyLoader {
  constructor() {
    this.cache = new Map(); // 内存缓存
    this.intersectionObserver = null; // 交叉观察器
    this.loadingQueue = []; // 加载队列
    this.maxConcurrent = 3; // 最大并发数
    this.currentLoading = 0; // 当前加载数量
    
    this.initIntersectionObserver();
  }

  // 初始化交叉观察器
  initIntersectionObserver() {
    if (wx.createIntersectionObserver) {
      this.intersectionObserver = wx.createIntersectionObserver(this);
    }
  }

  /**
   * 设置图片懒加载
   * @param {string} selector - 图片选择器
   * @param {Object} options - 配置选项
   */
  observeImages(selector, options = {}) {
    if (!this.intersectionObserver) {
      console.warn('IntersectionObserver not supported');
      return;
    }

    const {
      rootMargin = '100px', // 预加载距离
      threshold = 0.1,
      onLoad = null,
      onError = null
    } = options;

    this.intersectionObserver
      .relativeToViewport({ bottom: rootMargin })
      .observe(selector, (res) => {
        if (res.intersectionRatio > threshold) {
          this.loadImage(res.id, res.dataset, onLoad, onError);
        }
      });
  }

  /**
   * 智能加载图片
   */
  async loadImage(imageId, dataset, onLoad = null, onError = null) {
    const { src, placeholder = '/assets/images/placeholder.png', cacheKey = src } = dataset;

    // 检查内存缓存
    if (this.cache.has(cacheKey)) {
      const cachedImage = this.cache.get(cacheKey);
      if (onLoad) onLoad(imageId, cachedImage);
      return cachedImage;
    }

    // 检查本地存储缓存
    const localCache = this.getLocalCache(cacheKey);
    if (localCache) {
      this.cache.set(cacheKey, localCache);
      if (onLoad) onLoad(imageId, localCache);
      return localCache;
    }

    // 控制并发数
    if (this.currentLoading >= this.maxConcurrent) {
      this.addToQueue(imageId, dataset, onLoad, onError);
      return;
    }

    this.currentLoading++;

    try {
      // 先显示占位图
      if (onLoad) onLoad(imageId, placeholder);

      // 加载真实图片
      const result = await this.loadImageWithRetry(src, 3);
      
      if (result.success) {
        // 缓存到内存和本地存储
        this.cache.set(cacheKey, result.url);
        this.setLocalCache(cacheKey, result.url);
        
        if (onLoad) onLoad(imageId, result.url);
      } else {
        console.warn(`Image load failed after retries: ${src}`);
        if (onError) onError(imageId, src);
      }
    } catch (error) {
      console.error('Image load error:', error);
      if (onError) onError(imageId, src);
    } finally {
      this.currentLoading--;
      this.processQueue();
    }
  }

  /**
   * 带重试机制的图片加载
   */
  async loadImageWithRetry(url, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Image load failed'));
          img.src = url;
          
          // 超时处理
          setTimeout(() => reject(new Error('Image load timeout')), 5000);
        });
        
        return { success: true, url };
      } catch (error) {
        if (i === maxRetries - 1) {
          return { success: false, error };
        }
        
        // 指数退避重试
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
  }

  /**
   * 添加图片到加载队列
   */
  addToQueue(imageId, dataset, onLoad, onError) {
    this.loadingQueue.push({ imageId, dataset, onLoad, onError });
  }

  /**
   * 处理加载队列
   */
  processQueue() {
    if (this.loadingQueue.length > 0 && this.currentLoading < this.maxConcurrent) {
      const nextItem = this.loadingQueue.shift();
      this.loadImage(nextItem.imageId, nextItem.dataset, nextItem.onLoad, nextItem.onError);
    }
  }

  /**
   * 从本地存储获取缓存
   */
  getLocalCache(key) {
    try {
      const cache = wx.getStorageSync('image_cache');
      if (cache && cache[key] && cache[key].expire > Date.now()) {
        return cache[key].data;
      }
    } catch (error) {
      console.warn('Get local cache failed:', error);
    }
    return null;
  }

  /**
   * 设置本地存储缓存
   */
  setLocalCache(key, data) {
    try {
      const cache = wx.getStorageSync('image_cache') || {};
      cache[key] = {
        data,
        expire: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7天过期
      };
      wx.setStorageSync('image_cache', cache);
    } catch (error) {
      console.warn('Set local cache failed:', error);
    }
  }

  /**
   * 预加载重要图片
   */
  preloadImages(urls) {
    urls.forEach(url => {
      const img = new Image();
      img.src = url;
    });
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.cache.clear();
    try {
      wx.removeStorageSync('image_cache');
    } catch (error) {
      console.warn('Clear cache failed:', error);
    }
  }

  /**
   * 销毁实例
   */
  destroy() {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
    this.cache.clear();
    this.loadingQueue = [];
  }
}

// 创建全局实例
const imageLazyLoader = new ImageLazyLoader();

module.exports = imageLazyLoader;
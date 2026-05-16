// 性能监控和用户体验优化工具
const performanceMonitor = {
  // 应用启动时间
  appLaunchTime: Date.now(),
  
  // 页面加载时间统计
  pageLoadTimes: {},
  
  // 功能响应时间
  featureResponseTimes: {},
  
  // 初始化性能监控
  init() {
    this.trackAppLaunch();
    this.trackPageLoadTimes();
    this.trackNetworkPerformance();
    this.trackMemoryUsage();
  },
  
  // 跟踪应用启动时间
  trackAppLaunch() {
    const launchTime = Date.now() - this.appLaunchTime;
    console.log(`App launched in ${launchTime}ms`);
    
    // 保存启动时间数据
    this.savePerformanceData('app_launch', launchTime);
    
    // 记录性能指标
    const { analytics } = require('./analytics.js');
    analytics.trackPerformance('app_launch_time', launchTime);
  },
  
  // 跟踪页面加载时间
  trackPageLoadTimes() {
    const pages = getCurrentPages();
    if (pages.length > 0) {
      const currentPage = pages[pages.length - 1];
      const pageName = currentPage.route;
      
      if (!this.pageLoadTimes[pageName]) {
        this.pageLoadTimes[pageName] = {
          startTime: Date.now(),
          loadCount: 0
        };
        
        // 监听页面显示完成
        const originalOnShow = currentPage.onShow;
        currentPage.onShow = function() {
          if (originalOnShow) {
            originalOnShow.call(this);
          }
          
          const loadTime = Date.now() - performanceMonitor.pageLoadTimes[pageName].startTime;
          performanceMonitor.pageLoadTimes[pageName].loadTime = loadTime;
          performanceMonitor.pageLoadTimes[pageName].loadCount++;
          
          console.log(`Page ${pageName} loaded in ${loadTime}ms`);
          
          // 记录性能指标
          const { analytics } = require('./analytics.js');
          analytics.trackPerformance(`page_${pageName}_load_time`, loadTime);
        };
      }
    }
  },
  
  // 跟踪网络性能
  trackNetworkPerformance() {
    // 监听所有网络请求
    const originalRequest = wx.request;
    wx.request = function(options) {
      const startTime = Date.now();
      
      return originalRequest({
        ...options,
        success: (res) => {
          const responseTime = Date.now() - startTime;
          console.log(`API ${options.url} responded in ${responseTime}ms`);
          
          // 记录性能指标
          const { analytics } = require('./analytics.js');
          analytics.trackPerformance('api_response_time', responseTime);
          
          if (options.success) {
            options.success(res);
          }
        },
        fail: (err) => {
          const responseTime = Date.now() - startTime;
          console.error(`API ${options.url} failed in ${responseTime}ms`, err);
          
          if (options.fail) {
            options.fail(err);
          }
        }
      });
    };
  },
  
  // 跟踪内存使用情况
  trackMemoryUsage() {
    // 定期检查内存使用情况
    setInterval(() => {
      const memoryInfo = wx.getStorageInfoSync();
      const currentUsage = memoryInfo.currentSize;
      const limit = memoryInfo.limitSize;
      const usagePercentage = (currentUsage / limit) * 100;
      
      console.log(`Storage usage: ${currentUsage}KB / ${limit}KB (${usagePercentage.toFixed(1)}%)`);
      
      // 如果存储使用超过80%，发出警告
      if (usagePercentage > 80) {
        console.warn('Storage usage is high, consider clearing cache');
        
        // 自动清理一些临时数据
        this.cleanupStorage();
      }
      
      // 记录性能指标
      const { analytics } = require('./analytics.js');
      analytics.trackPerformance('storage_usage', usagePercentage);
      
    }, 30000); // 每30秒检查一次
  },
  
  // 清理存储空间
  cleanupStorage() {
    try {
      // 清理过期的临时数据
      const now = Date.now();
      const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
      
      // 清理一周前的缓存数据
      const cacheKeys = wx.getStorageInfoSync().keys;
      cacheKeys.forEach(key => {
        if (key.startsWith('temp_') || key.startsWith('cache_')) {
          const data = wx.getStorageSync(key);
          if (data && data.timestamp && data.timestamp < oneWeekAgo) {
            wx.removeStorageSync(key);
            console.log(`Cleaned up expired cache: ${key}`);
          }
        }
      });
      
      console.log('Storage cleanup completed');
      
    } catch (error) {
      console.error('Storage cleanup failed:', error);
    }
  },
  
  // 保存性能数据
  savePerformanceData(metric, value) {
    try {
      const performanceData = wx.getStorageSync('performance_data') || {};
      performanceData[metric] = {
        value: value,
        timestamp: Date.now(),
        version: '1.0.2'
      };
      wx.setStorageSync('performance_data', performanceData);
    } catch (error) {
      console.warn('Failed to save performance data:', error);
    }
  },
  
  // 获取性能报告
  getPerformanceReport() {
    return {
      appLaunchTime: this.appLaunchTime,
      pageLoadTimes: this.pageLoadTimes,
      storageInfo: wx.getStorageInfoSync(),
      systemInfo: wx.getSystemInfoSync(),
      performanceData: wx.getStorageSync('performance_data') || {}
    };
  },
  
  // 优化建议
  getOptimizationSuggestions() {
    const suggestions = [];
    const systemInfo = wx.getSystemInfoSync();
    const storageInfo = wx.getStorageInfoSync();
    
    // 检查存储空间
    const usagePercentage = (storageInfo.currentSize / storageInfo.limitSize) * 100;
    if (usagePercentage > 80) {
      suggestions.push({
        type: 'storage',
        priority: 'high',
        message: '存储空间使用率较高，建议清理缓存数据',
        action: '清理缓存'
      });
    }
    
    // 检查网络状态
    wx.getNetworkType({
      success: (res) => {
        if (res.networkType === '2g') {
          suggestions.push({
            type: 'network',
            priority: 'medium',
            message: '当前网络环境较差，建议在WiFi环境下使用',
            action: '切换网络'
          });
        }
      }
    });
    
    // 检查设备性能
    if (systemInfo.platform === 'android' && systemInfo.system.toLowerCase().includes('android 5')) {
      suggestions.push({
        type: 'device',
        priority: 'medium',
        message: '您的设备系统版本较低，建议升级系统以获得更好的体验',
        action: '升级系统'
      });
    }
    
    return suggestions;
  }
};

// 用户体验优化工具
const userExperience = {
  // 平滑滚动效果
  smoothScroll(element, targetPosition, duration = 300) {
    const startPosition = element.scrollTop;
    const distance = targetPosition - startPosition;
    const startTime = Date.now();
    
    function animate() {
      const currentTime = Date.now();
      const timeElapsed = currentTime - startTime;
      const progress = Math.min(timeElapsed / duration, 1);
      
      // 使用缓动函数
      const easeProgress = easeOutCubic(progress);
      element.scrollTop = startPosition + distance * easeProgress;
      
      if (timeElapsed < duration) {
        requestAnimationFrame(animate);
      }
    }
    
    animate();
  },
  
  // 图片懒加载
  lazyLoadImages(selector = '.lazy-image') {
    const images = document.querySelectorAll(selector);
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          observer.unobserve(img);
        }
      });
    });
    
    images.forEach(img => observer.observe(img));
  },
  
  // 防抖函数
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },
  
  // 节流函数
  throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },
  
  // 加载动画
  showLoadingAnimation(message = '加载中...') {
    wx.showLoading({
      title: message,
      mask: true
    });
  },
  
  // 隐藏加载动画
  hideLoadingAnimation() {
    wx.hideLoading();
  },
  
  // 错误提示
  showErrorToast(message, duration = 3000) {
    wx.showToast({
      title: message,
      icon: 'none',
      duration: duration
    });
  },
  
  // 成功提示
  showSuccessToast(message, duration = 2000) {
    wx.showToast({
      title: message,
      icon: 'success',
      duration: duration
    });
  }
};

// 缓动函数
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// 导出模块
module.exports = {
  performanceMonitor,
  userExperience
};
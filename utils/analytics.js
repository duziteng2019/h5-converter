// 用户行为统计和错误监控工具
var analytics = {
  // 应用启动统计
  trackAppLaunch: function() {
    var launchData = {
      timestamp: Date.now(),
      scene: wx.getLaunchOptionsSync().scene || 0,
      platform: wx.getSystemInfoSync().platform,
      version: wx.getSystemInfoSync().version,
      appVersion: '1.0.2'
    };
    
    this.saveToStorage('app_launches', launchData);
    console.log('App launched:', launchData);
  },
  
  // 页面访问统计
  trackPageView(pageName) {
    const pageData = {
      page: pageName,
      timestamp: Date.now(),
      duration: 0
    };
    
    this.saveToStorage('page_views', pageData);
    
    // 设置页面停留时间计时器
    const startTime = Date.now();
    const currentPage = getCurrentPages().pop();
    
    if (currentPage && currentPage.onUnload) {
      const originalOnUnload = currentPage.onUnload;
      currentPage.onUnload = function() {
        pageData.duration = Date.now() - startTime;
        analytics.saveToStorage('page_views', pageData);
        originalOnUnload.call(this);
      };
    }
  },
  
  // 功能使用统计
  trackFeatureUsage(featureName, data = {}) {
    const featureData = {
      feature: featureName,
      timestamp: Date.now(),
      ...data
    };
    
    this.saveToStorage('feature_usage', featureData);
    console.log('Feature used:', featureData);
  },
  
  // 错误监控
  trackError(error, context = {}) {
    const errorData = {
      message: error.message || String(error),
      stack: error.stack,
      timestamp: Date.now(),
      page: getCurrentPages().length > 0 ? getCurrentPages().pop().route : 'unknown',
      ...context
    };
    
    this.saveToStorage('errors', errorData);
    console.error('Error tracked:', errorData);
    
    // 实时上报错误（如果有网络连接）
    this.reportError(errorData);
  },
  
  // 实时错误上报
  reportError(errorData) {
    if (wx.request) {
      wx.request({
        url: 'https://your-error-reporting-api.com/errors',
        method: 'POST',
        data: errorData,
        header: {
          'Content-Type': 'application/json'
        },
        success: () => {
          console.log('Error reported successfully');
        },
        fail: (err) => {
          console.warn('Error reporting failed:', err);
        }
      });
    }
  },
  
  // 用户反馈收集
  submitFeedback(feedback, contact = '') {
    const feedbackData = {
      content: feedback,
      contact: contact,
      timestamp: Date.now(),
      platform: wx.getSystemInfoSync().platform,
      version: wx.getSystemInfoSync().version
    };
    
    this.saveToStorage('feedback', feedbackData);
    
    // 发送反馈到服务器
    wx.request({
      url: 'https://your-feedback-api.com/feedback',
      method: 'POST',
      data: feedbackData,
      header: {
        'Content-Type': 'application/json'
      },
      success: () => {
        wx.showToast({
          title: '反馈提交成功',
          icon: 'success'
        });
      },
      fail: () => {
        wx.showToast({
          title: '反馈提交失败，已保存本地',
          icon: 'none'
        });
      }
    });
  },
  
  // 性能监控
  trackPerformance(metricName, value) {
    const perfData = {
      metric: metricName,
      value: value,
      timestamp: Date.now()
    };
    
    this.saveToStorage('performance', perfData);
  },
  
  // 数据保存到本地存储
  saveToStorage(key, data) {
    try {
      const existingData = wx.getStorageSync(key) || [];
      const newData = [...existingData, data];
      
      // 限制存储数量，避免占用过多空间
      if (newData.length > 100) {
        newData.splice(0, newData.length - 100);
      }
      
      wx.setStorageSync(key, newData);
    } catch (error) {
      console.warn('Failed to save analytics data:', error);
    }
  },
  
  // 获取统计数据
  getAnalyticsData() {
    return {
      appLaunches: wx.getStorageSync('app_launches') || [],
      pageViews: wx.getStorageSync('page_views') || [],
      featureUsage: wx.getStorageSync('feature_usage') || [],
      errors: wx.getStorageSync('errors') || [],
      feedback: wx.getStorageSync('feedback') || [],
      performance: wx.getStorageSync('performance') || []
    };
  },
  
  // 清空统计数据
  clearAnalyticsData() {
    const keys = ['app_launches', 'page_views', 'feature_usage', 'errors', 'feedback', 'performance'];
    keys.forEach(key => {
      wx.removeStorageSync(key);
    });
    
    wx.showToast({
      title: '统计数据已清空',
      icon: 'success'
    });
  }
};

// 错误捕获器
const errorHandler = {
  // 捕获 JavaScript 错误
  captureJsError(error) {
    analytics.trackError(error, {
      type: 'js_error',
      source: 'javascript'
    });
  },
  
  // 捕获 Promise 错误
  capturePromiseError(error) {
    analytics.trackError(error, {
      type: 'promise_error',
      source: 'promise'
    });
  },
  
  // 捕获网络请求错误
  captureRequestError(error, requestInfo = {}) {
    analytics.trackError(error, {
      type: 'request_error',
      source: 'network',
      ...requestInfo
    });
  }
};

// 导出模块
module.exports = {
  analytics,
  errorHandler
};
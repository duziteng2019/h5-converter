const { analytics } = require('./utils/analytics.js');

App({
  onLaunch: function() {
    // 初始化云开发
    wx.cloud.init({
      env: 'cloud1-3gffxfbw1b36f8a6', // 云开发环境ID
      traceUser: true
    });
    
    // 记录应用启动
    analytics.trackAppLaunch();
  },
  
  onShow: function() {
    // 应用显示时记录
    console.log('App shown');
  },
  
  onHide: function() {
    // 应用隐藏时记录
    console.log('App hidden');
  }
});
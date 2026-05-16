// pages/feedback/feedback.js
const { analytics } = require('../../utils/analytics.js');

Page({
  data: {
    feedback: '',
    contact: '',
    feedbackType: 'suggestion', // suggestion, bug, feature, other
    feedbackTypes: [
      { label: '功能建议', value: 'suggestion' },
      { label: '问题反馈', value: 'bug' },
      { label: '新功能需求', value: 'feature' },
      { label: '其他', value: 'other' }
    ],
    pickerRange: ['功能建议', '问题反馈', '新功能需求', '其他'],
    pickerValue: 0,
    submitting: false,
    submitSuccess: false
  },

  onLoad() {
    // 记录页面访问
    analytics.trackPageView('feedback');
  },

  // 输入反馈内容
  onFeedbackInput(e) {
    this.setData({ feedback: e.detail.value });
  },

  // 输入联系方式
  onContactInput(e) {
    this.setData({ contact: e.detail.value });
  },

  // 选择反馈类型
  onTypeChange(e) {
    var selectedIndex = e.detail.value;
    var selectedType = this.data.feedbackTypes[selectedIndex].value;
    this.setData({ 
      feedbackType: selectedType,
      pickerValue: parseInt(selectedIndex)
    });
  },

  // 提交反馈
  onSubmit() {
    const { feedback, contact, feedbackType } = this.data;
    
    if (!feedback.trim()) {
      wx.showToast({
        title: '请输入反馈内容',
        icon: 'none'
      });
      return;
    }

    if (feedback.length > 500) {
      wx.showToast({
        title: '反馈内容过长（最多500字）',
        icon: 'none'
      });
      return;
    }

    this.setData({ submitting: true });

    // 构建反馈数据
    const feedbackData = {
      type: feedbackType,
      content: feedback.trim(),
      contact: contact.trim(),
      timestamp: Date.now(),
      version: '1.0.2',
      platform: wx.getSystemInfoSync().platform
    };

    // 提交反馈
    analytics.submitFeedback(feedbackData.content, contact);
    
    // 记录功能使用
    analytics.trackFeatureUsage('submit_feedback', {
      type: feedbackType,
      contentLength: feedback.length
    });

    // 模拟提交延迟
    setTimeout(() => {
      this.setData({
        submitting: false,
        submitSuccess: true,
        feedback: '',
        contact: ''
      });

      wx.showToast({
        title: '反馈提交成功',
        icon: 'success'
      });

      // 3秒后返回
      setTimeout(() => {
        wx.navigateBack();
      }, 3000);
    }, 1000);
  },

  // 清空输入
  onClear() {
    this.setData({
      feedback: '',
      contact: '',
      feedbackType: 'suggestion'
    });
  },

  // 返回
  onBack() {
    wx.navigateBack();
  }
});
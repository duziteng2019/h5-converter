Page({
  data: {
    loading: true,
    history: []
  },

  onLoad: function(options) {
    this.loadHistory()
    this.initImageLazyLoad()
  },

  onShow: function() {
    this.loadHistory()
  },

  // 初始化图片懒加载
  initImageLazyLoad() {
    this.observer = wx.createIntersectionObserver(this);
    this.observer
      .relativeToViewport({ bottom: 100 })
      .observe('.lazy-image', (res) => {
        if (res.intersectionRatio > 0.1) {
          this.loadImageIfNeeded(res.dataset.index);
        }
      });
  },

  // 按需加载图片
  loadImageIfNeeded(index) {
    const history = this.data.history;
    if (!history[index] || history[index].imageLoaded) {
      return;
    }

    const item = history[index];
    const img = new Image();
    
    img.onload = () => {
      // 图片加载成功，更新状态
      const key = `history[${index}].imageLoaded`;
      this.setData({
        [key]: true
      });
    };

    img.onerror = () => {
      // 图片加载失败，使用占位图
      const key = `history[${index}].image`;
      this.setData({
        [key]: '/assets/images/placeholder.png'
      });
    };

    img.src = item.image;
  },

  // 图片加载错误处理
  onImageError(e) {
    const index = e.currentTarget.dataset.index;
    const history = this.data.history || [];
    if (history[index]) {
      const key = `history[${index}].image`;
      this.setData({
        [key]: '/assets/images/placeholder.png'
      });
    }
  },

  // 加载浏览历史
  loadHistory: function() {
    this.setData({ loading: true })
    
    // 尝试从云端加载历史记录
    this.loadHistoryFromCloud()
      .then(cloudHistory => {
        if (cloudHistory && cloudHistory.length > 0) {
          // 使用云端数据
          this.processHistoryData(cloudHistory)
        } else {
          // 回退到本地存储
          const localHistory = wx.getStorageSync('dance_hall_history') || []
          if (localHistory.length === 0) {
            this.setData({
              history: [],
              loading: false
            })
            return
          }
          this.processHistoryData(localHistory)
        }
      })
      .catch(err => {
        console.error('从云端加载历史记录失败:', err)
        // 回退到本地存储
        const localHistory = wx.getStorageSync('dance_hall_history') || []
        if (localHistory.length === 0) {
          this.setData({
            history: [],
            loading: false
          })
          return
        }
        this.processHistoryData(localHistory)
      })
  },

  // 从云端加载历史记录
  loadHistoryFromCloud: function() {
    return new Promise((resolve, reject) => {
      const browsingHistory = require('../../utils/browsingHistory');
      browsingHistory.getHistory()
        .then(history => {
          console.log('获取历史记录成功:', history.length, '条')
          resolve(history)
        })
        .catch(err => {
          reject(err)
        })
    })
  },

  // 处理历史记录数据
  processHistoryData: function(historyData) {
    // 获取舞厅详细信息
    const db = wx.cloud.database()
    const hallIds = historyData.map(record => record.hall_id || record.hallId)
    
    db.collection('dance_halls')
      .where({
        _id: db.command.in(hallIds)
      })
      .get()
      .then(res => {
        // 合并历史记录和舞厅信息
        const historyWithDetails = historyData.map(record => {
          const hallId = record.hall_id || record.hallId
          const hall = res.data.find(h => h._id === hallId)
          
          return {
            _id: hallId,
            name: hall ? hall.name : '未知舞厅',
            address: hall ? hall.address : '地址未知',
            image: hall ? (hall.image || this.generateRandomImage()) : this.generateRandomImage(),
            rating: hall ? hall.rating : 4.0,
            viewTime: this.formatTime(record.view_time || record.timestamp)
          }
        }).filter(record => record.name !== '未知舞厅') // 过滤掉找不到的舞厅
        
        this.setData({
          history: historyWithDetails,
          loading: false
        })
      })
      .catch(err => {
        console.error('加载舞厅历史数据失败:', err)
        // 如果云端加载失败，只显示基本信息
        const historyWithBasicInfo = historyData.map(record => ({
          _id: record.hall_id || record.hallId,
          name: '舞厅' + (record.hall_id || record.hallId).substring(0, 4),
          address: '地址未知',
          image: this.generateRandomImage(),
          rating: 4.0,
          viewTime: this.formatTime(record.view_time || record.timestamp)
        }))
        
        this.setData({
          history: historyWithBasicInfo,
          loading: false
        })
      })
  },

  // 生成随机图片URL
  generateRandomImage() {
    const danceImages = [
      'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400',
      'https://images.unsplash.com/photo-1504609813442-a8924e83f76e?w=400',
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400',
      'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400',
      'https://images.unsplash.com/photo-1524368535928-5d8b7f0c7d1b?w=400',
      'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400'
    ]
    return danceImages[Math.floor(Math.random() * danceImages.length)]
  },

  // 查看详情
  navigateToDetail: function(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    })
  },

  // 删除单条历史记录
  removeHistory: function(e) {
    const hallId = e.currentTarget.dataset.id
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条浏览记录吗？',
      success: (res) => {
        if (res.confirm) {
          // 从本地存储删除
          let history = wx.getStorageSync('dance_hall_history') || []
          history = history.filter(h => h.hallId !== hallId)
          wx.setStorageSync('dance_hall_history', history)
          
          wx.showToast({
            title: '删除成功',
            icon: 'success'
          })
          
          // 重新加载列表
          this.loadHistory()
        }
      }
    })
  },

  // 清除全部历史记录
  clearHistory: function() {
    wx.showModal({
      title: '确认清除',
      content: '确定要清除所有浏览历史吗？此操作不可恢复',
      success: (res) => {
        if (res.confirm) {
          // 清除本地存储
          wx.setStorageSync('dance_hall_history', [])
          
          wx.showToast({
            title: '已清除全部历史',
            icon: 'success'
          })
          
          // 更新页面
          this.setData({
            history: []
          })
        }
      }
    })
  },

  // 跳转到首页
  goToIndex: function() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  },

  // 格式化时间显示
  formatTime: function(timestamp) {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date
    
    if (diff < 60000) { // 1分钟内
      return '刚刚'
    } else if (diff < 3600000) { // 1小时内
      return Math.floor(diff / 60000) + '分钟前'
    } else if (diff < 86400000) { // 1天内
      return Math.floor(diff / 3600000) + '小时前'
    } else if (diff < 604800000) { // 1周内
      return Math.floor(diff / 86400000) + '天前'
    } else {
      return date.getMonth() + 1 + '月' + date.getDate() + '日'
    }
  }
})
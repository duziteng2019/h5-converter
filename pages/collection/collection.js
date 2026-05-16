Page({
  data: {
    collections: [],
    loading: true,
    searchText: ""
  },
  
  onLoad() {
    this.loadCollections();
    this.initImageLazyLoad();
  },
  
  onShow() {
    this.loadCollections();
  },

  // 初始化图片懒加载
  initImageLazyLoad() {
    const imageLazyLoader = require('../../utils/imageLazyLoader');
    
    // 监听图片进入可视区域
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
    const collections = this.data.collections;
    if (!collections[index] || collections[index].imageLoaded) {
      return;
    }

    const item = collections[index];
    const img = new Image();
    
    img.onload = () => {
      // 图片加载成功，更新状态
      const key = `collections[${index}].imageLoaded`;
      this.setData({
        [key]: true
      });
    };

    img.onerror = () => {
      // 图片加载失败，使用占位图
      const key = `collections[${index}].image`;
      this.setData({
        [key]: '/assets/images/placeholder.png'
      });
    };

    img.src = item.image;
  },
  
  // 从云端加载收藏列表
  loadCollections() {
    this.setData({ loading: true });
    
    const db = wx.cloud.database();
    
    // 获取用户的收藏列表
    db.collection('user_favorites')
      .orderBy('create_time', 'desc')
      .get()
      .then(res => {
        console.log('获取收藏列表成功:', res.data.length, '条记录');
        
        if (!res.data || res.data.length === 0) {
          this.setData({
            collections: [],
            loading: false
          });
          
          wx.showToast({
            title: '暂无收藏',
            icon: 'none'
          });
          return;
        }
        
        // 获取收藏舞厅的详细信息
        const hallIds = res.data.map(fav => fav.hall_id);
        
        db.collection('dance_halls')
          .where({
            _id: db.command.in(hallIds)
          })
          .get()
          .then(hallRes => {
            // 将收藏记录和舞厅信息合并
            const collections = res.data.map(fav => {
              const hall = hallRes.data.find(h => h._id === fav.hall_id);
              return {
                _id: fav.hall_id,
                name: hall ? hall.name : (fav.hall_name || '舞厅'),
                address: hall ? hall.address : '地址未知',
                image: hall ? (hall.image || this.generateRandomImage()) : this.generateRandomImage(),
                rating: hall ? (hall.rating || 4.0) : 4.0,
                price: hall ? (hall.price || '价格待定') : '价格待定',
                businessHours: hall ? (hall.businessHours || '营业时间未知') : '营业时间未知',
                collectTime: this.formatCollectTime(fav.create_time)
              };
            });
            
            this.setData({
              collections: collections,
              loading: false
            });
          })
          .catch(err => {
            console.error('获取舞厅详情失败:', err);
            // 如果无法获取详情，使用收藏记录中的基本信息
            const collections = res.data.map(fav => ({
              _id: fav.hall_id,
              name: fav.hall_name || '舞厅',
              address: '地址信息加载中',
              image: this.generateRandomImage(),
              rating: 4.0,
              price: '价格待定',
              businessHours: '营业时间未知',
              collectTime: this.formatCollectTime(fav.create_time)
            }));
            
            this.setData({
              collections: collections,
              loading: false
            });
          });
      })
      .catch(err => {
        console.error('获取收藏列表失败:', err);
        this.setData({
          collections: [],
          loading: false
        });
        
        wx.showToast({
          title: '加载收藏失败',
          icon: 'error'
        });
      });
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
    ];
    return danceImages[Math.floor(Math.random() * danceImages.length)];
  },
  
  // 格式化收藏时间
  formatCollectTime(createTime) {
    if (!createTime) return '时间未知';
    
    // 如果是Date对象
    if (createTime instanceof Date) {
      const now = new Date();
      const diff = now - createTime;
      const minutes = Math.floor(diff / (1000 * 60));
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      
      if (minutes < 1) return '刚刚';
      if (minutes < 60) return `${minutes}分钟前`;
      if (hours < 24) return `${hours}小时前`;
      if (days < 30) return `${days}天前`;
      
      return createTime.toLocaleDateString();
    }
    
    // 如果是时间戳
    if (typeof createTime === 'number') {
      const date = new Date(createTime);
      return date.toLocaleDateString();
    }
    
    // 如果是字符串
    if (typeof createTime === 'string') {
      try {
        const date = new Date(createTime);
        return date.toLocaleDateString();
      } catch {
        return createTime;
      }
    }
    
    return '时间未知';
  },
  
  // 取消收藏（云同步）
  deleteCollection(e) {
    const id = e.currentTarget.dataset.id;
    const collection = this.data.collections.find(item => item._id === id);
    
    wx.showModal({
      title: '确认取消收藏',
      content: `确定要取消收藏"${collection ? collection.name : '这个舞厅'}"吗？`,
      success: (res) => {
        if (res.confirm) {
          // 从云端删除收藏记录
          const db = wx.cloud.database();
          
          db.collection('user_favorites')
            .where({
              hall_id: id
            })
            .remove()
            .then(removeRes => {
              console.log('取消收藏成功:', removeRes);
              
              // 更新页面数据
              let collections = this.data.collections.filter(item => item._id !== id);
              this.setData({ collections });
              
              wx.showToast({
                title: '已取消收藏',
                icon: 'success'
              });
              
              // 通知首页更新收藏状态
              this.notifyHomePage(id, false);
              
              // 记录用户行为
              const { analytics } = require('../../utils/analytics.js');
              analytics.trackFeatureUsage('favorite_remove', {
                hallId: id,
                hallName: collection ? collection.name : '未知舞厅'
              });
            })
            .catch(err => {
              console.error('取消收藏失败:', err);
              wx.showToast({
                title: '取消收藏失败',
                icon: 'error'
              });
            });
        }
      }
    });
  },
  
  // 导航到详情页
  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    });
  },
  
  // 通知首页更新收藏状态
  notifyHomePage(hallId, isFavorite) {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      const homePage = pages.find(page => page.route === 'pages/index/index');
      if (homePage) {
        homePage.updateFavoriteStatus(hallId, isFavorite);
      }
    }
  },
  
  // 清空所有收藏（云同步）
  clearAllCollections() {
    if (this.data.collections.length === 0) {
      wx.showToast({
        title: '暂无收藏',
        icon: 'none'
      });
      return;
    }
    
    wx.showModal({
      title: '清空收藏',
      content: `确定要清空所有${this.data.collections.length}个收藏吗？此操作不可撤销。`,
      success: (res) => {
        if (res.confirm) {
          // 从云端清空所有收藏记录
          const db = wx.cloud.database();
          
          db.collection('user_favorites')
            .where({
              // 查询当前用户的所有收藏
              _openid: db.command.exists(true)
            })
            .remove()
            .then(removeRes => {
              console.log('清空收藏成功:', removeRes);
              
              // 更新页面
              this.setData({ collections: [] });
              
              wx.showToast({
                title: '收藏已清空',
                icon: 'success'
              });
              
              // 通知首页更新所有收藏状态
              this.notifyHomePageClearAll();
              
              // 记录用户行为
              const { analytics } = require('../../utils/analytics.js');
              analytics.trackFeatureUsage('favorite_clear_all', {
                count: this.data.collections.length
              });
            })
            .catch(err => {
              console.error('清空收藏失败:', err);
              wx.showToast({
                title: '清空收藏失败',
                icon: 'error'
              });
            });
        }
      }
    });
  },
  
  // 通知首页清空所有收藏状态
  notifyHomePageClearAll() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      const homePage = pages.find(page => page.route === 'pages/index/index');
      if (homePage) {
        homePage.clearAllFavorites();
      }
    }
  },
  
  // 搜索收藏
  onSearchInput(e) {
    const keyword = e.detail.value.toLowerCase();
    if (!keyword) {
      this.loadCollections();
      return;
    }
    
    const filtered = this.data.collections.filter(hall => 
      hall.name.toLowerCase().includes(keyword) ||
      hall.address.toLowerCase().includes(keyword)
    );
    
    this.setData({ collections: filtered });
  },
  
  // 图片加载错误处理
  onImageError(e) {
    const index = e.currentTarget.dataset.index;
    const collections = this.data.collections || [];
    if (collections[index]) {
      collections[index].image = '/assets/images/placeholder.png';
      this.setData({ collections });
    }
  },
  
  // 跳转到首页
  goToIndex() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  }
})
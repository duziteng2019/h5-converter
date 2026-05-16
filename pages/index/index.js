// 防抖函数
function debounce(func, delay) {
  var timer = null;
  return function() {
    var context = this;
    var args = arguments;
    clearTimeout(timer);
    timer = setTimeout(function() {
      func.apply(context, args);
    }, delay);
  };
}

Page({
  data: {
    loading: true,
    isLoading: true,
    filteredHalls: [],
    allHalls: [], // 保存所有原始数据
    searchText: "",
    activeFilter: 0,
    showBackToTop: false,
    scrollTop: null, // 滚动位置
    userLocation: null, // 用户当前位置
    locationLoading: false, // 位置加载状态
    locationFetched: false, // 位置获取标记
    filterOptions: ['全部', '营业中', '附近', '推荐'], // 筛选选项
    
    // 分页相关状态
    pageSize: 20, // 每页加载数量
    currentPage: 1, // 当前页码
    hasMore: true, // 是否还有更多数据
    loadingMore: false, // 是否正在加载更多
    
    // 搜索相关状态
    showSearchHistory: false, // 显示搜索历史
    searchHistory: [], // 搜索历史记录
    searchSuggestions: [], // 搜索建议
    isSearching: false // 是否正在搜索
  },

  onLoad() {
    // 记录页面访问
    const { analytics } = require('../../utils/analytics.js');
    analytics.trackPageView('home');
    
    console.log('首页开始加载，尝试从云端获取数据...');
    
    // 优先尝试从云端获取数据（首次加载）
    this.loadRealData(false);
    
    // 获取用户位置（仅一次）
    if (!this.data.locationFetched) {
      this.getUserLocation();
    }
    
    // 加载搜索历史
    this.loadSearchHistory();
    
    // 防抖处理搜索
    this.debouncedSearch = debounce(this.filterHalls, 300);
    
    // 检查网络状态
    this.checkNetworkStatus();
  },

  onShow() {
    // 页面显示时仅刷新数据，不重复获取位置
    if (this.data.userLocation && this.data.locationFetched) {
      this.loadRealData(false);
    }
  },

  // 获取用户当前位置
  getUserLocation() {
    this.setData({ locationLoading: true, locationFetched: true });
    
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.userLocation']) {
          // 用户已授权位置权限
          this.getCurrentLocation();
        } else {
          // 用户未授权，请求授权
          wx.authorize({
            scope: 'scope.userLocation',
            success: () => {
              this.getCurrentLocation();
            },
            fail: () => {
              console.log('用户拒绝位置授权');
              this.setData({ locationLoading: false });
            // 继续加载数据，但没有位置信息
            this.loadRealData(false);
            }
          });
        }
      },
      fail: () => {
        this.setData({ locationLoading: false });
        this.loadRealData();
      }
    });
  },

  // 获取当前地理位置
  getCurrentLocation() {
    wx.getLocation({
      type: 'gcj02', // 国测局坐标
      success: (res) => {
        console.log('获取位置成功:', res);
        this.setData({
          userLocation: {
            latitude: res.latitude,
            longitude: res.longitude
          },
          locationLoading: false
        });
          // 获取位置后加载数据
          this.loadRealData(false);
      },
      fail: (err) => {
        console.error('获取位置失败:', err);
        this.setData({ locationLoading: false });
        // 位置获取失败，但数据已经加载，只需要重新排序
        if (this.data.allHalls && this.data.allHalls.length > 0) {
          const sortedData = this.sortByDistance(this.data.allHalls);
          this.setData({ filteredHalls: sortedData });
        }
      }
    });
  },

  // 从云端数据库加载真实数据（支持分页）
  loadRealData(isLoadMore = false) {
    // 如果是加载更多，设置加载更多状态
    if (isLoadMore) {
      if (this.data.loadingMore || !this.data.hasMore) {
        return // 防止重复加载
      }
      this.setData({ loadingMore: true })
    } else {
      // 首次加载或刷新
      this.setData({ 
        loading: true,
        currentPage: 1,
        hasMore: true 
      })
    }
    
    // 获取数据库引用和操作符
    const db = wx.cloud.database()
    const _ = db.command
    
    // 计算分页参数
    const pageSize = this.data.pageSize
    const currentPage = isLoadMore ? this.data.currentPage + 1 : 1
    const skip = (currentPage - 1) * pageSize
    
    console.log(`加载数据 - 页码: ${currentPage}, 跳过: ${skip}, 数量: ${pageSize}`)
    
    // 查询条件：状态不是"已关闭"或者状态字段为空，按评分和浏览量排序
    const query = db.collection('dance_halls')
      .where(_.or([
        { status: _.neq('已关闭') },
        { status: _.exists(false) },
        { status: '' },
        { status: _.eq('营业中') },
        { status: _.eq('休息中') }
      ]))
      .orderBy('rating', 'desc')
      .orderBy('viewCount', 'desc')
      .skip(skip)
      .limit(pageSize)
    
    query.get()
      .then(res => {
        console.log('云端数据加载成功，当前页数据:', res.data);
        console.log('云端数据加载成功，当前页数据条数:', res.data.length);
        
        // 处理数据格式，确保与前端界面兼容
        var currentPageData = [];
        if (res.data && res.data.length > 0) {
          currentPageData = res.data.map(function(item, index) {
            try {
              // 统一数据格式处理
              var hall = item;
              
              // 特殊处理：如果是字符串，尝试解析
              if (typeof item === 'string') {
                try {
                  hall = JSON.parse(item);
                } catch (e) {
                  console.warn('字符串解析失败，使用默认数据:', item);
                  hall = {};
                }
              }
              
              // 确保数据类型正确
              hall = hall || {};
              
              // 生成舞厅名称（优先使用数据库中的名称，否则使用序号）
              let hallName = hall.name;
              if (!hallName) {
                // 尝试从城市信息生成名称
                if (hall.city) {
                  hallName = hall.city + '舞厅';
                } else {
                  hallName = '舞厅' + (index + 1);
                }
              }
              
              // 生成地址（优先使用数据库中的地址）
              let hallAddress = hall.address;
              if (!hallAddress && hall.city) {
                hallAddress = hall.city + '市区';
              } else if (!hallAddress) {
                hallAddress = '地址信息待补充';
              }
              
              // 计算距离（如果用户位置可用）
              var distance = this.calculateDistance(hall);
              
              // 生成完整的数据对象
              var hallData = {
                _id: hall._id || 'hall_' + index,
                name: hallName,
                address: hallAddress,
                image: this.generateRandomImage(index), // 生成随机图片
                rating: parseFloat(hall.rating) || (4.0 + Math.random() * 1.0), // 使用真实评分或随机值
                isFavorite: Math.random() > 0.7, // 随机收藏状态
                isNew: Math.random() > 0.8, // 随机新开业状态
                hasDiscount: Math.random() > 0.6, // 随机优惠状态
                price: hall.price || '价格待定',
                businessHours: hall.businessHours || '营业时间未知',
                status: hall.status || '营业中', // 默认营业中
                viewCount: hall.viewCount || 0,
                latitude: hall.latitude || (hall.location && hall.location.latitude), // 支持嵌套结构
                longitude: hall.longitude || (hall.location && hall.location.longitude), // 支持嵌套结构
                distance: distance, // 距离（公里）
                distanceText: this.formatDistance(distance), // 格式化距离文本
                city: hall.city || '未知城市',
                description: hall.description || '暂无描述'
              };
              
              console.log('处理后的舞厅数据:', hallData.name, hallData.address, hallData.rating);
              return hallData;
            } catch (parseError) {
              console.error('数据解析失败:', parseError, '原始数据:', item);
              // 如果解析失败，返回基础数据
              return {
                _id: 'hall_error_' + index,
                name: '舞厅' + (index + 1),
                address: '数据解析失败',
                image: this.generateRandomImage(index),
                rating: 4.0,
                isFavorite: false,
                isNew: false,
                hasDiscount: false,
                price: '价格待定',
                businessHours: '营业时间未知',
                status: '状态未知',
                viewCount: 0,
                distance: null,
                distanceText: '距离未知',
                city: '未知城市'
              };
            }
          }.bind(this));
        }
        
        console.log('当前页处理完成的数据条数:', currentPageData.length);
        
        // 判断是否还有更多数据
        // 如果当前页数据数量等于pageSize，说明可能还有更多数据
        // 如果小于pageSize，说明已经是最后一页
        const hasMoreData = currentPageData.length >= pageSize;
        
        // 如果当前页数据为空，且不是加载更多，则回退到模拟数据
        if (!isLoadMore && currentPageData.length === 0) {
          console.warn('云端数据无效，回退到模拟数据');
          this.loadMockData();
          return;
        }
        
        // 过滤掉解析失败的数据
        currentPageData = currentPageData.filter(item => item.name !== '数据解析失败');
        
        // 处理数据合并
        let combinedData = [];
        if (isLoadMore) {
          // 加载更多：合并旧数据和新数据
          combinedData = [...this.data.allHalls, ...currentPageData];
        } else {
          // 首次加载：直接使用当前页数据
          combinedData = currentPageData;
        }
        
        // 按距离排序（由近到远）
        var sortedData = this.sortByDistance(combinedData);
        
        // 更新数据状态
        this.setData({
          allHalls: sortedData,
          filteredHalls: sortedData,
          currentPage: currentPage,
          hasMore: hasMoreData,
          loading: false,
          loadingMore: false,
          isLoading: false
        }, () => {
          // 数据加载完成后检查收藏状态
          this.checkFavoriteStatus();
        });
        
        console.log(`数据设置完成，共加载${sortedData.length}条数据，是否还有更多: ${hasMoreData}`);
        
        // 显示加载完成提示
        if (!hasMoreData && sortedData.length > 0) {
          wx.showToast({
            title: '已加载全部数据',
            icon: 'success',
            duration: 1500
          });
        }
      })
      .catch(err => {
        console.error('云端数据加载失败:', err);
        // 重置加载状态
        this.setData({
          loading: false,
          loadingMore: false
        });
        
        // 如果云端数据加载失败，回退到模拟数据
        if (!isLoadMore) {
          this.loadMockData();
        } else {
          wx.showToast({
            title: '加载失败',
            icon: 'error'
          });
        }
      });
  },

  // 计算两点之间的距离（使用Haversine公式）
  calculateDistance(hall) {
    const userLocation = this.data.userLocation;
    if (!userLocation || !hall.latitude || !hall.longitude) {
      return null; // 无法计算距离
    }
    
    const R = 6371; // 地球半径（公里）
    const dLat = this.deg2rad(hall.latitude - userLocation.latitude);
    const dLon = this.deg2rad(hall.longitude - userLocation.longitude);
    
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(userLocation.latitude)) * Math.cos(this.deg2rad(hall.latitude)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // 距离（公里）
    
    return Math.round(distance * 100) / 100; // 保留两位小数
  },

  // 角度转弧度
  deg2rad(deg) {
    return deg * (Math.PI/180);
  },

  // 格式化距离文本
  formatDistance(distance) {
    if (distance === null) return '距离未知';
    if (distance < 1) {
      return `${Math.round(distance * 1000)}米`; // 小于1公里显示米
    }
    return `${distance}公里`;
  },

  // 按距离排序（由近到远）
  sortByDistance(data) {
    const userLocation = this.data.userLocation;
    if (!userLocation) {
      return data; // 没有位置信息，不排序
    }
    
    return [...data].sort((a, b) => {
      // 有距离的排在前面，距离未知的排在后面
      if (a.distance === null && b.distance === null) return 0;
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      
      return a.distance - b.distance; // 由近到远排序
    });
  },

  // 生成随机图片URL
  generateRandomImage(index) {
    const danceImages = [
      'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400',
      'https://images.unsplash.com/photo-1504609813442-a8924e83f76e?w=400',
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400',
      'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400',
      'https://images.unsplash.com/photo-1524368535928-5d8b7f0c7d1b?w=400',
      'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400'
    ];
    return danceImages[index % danceImages.length];
  },

  // 加载模拟数据（备用方案）
  loadMockData() {
    const mockData = [
      {
        _id: '1',
        name: '星光舞厅',
        address: '北京市朝阳区三里屯',
        image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400',
        rating: 4.8,
        isFavorite: false,
        isNew: true,
        hasDiscount: true
      },
      {
        _id: '2', 
        name: '梦幻舞蹈空间',
        address: '上海市徐汇区淮海中路',
        image: 'https://images.unsplash.com/photo-1504609813442-a8924e83f76e?w=400',
        rating: 4.6,
        isFavorite: true,
        isNew: false,
        hasDiscount: true
      },
      {
        _id: '3',
        name: '炫彩舞厅',
        address: '广州市天河区珠江新城',
        image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400',
        rating: 4.7,
        isFavorite: false,
        isNew: true,
        hasDiscount: false
      },
      {
        _id: '4',
        name: '音乐之夜',
        address: '深圳市南山区科技园',
        image: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400',
        rating: 4.5,
        isFavorite: false,
        isNew: false,
        hasDiscount: true
      },
      {
        _id: '5',
        name: '星空舞会',
        address: '成都市武侯区天府三街',
        image: 'https://images.unsplash.com/photo-1524368535928-5d8b7f0c7d1b?w=400',
        rating: 4.9,
        isFavorite: true,
        isNew: false,
        hasDiscount: false
      },
      {
        _id: '6',
        name: '时尚舞厅',
        address: '杭州市西湖区文三路',
        image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400',
        rating: 4.4,
        isFavorite: false,
        isNew: true,
        hasDiscount: true
      }
    ];
    
    this.setData({
      allHalls: mockData,
      filteredHalls: mockData,
      loading: false,
      isLoading: false
    }, () => {
      console.log('数据加载完成:', this.data.filteredHalls);
    });
  },

  // 搜索输入事件
  onSearchInput(e) {
    const value = e.detail.value;
    this.setData({ 
      searchText: value,
      showSearchHistory: value.trim() === '' // 空值时显示搜索历史
    });
    
    // 实时获取搜索建议
    this.getSearchSuggestions(value);
    
    // 防抖搜索
    this.debouncedSearch();
  },

  // 清除搜索
  onClearSearch() {
    this.setData({ 
      searchText: "",
      activeFilter: 0,
      showSearchHistory: true,
      searchSuggestions: []
    });
    // 重新加载真实数据
    this.loadRealData(false);
  },

  // 搜索焦点
  onSearchFocus() {
    // 可以添加搜索框的焦点动画
    console.log('搜索框获得焦点');
  },

  // 筛选器切换
  onFilterToggle() {
    wx.showActionSheet({
      itemList: ['高级筛选', '排序方式', '地图模式', '取消'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.showAdvancedFilter();
        } else if (res.tapIndex === 1) {
          this.showSortOptions();
        } else if (res.tapIndex === 2) {
          this.switchToMapMode();
        }
      }
    });
  },

  // 筛选标签点击
  onFilterTagTap(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ activeFilter: index });
    this.filterByTag(index);
  },

  // 根据标签筛选
  filterByTag(tagIndex) {
    const allHalls = this.data.allHalls;
    let filtered = allHalls;
    
    switch(tagIndex) {
      case 0: // 全部
        filtered = allHalls;
        break;
      case 1: // 热门推荐
        filtered = allHalls.filter(hall => hall.rating >= 4.5);
        break;
      case 2: // 附近
        if (this.data.userLocation) {
          // 只显示距离在10公里以内的舞厅
          filtered = allHalls.filter(hall => hall.distance !== null && hall.distance <= 10);
        } else {
          // 没有位置信息，显示提示
          wx.showToast({
            title: '请开启位置权限',
            icon: 'none'
          });
          filtered = allHalls;
        }
        break;
      case 3: // 评分高
        filtered = [...allHalls].sort((a, b) => b.rating - a.rating);
        break;
      case 4: // 新开业
        filtered = allHalls.filter(hall => hall.isNew);
        break;
      case 5: // 有优惠
        filtered = allHalls.filter(hall => hall.hasDiscount);
        break;
    }
    
    this.setData({ filteredHalls: filtered });
  },

  // 高级筛选
  showAdvancedFilter() {
    wx.showModal({
      title: '高级筛选',
      content: '此功能正在开发中',
      showCancel: false
    });
  },

  // 排序选项
  showSortOptions() {
    wx.showActionSheet({
      itemList: ['按评分排序', '按距离排序', '按价格排序', '按名称排序', '取消'],
      success: (res) => {
        const halls = this.data.filteredHalls;
        let sorted = [...halls];
        
        switch(res.tapIndex) {
          case 0: // 评分
            sorted.sort((a, b) => b.rating - a.rating);
            break;
          case 1: // 距离
            sorted.sort((a, b) => a.name.localeCompare(b.name));
            break;
          case 2: // 价格
            sorted.sort((a, b) => a.name.localeCompare(b.name));
            break;
          case 3: // 名称
            sorted.sort((a, b) => a.name.localeCompare(b.name));
            break;
        }
        
        if (res.tapIndex < 4) {
          this.setData({ filteredHalls: sorted });
        }
      }
    });
  },

  // 地图模式
  switchToMapMode() {
    wx.showModal({
      title: '地图模式',
      content: '地图功能正在开发中',
      showCancel: false
    });
  },

  // 切换收藏状态（云同步）
  onToggleFavorite(e) {
    e.stopPropagation();
    const hallId = e.currentTarget.dataset.id;
    const hall = this.data.filteredHalls.find(h => h._id === hallId);
    if (!hall) return;
    
    const isFavorite = !hall.isFavorite;
    
    // 立即更新界面状态
    const updatedHalls = this.data.filteredHalls.map(hall => {
      if (hall._id === hallId) {
        return {
          ...hall,
          isFavorite: isFavorite
        };
      }
      return hall;
    });
    
    this.setData({ filteredHalls: updatedHalls });
    
    // 云同步收藏状态
    this.syncFavoriteStatus(hallId, hall.name, isFavorite);
    
    // 记录用户行为
    const { analytics } = require('../../utils/analytics.js');
    analytics.trackFeatureUsage('favorite_toggle', {
      hallId: hallId,
      hallName: hall.name,
      action: isFavorite ? 'add' : 'remove'
    });
  },

  // 同步收藏状态到云端
  syncFavoriteStatus(hallId, hallName, isFavorite) {
    const db = wx.cloud.database();
    
    if (isFavorite) {
      // 添加收藏
      db.collection('user_favorites').add({
        data: {
          hall_id: hallId,
          hall_name: hallName,
          create_time: new Date()
        }
      }).then(res => {
        console.log('收藏成功:', res);
        wx.showToast({
          title: '已收藏',
          icon: 'success'
        });
        
        // 通知收藏页面更新
        this.notifyCollectionPage();
      }).catch(err => {
        console.error('收藏失败:', err);
        // 恢复界面状态
        const restoredHalls = this.data.filteredHalls.map(hall => {
          if (hall._id === hallId) {
            return { ...hall, isFavorite: false };
          }
          return hall;
        });
        this.setData({ filteredHalls: restoredHalls });
        wx.showToast({
          title: '收藏失败',
          icon: 'error'
        });
      });
    } else {
      // 取消收藏
      db.collection('user_favorites')
        .where({
          hall_id: hallId
        })
        .remove()
        .then(res => {
          console.log('取消收藏成功:', res);
          wx.showToast({
            title: '已取消收藏',
            icon: 'success'
          });
          
          // 通知收藏页面更新
          this.notifyCollectionPage();
        })
        .catch(err => {
          console.error('取消收藏失败:', err);
          // 恢复界面状态
          const restoredHalls = this.data.filteredHalls.map(hall => {
            if (hall._id === hallId) {
              return { ...hall, isFavorite: true };
            }
            return hall;
          });
          this.setData({ filteredHalls: restoredHalls });
          wx.showToast({
            title: '取消收藏失败',
            icon: 'error'
          });
        });
    }
  },

  // 通知收藏页面更新
  notifyCollectionPage() {
    const pages = getCurrentPages();
    const collectionPage = pages.find(page => page.route === 'pages/collection/collection');
    if (collectionPage) {
      collectionPage.loadCollections();
    }
  },

  // 检查舞厅收藏状态（从云端加载）
  checkFavoriteStatus() {
    const db = wx.cloud.database();
    
    db.collection('user_favorites')
      .get()
      .then(res => {
        const favoriteIds = res.data.map(fav => fav.hall_id);
        const updatedHalls = this.data.allHalls.map(hall => ({
          ...hall,
          isFavorite: favoriteIds.includes(hall._id)
        }));
        
        this.setData({
          allHalls: updatedHalls,
          filteredHalls: updatedHalls
        });
        
        console.log('收藏状态同步完成:', favoriteIds.length, '个收藏');
      })
      .catch(err => {
        console.error('获取收藏状态失败:', err);
      });
  },

  // 导航到详情页
  navigateToDetail(e) {
    const index = e.currentTarget.dataset.index;
    const hall = this.data.filteredHalls[index];
    if (hall) {
      // 将舞厅数据编码后传递到详情页
      const hallData = encodeURIComponent(JSON.stringify(hall));
      wx.navigateTo({
        url: `/pages/detail/detail?hallData=${hallData}`
      });
    } else {
      wx.showToast({
        title: '舞厅数据异常',
        icon: 'error'
      });
    }
  },

  // 图片加载错误处理
  onImageError(e) {
    const index = e.currentTarget.dataset.index;
    const halls = this.data.filteredHalls || [];
    if (halls[index]) {
      halls[index].image = '/assets/images/placeholder.png';
      this.setData({ filteredHalls: halls });
    }
  },

  // 重置筛选
  onResetFilters() {
    this.setData({ 
      searchText: "",
      activeFilter: 0 
    });
    this.setData({ filteredHalls: this.data.allHalls });
    
    wx.showToast({
      title: '筛选已重置',
      icon: 'success'
    });
  },

  // 刷新数据
  onRefresh() {
    this.setData({ loading: true });
    
        // 重新从云端加载数据
        this.loadRealData(false);
  },

  // 请求位置权限
  onRequestLocationPermission() {
    this.getUserLocation();
  },

  // 地图切换
  onMapToggle() {
    wx.showModal({
      title: '地图模式',
      content: '地图功能即将上线，敬请期待！',
      showCancel: false
    });
  },

  // 排序选项
  onSortToggle() {
    wx.showActionSheet({
      itemList: ['距离最近', '评分最高', '价格最低', '名称排序', '取消'],
      success: (res) => {
        const halls = this.data.allHalls;
        let sorted = [...halls];
        
        switch(res.tapIndex) {
          case 0: // 距离最近
            sorted = this.sortByDistance(halls);
            break;
          case 1: // 评分最高
            sorted.sort((a, b) => b.rating - a.rating);
            break;
          case 2: // 价格最低
            // 这里可以根据实际价格数据排序
            sorted.sort((a, b) => a.name.localeCompare(b.name));
            break;
          case 3: // 名称排序
            sorted.sort((a, b) => a.name.localeCompare(b.name));
            break;
        }
        
        if (res.tapIndex < 4) {
          this.setData({ 
            filteredHalls: sorted,
            activeFilter: 0 // 重置筛选
          });
          
          wx.showToast({
            title: '排序已更新',
            icon: 'success'
          });
        }
      }
    });
  },

  // 回到顶部
  onBackToTop() {
    wx.pageScrollTo({
      scrollTop: 0,
      duration: 300
    });
  },

  // 页面滚动事件
  onPageScroll(e) {
    if (e.scrollTop > 300) {
      if (!this.data.showBackToTop) {
        this.setData({ showBackToTop: true });
      }
    } else {
      if (this.data.showBackToTop) {
        this.setData({ showBackToTop: false });
      }
    }
  },

  // 搜索输入处理
  onSearchInput(e) {
    this.setData({ searchText: e.detail.value });
    this.debouncedSearch();
  },

  // 搜索确认
  onSearchConfirm(e) {
    const value = e.detail.value;
    if (value.trim()) {
      // 添加到搜索历史
      this.addSearchHistory(value);
      this.setData({ 
        searchText: value,
        showSearchHistory: false
      });
      this.filterHalls();
    }
  },

  // 点击搜索历史项
  onHistoryItemTap(e) {
    const keyword = e.currentTarget.dataset.keyword;
    this.setData({
      searchText: keyword,
      showSearchHistory: false
    });
    this.addSearchHistory(keyword);
    this.filterHalls();
  },

  // 点击搜索建议项
  onSuggestionItemTap(e) {
    const suggestion = e.currentTarget.dataset.suggestion;
    const keyword = suggestion.name || suggestion;
    this.setData({
      searchText: keyword,
      showSearchHistory: false
    });
    this.addSearchHistory(keyword);
    this.filterHalls();
  },

  // 搜索框获得焦点
  onSearchFocus() {
    const searchText = this.data.searchText;
    this.setData({
      showSearchHistory: !searchText.trim(),
      searchSuggestions: []
    });
  },

  // 搜索框失去焦点
  onSearchBlur() {
    // 延迟隐藏搜索历史，避免点击时无法响应
    setTimeout(() => {
      this.setData({
        showSearchHistory: false
      });
    }, 200);
  },

  // 筛选标签点击
  onFilterTap(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ activeFilter: index });
    this.applyFilter(index);
  },

  // 应用筛选
  applyFilter(filterIndex) {
    let filtered = [...this.data.allHalls];
    
    switch(filterIndex) {
      case 0: // 全部
        break;
      case 1: // 营业中
        filtered = filtered.filter(hall => hall.status === '营业中');
        break;
      case 2: // 附近
        filtered = filtered.sort((a, b) => {
          const distanceA = parseFloat(a.distance);
          const distanceB = parseFloat(b.distance);
          return distanceA - distanceB;
        });
        break;
      case 3: // 推荐
        filtered = filtered.filter(hall => hall.status === '营业中')
                          .sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
        break;
    }
    
    // 如果有搜索文本，继续应用搜索过滤
    if (this.data.searchText) {
      const searchText = this.data.searchText.toLowerCase();
      filtered = filtered.filter(hall => {
        return hall.name.toLowerCase().includes(searchText) ||
               hall.address.toLowerCase().includes(searchText);
      });
    }
    
    this.setData({ filteredHalls: filtered });
  },

  // 加载搜索历史
  loadSearchHistory() {
    const searchHistory = wx.getStorageSync('search_history') || [];
    this.setData({ searchHistory: searchHistory.slice(0, 10) }); // 最多显示10条
  },

  // 添加搜索历史
  addSearchHistory(keyword) {
    if (!keyword.trim()) return;
    
    let searchHistory = wx.getStorageSync('search_history') || [];
    // 移除重复的关键字
    searchHistory = searchHistory.filter(item => item !== keyword);
    // 添加到最前面
    searchHistory.unshift(keyword);
    // 保持最多10条记录
    searchHistory = searchHistory.slice(0, 10);
    
    wx.setStorageSync('search_history', searchHistory);
    this.setData({ searchHistory });
  },

  // 清除搜索历史
  clearSearchHistory() {
    wx.setStorageSync('search_history', []);
    this.setData({ searchHistory: [] });
    
    wx.showToast({
      title: '搜索历史已清除',
      icon: 'success'
    });
  },

  // 获取搜索建议（基于云端数据）
  getSearchSuggestions(keyword) {
    if (!keyword.trim()) {
      this.setData({ searchSuggestions: [] });
      return;
    }

    const db = wx.cloud.database();
    const _ = db.command;
    
    db.collection('dance_halls')
      .where(_.or([
        { name: db.RegExp({
          regexp: keyword,
          options: 'i'
        })},
        { address: db.RegExp({
          regexp: keyword,
          options: 'i'
        })},
        { city: db.RegExp({
          regexp: keyword,
          options: 'i'
        })}
      ]))
      .limit(5)
      .get()
      .then(res => {
        const suggestions = res.data.map(hall => ({
          name: hall.name,
          address: hall.address,
          city: hall.city
        }));
        this.setData({ searchSuggestions: suggestions });
      })
      .catch(err => {
        console.error('获取搜索建议失败:', err);
        this.setData({ searchSuggestions: [] });
      });
  },

  // 滚动事件处理
  onScroll(e) {
    const scrollTop = e.detail.scrollTop;
    const scrollHeight = e.detail.scrollHeight;
    const clientHeight = e.detail.clientHeight;
    
    // 显示/隐藏回到顶部按钮
    if (scrollTop > 300) {
      if (!this.data.showBackToTop) {
        this.setData({ showBackToTop: true });
      }
    } else {
      if (this.data.showBackToTop) {
        this.setData({ showBackToTop: false });
      }
    }
    
    // 检查是否滚动到底部（距离底部50像素内）
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    if (distanceToBottom < 50 && this.data.hasMore && !this.data.loadingMore) {
      console.log('滚动到底部，开始加载更多数据...');
      this.loadMoreData();
    }
    
    // 性能监控：记录滚动行为
    const { analytics } = require('../../utils/analytics.js');
    analytics.trackFeatureUsage('scroll_interaction', {
      scrollTop: scrollTop,
      scrollDirection: scrollTop > (this._lastScrollTop || 0) ? 'down' : 'up'
    });
    this._lastScrollTop = scrollTop;
  },
  
  // 加载更多数据
  loadMoreData() {
    if (this.data.loadingMore || !this.data.hasMore) {
      return;
    }
    
    console.log('开始加载更多数据...');
    this.loadRealData(true); // true表示加载更多
  },

  // 回到顶部
  backToTop() {
    // 对于scroll-view，需要设置scroll-top属性
    this.setData({ scrollTop: 0 });
    setTimeout(() => {
      this.setData({ scrollTop: null });
    }, 300);
  },

  // 通用搜索筛选
  filterHalls() {
    this.applyFilter(this.data.activeFilter);
    
    // 记录搜索行为
    const { analytics } = require('../../utils/analytics.js');
    analytics.trackFeatureUsage('search', {
      searchText: this.data.searchText,
      filterIndex: this.data.activeFilter
    });
  },
  
  // 检查网络状态
  checkNetworkStatus() {
    wx.getNetworkType({
      success: (res) => {
        const networkType = res.networkType;
        if (networkType === 'none') {
          wx.showToast({
            title: '网络连接不可用',
            icon: 'none',
            duration: 3000
          });
        }
        
        // 记录网络状态
        const { analytics } = require('../../utils/analytics.js');
        analytics.trackFeatureUsage('network_status', {
          networkType: networkType
        });
      }
    });
  },
  
  // 图片加载优化
  onImageLoad(e) {
    const index = e.currentTarget.dataset.index;
    const { analytics } = require('../../utils/analytics.js');
    analytics.trackPerformance('image_load_time', Date.now() - this._imageLoadStartTime);
    
    // 图片加载成功，可以添加淡入动画
    if (this.data.filteredHalls[index]) {
      const key = `filteredHalls[${index}].imageLoaded`;
      this.setData({
        [key]: true
      });
    }
  },
  
  // 图片加载开始
  onImageLoadStart(e) {
    this._imageLoadStartTime = Date.now();
  },
  
  // 下拉刷新
  onPullDownRefresh() {
    const { analytics } = require('../../utils/analytics.js');
    analytics.trackFeatureUsage('pull_to_refresh');
    
    // 重置分页状态，重新从第一页加载
    this.setData({ 
      loading: true,
      currentPage: 1,
      hasMore: true,
      loadingMore: false
    });
    this.loadRealData(false); // false表示重新加载而不是加载更多
    
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 1000);
  },
  
  // 分享功能
  onShareAppMessage() {
    const { analytics } = require('../../utils/analytics.js');
    analytics.trackFeatureUsage('share_app');
    
    return {
      title: '舞厅小程序 - 发现附近优质舞厅',
      path: '/pages/index/index',
      imageUrl: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400'
    };
  },
  
  // 页面卸载时清理
  onUnload() {
    // 清理临时数据
    this._lastScrollTop = null;
    this._imageLoadStartTime = null;
  }
})
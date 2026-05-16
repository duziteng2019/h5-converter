/**
 * 浏览历史记录工具类
 * 支持云端同步和本地缓存
 */

class BrowsingHistory {
  constructor() {
    this.maxRecords = 50; // 最大记录数
    this.syncEnabled = true; // 是否启用云端同步
  }

  /**
   * 记录浏览历史
   * @param {string} hallId - 舞厅ID
   * @param {string} hallName - 舞厅名称
   */
  async recordBrowsing(hallId, hallName) {
    try {
      const timestamp = new Date();
      
      // 同时记录到本地和云端
      await Promise.all([
        this.recordToLocal(hallId, hallName, timestamp),
        this.syncEnabled ? this.recordToCloud(hallId, hallName, timestamp) : Promise.resolve()
      ]);
      
      console.log('浏览历史记录成功:', hallName);
    } catch (error) {
      console.error('记录浏览历史失败:', error);
      // 即使云端失败，也要保证本地记录
      await this.recordToLocal(hallId, hallName, new Date());
    }
  }

  /**
   * 记录到本地存储
   */
  async recordToLocal(hallId, hallName, timestamp) {
    try {
      let history = wx.getStorageSync('dance_hall_history') || [];
      
      // 去重处理
      history = history.filter(record => record.hallId !== hallId);
      
      // 添加新记录
      history.unshift({
        hallId,
        hallName,
        timestamp: timestamp.getTime()
      });
      
      // 限制记录数量
      if (history.length > this.maxRecords) {
        history = history.slice(0, this.maxRecords);
      }
      
      wx.setStorageSync('dance_hall_history', history);
    } catch (error) {
      console.error('本地记录失败:', error);
    }
  }

  /**
   * 记录到云端
   */
  async recordToCloud(hallId, hallName, timestamp) {
    return new Promise((resolve, reject) => {
      const db = wx.cloud.database();
      
      // 先检查是否已存在
      db.collection('user_browsing_history')
        .where({
          hall_id: hallId
        })
        .get()
        .then(res => {
          if (res.data.length > 0) {
            // 更新现有记录
            return db.collection('user_browsing_history')
              .doc(res.data[0]._id)
              .update({
                data: {
                  view_time: timestamp
                }
              });
          } else {
            // 添加新记录
            return db.collection('user_browsing_history')
              .add({
                data: {
                  hall_id: hallId,
                  hall_name: hallName,
                  view_time: timestamp
                }
              });
          }
        })
        .then(res => {
          resolve(res);
        })
        .catch(err => {
          reject(err);
        });
    });
  }

  /**
   * 获取浏览历史
   */
  async getHistory() {
    try {
      if (this.syncEnabled) {
        try {
          const cloudHistory = await this.getCloudHistory();
          if (cloudHistory && cloudHistory.length > 0) {
            return cloudHistory;
          }
        } catch (error) {
          console.warn('获取云端历史失败，使用本地数据:', error);
        }
      }
      
      // 使用本地数据
      return this.getLocalHistory();
    } catch (error) {
      console.error('获取浏览历史失败:', error);
      return [];
    }
  }

  /**
   * 获取云端历史
   */
  async getCloudHistory() {
    return new Promise((resolve, reject) => {
      const db = wx.cloud.database();
      
      db.collection('user_browsing_history')
        .orderBy('view_time', 'desc')
        .limit(this.maxRecords)
        .get()
        .then(res => {
          resolve(res.data);
        })
        .catch(err => {
          reject(err);
        });
    });
  }

  /**
   * 获取本地历史
   */
  getLocalHistory() {
    try {
      return wx.getStorageSync('dance_hall_history') || [];
    } catch (error) {
      console.error('获取本地历史失败:', error);
      return [];
    }
  }

  /**
   * 删除单条历史记录
   */
  async deleteRecord(hallId) {
    try {
      await Promise.all([
        this.deleteLocalRecord(hallId),
        this.syncEnabled ? this.deleteCloudRecord(hallId) : Promise.resolve()
      ]);
    } catch (error) {
      console.error('删除历史记录失败:', error);
      // 即使云端失败，也要保证本地删除
      await this.deleteLocalRecord(hallId);
    }
  }

  /**
   * 删除本地记录
   */
  deleteLocalRecord(hallId) {
    try {
      let history = wx.getStorageSync('dance_hall_history') || [];
      history = history.filter(record => record.hallId !== hallId);
      wx.setStorageSync('dance_hall_history', history);
    } catch (error) {
      console.error('删除本地记录失败:', error);
    }
  }

  /**
   * 删除云端记录
   */
  deleteCloudRecord(hallId) {
    return new Promise((resolve, reject) => {
      const db = wx.cloud.database();
      
      db.collection('user_browsing_history')
        .where({
          hall_id: hallId
        })
        .remove()
        .then(res => {
          resolve(res);
        })
        .catch(err => {
          reject(err);
        });
    });
  }

  /**
   * 清空所有历史记录
   */
  async clearAll() {
    try {
      await Promise.all([
        this.clearLocal(),
        this.syncEnabled ? this.clearCloud() : Promise.resolve()
      ]);
    } catch (error) {
      console.error('清空历史记录失败:', error);
      // 即使云端失败，也要保证本地清空
      await this.clearLocal();
    }
  }

  /**
   * 清空本地历史
   */
  clearLocal() {
    try {
      wx.setStorageSync('dance_hall_history', []);
    } catch (error) {
      console.error('清空本地历史失败:', error);
    }
  }

  /**
   * 清空云端历史
   */
  clearCloud() {
    return new Promise((resolve, reject) => {
      const db = wx.cloud.database();
      
      db.collection('user_browsing_history')
        .where({
          _openid: db.command.exists(true)
        })
        .remove()
        .then(res => {
          resolve(res);
        })
        .catch(err => {
          reject(err);
        });
    });
  }
}

// 创建全局实例
const browsingHistory = new BrowsingHistory();

module.exports = browsingHistory;
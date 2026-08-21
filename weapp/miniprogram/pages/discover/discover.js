/**
 * 发现（Phase 2）
 * ------------------------------------------------------------
 * PRD 二十四：发现页不是文章 Feed，所有内容最终都回到地图。
 * 两块内容：
 *   1. 本周推荐 —— 推荐指数最高的几个，点了直接进详情
 *   2. 地图专题 —— 每个专题就是一组筛选条件（data/topics.js），
 *      这里顺便把每个专题命中多少个地点算出来显示
 */
const placeUtil = require('../../utils/place.js');
const { TOPICS } = require('../../data/topics.js');
const store = require('../../utils/store.js');
const ui = require('../../utils/ui.js');

const app = getApp();

Page({
  data: {
    topics: [],
    hot: []
  },

  onShow() {
    const list = store.markFavorites(
      placeUtil.decorateAll(placeUtil.getAll(), app.globalData.location));
    this.setData({
      hot: placeUtil.sort(list, 'score').slice(0, 5),
      topics: TOPICS.map((t) => ({
        key: t.key,
        emoji: t.emoji,
        title: t.title,
        count: placeUtil.filter(list, t.filters).length
      }))
    });
  },

  onDetail(e) {
    wx.navigateTo({ url: '/pages/place/place?id=' + e.detail.id });
  },

  onFavorite(e) {
    ui.toggleFavorite(e.detail.id, () => this.onShow());
  },

  onTopicTap(e) {
    wx.navigateTo({ url: '/pages/topic/topic?key=' + e.currentTarget.dataset.key });
  },

  onSearchTap() {
    wx.navigateTo({ url: '/pages/search/search' });
  }
});

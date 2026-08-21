/**
 * 地图专题（Phase 2）
 * ------------------------------------------------------------
 * 专题 = 一组预设筛选条件（见 data/topics.js），
 * 所以这个页面对任何专题都通用，加专题不用加页面。
 * 「在地图上看」把同一组条件交给地图页，回到 PRD 说的「所有内容最终都回到地图」。
 */
const placeUtil = require('../../utils/place.js');
const { TOPIC_MAP } = require('../../data/topics.js');
const store = require('../../utils/store.js');
const ui = require('../../utils/ui.js');

const app = getApp();

Page({
  data: {
    topic: null,
    places: []
  },

  onLoad(query) {
    const topic = TOPIC_MAP[query.key];
    if (!topic) {
      wx.showToast({ title: '专题不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }
    wx.setNavigationBarTitle({ title: topic.title });
    this.topic = topic;
    this.setData({ topic: topic });
    this.load();
  },

  onShow() {
    if (this.topic) this.load();
  },

  load() {
    const all = store.markFavorites(
      placeUtil.decorateAll(placeUtil.getAll(), app.globalData.location));
    const list = placeUtil.sort(placeUtil.filter(all, this.topic.filters), 'distance');
    this.setData({ places: list });
  },

  onDetail(e) {
    wx.navigateTo({ url: '/pages/place/place?id=' + e.detail.id });
  },

  onFavorite(e) {
    ui.toggleFavorite(e.detail.id, () => this.load());
  },

  onViewOnMap() {
    app.globalData.pendingFilters = {
      filters: Object.assign(placeUtil.emptyFilters(), this.topic.filters),
      title: this.topic.emoji + ' ' + this.topic.title
    };
    wx.switchTab({ url: '/pages/map/map' });
  },

  onShareAppMessage() {
    return {
      title: this.topic.title,
      path: '/pages/topic/topic?key=' + this.topic.key
    };
  }
});

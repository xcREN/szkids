/**
 * 搜索（Phase 2）
 * ------------------------------------------------------------
 * 搜的是 utils/place.js 里的同一套数据：名称、区域、分类、地址、标签都能命中。
 * 分类快捷入口本质上也是一次筛选（categories），不是另一套逻辑。
 * 搜索历史存在本地，最多 10 条。
 */
const placeUtil = require('../../utils/place.js');
const { CATEGORIES } = require('../../data/categories.js');
const store = require('../../utils/store.js');
const ui = require('../../utils/ui.js');

const app = getApp();
const HISTORY_KEY = 'search_history';
const HISTORY_MAX = 10;

Page({
  data: {
    keyword: '',
    category: '',      // 当前选中的分类快捷入口
    categories: CATEGORIES,
    history: [],
    results: [],
    totalPlaces: 0,    // 数据库里一共多少个地点，空结果时提示用
    searched: false    // 有没有执行过搜索，用来区分「初始态」和「无结果」
  },

  onLoad() {
    this.setData({
      history: wx.getStorageSync(HISTORY_KEY) || [],
      totalPlaces: placeUtil.getAll().length
    });
  },

  onShow() {
    // 定位可能在别的页面才拿到，这里重新加工一次保证距离是最新的
    this.decorated = store.markFavorites(
      placeUtil.decorateAll(placeUtil.getAll(), app.globalData.location));
    if (this.data.searched) this.runSearch();
  },

  /* ---------------- 输入 ---------------- */

  onInput(e) {
    const kw = e.detail.value;
    this.setData({ keyword: kw });
    // 边打边搜；清空则回到初始态
    if (kw) this.runSearch();
    else this.setData({ results: [], searched: false });
  },

  onConfirm() {
    if (!this.data.keyword.trim()) return;
    this.saveHistory(this.data.keyword.trim());
    this.runSearch();
  },

  onClearInput() {
    this.setData({ keyword: '', category: '', results: [], searched: false });
  },

  onCancel() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/map/map' }) });
  },

  /* ---------------- 搜索 ---------------- */

  /** 当前条件：关键词 + 可选的分类 */
  buildFilters() {
    const f = placeUtil.emptyFilters();
    f.keyword = this.data.keyword.trim();
    if (this.data.category) f.categories = [this.data.category];
    return f;
  },

  runSearch() {
    const list = placeUtil.sort(placeUtil.filter(this.decorated, this.buildFilters()), 'distance');
    this.setData({ results: list, searched: true });
  },

  /** 点分类：既当筛选，也把分类名填进输入框，用户能看懂在搜什么 */
  onCategoryTap(e) {
    const key = e.currentTarget.dataset.key;
    const next = this.data.category === key ? '' : key;
    this.setData({ category: next }, () => {
      if (next) this.saveHistory(CATEGORIES.filter((c) => c.key === next)[0].label);
      this.runSearch();
    });
  },

  /* ---------------- 历史 ---------------- */

  saveHistory(word) {
    let list = wx.getStorageSync(HISTORY_KEY) || [];
    list = [word].concat(list.filter((w) => w !== word)).slice(0, HISTORY_MAX);
    wx.setStorageSync(HISTORY_KEY, list);
    this.setData({ history: list });
  },

  onHistoryTap(e) {
    this.setData({ keyword: e.currentTarget.dataset.word, category: '' }, () => this.runSearch());
  },

  onClearHistory() {
    wx.showModal({
      title: '清空搜索历史',
      content: '确定要清空吗？',
      success: (res) => {
        if (!res.confirm) return;
        wx.removeStorageSync(HISTORY_KEY);
        this.setData({ history: [] });
      }
    });
  },

  /* ---------------- 出口 ---------------- */

  onDetail(e) {
    wx.navigateTo({ url: '/pages/place/place?id=' + e.detail.id });
  },

  onFavorite(e) {
    ui.toggleFavorite(e.detail.id, () => {
      this.decorated = store.markFavorites(this.decorated);
      if (this.data.searched) this.runSearch();
    });
  },

  /** 把当前搜索条件带回地图（switchTab 不能带参数，走 globalData） */
  onViewOnMap() {
    const cat = CATEGORIES.filter((c) => c.key === this.data.category)[0];
    app.globalData.pendingFilters = {
      filters: this.buildFilters(),
      title: this.data.keyword.trim() ? '' : (cat ? cat.label : '')
    };
    wx.switchTab({ url: '/pages/map/map' });
  }
});

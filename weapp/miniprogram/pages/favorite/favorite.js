/**
 * 我的收藏（PRD 二十一）
 * ------------------------------------------------------------
 * 收藏支持分收藏夹：这个周末 / 暑假去 / 下雨天备用 …
 * 顶部按收藏夹过滤，每条下面可以改夹子。
 * 「在地图上看」把这批 id 交给地图页（filters.ids）。
 */
const placeUtil = require('../../utils/place.js');
const store = require('../../utils/store.js');

const app = getApp();

Page({
  data: {
    tabs: [],          // [{name, count, on}]，第一个是「全部」
    active: '',        // '' 表示全部
    list: [],          // 当前收藏夹里的地点（已 decorate + 收藏夹名）
    empty: true
  },

  onShow() {
    this.load();
  },

  load() {
    const favs = store.getFavorites();
    const folderOf = {};
    favs.forEach((f) => {
      folderOf[f.placeId] = f.folder || '';
    });

    // 收藏按收藏时间倒序；地点数据仍走同一套 decorate
    const all = placeUtil.decorateAll(placeUtil.getAll(), app.globalData.location);
    const byId = {};
    all.forEach((p) => {
      byId[p.id] = p;
    });

    let list = favs
      .map((f) => {
        const p = byId[f.placeId];
        // 地点被删掉的情况下跳过，不让页面崩
        return p ? Object.assign({}, p, { favorited: true, folder: f.folder || '未分类' }) : null;
      })
      .filter(Boolean);

    const stats = store.folderStats().filter((s) => s.count > 0);
    const unfiled = list.filter((p) => p.folder === '未分类').length;
    const tabs = [{ name: '', label: '全部', count: list.length }]
      .concat(stats.map((s) => ({ name: s.name, label: s.name, count: s.count })));
    if (unfiled) tabs.push({ name: '未分类', label: '未分类', count: unfiled });

    const active = tabs.some((t) => t.name === this.data.active) ? this.data.active : '';
    if (active) list = list.filter((p) => p.folder === active);

    this.setData({
      tabs: tabs.map((t) => Object.assign({}, t, { on: t.name === active })),
      active: active,
      list: list,
      empty: !favs.length
    });
  },

  onTabTap(e) {
    this.setData({ active: e.currentTarget.dataset.name }, () => this.load());
  },

  onDetail(e) {
    wx.navigateTo({ url: '/pages/place/place?id=' + e.detail.id });
  },

  /** 列表里的心形按钮 = 取消收藏 */
  onUnfavorite(e) {
    const id = e.detail.id;
    wx.showModal({
      title: '取消收藏',
      content: '把这个地点从收藏里移除？',
      success: (res) => {
        if (!res.confirm) return;
        store.removeFavorite(id);
        this.load();
      }
    });
  },

  /** 改收藏夹 */
  onFolderTap(e) {
    const id = e.currentTarget.dataset.id;
    const folders = store.FOLDERS;
    wx.showActionSheet({
      itemList: folders.concat(['移出收藏夹']),
      success: (res) => {
        const folder = res.tapIndex < folders.length ? folders[res.tapIndex] : '';
        store.setFavoriteFolder(id, folder);
        this.load();
      },
      fail: () => {}
    });
  },

  /** 把当前这批收藏放到地图上看 */
  onViewOnMap() {
    const ids = this.data.list.map((p) => p.id);
    if (!ids.length) return;
    app.globalData.pendingFilters = {
      filters: Object.assign(placeUtil.emptyFilters(), { ids: ids }),
      title: '♥ ' + (this.data.active || '全部收藏')
    };
    wx.switchTab({ url: '/pages/map/map' });
  },

  onGoMap() {
    wx.switchTab({ url: '/pages/map/map' });
  }
});

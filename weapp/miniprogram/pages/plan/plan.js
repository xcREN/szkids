/**
 * 周末计划（PRD 二十二，V1 简单版）
 * ------------------------------------------------------------
 * 只做「把收藏排进某一天的上午/中午/下午」，不做路线规划。
 * 底部给出预计时长和路线总距离（按顺序把相邻两点的直线距离加起来，
 * 只是个量级参考，不是导航里程）。
 */
const placeUtil = require('../../utils/place.js');
const store = require('../../utils/store.js');
const geo = require('../../utils/geo.js');

const app = getApp();

const SLOTS = [
  { key: 'am', label: '上午' },
  { key: 'noon', label: '中午' },
  { key: 'pm', label: '下午' }
];

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function fmt(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/** 最近的周六/周日（今天就是的话就取今天） */
function nextWeekday(target) {
  const d = new Date();
  const diff = (target - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return fmt(d);
}

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function dateLabel(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return s;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number(m[2]) + '月' + Number(m[3]) + '日 ' + WEEK[d.getDay()];
}

Page({
  data: {
    date: '',
    dateText: '',
    quick: [],          // [{date,label,on}]
    slots: [],          // [{key,label,places:[]}]
    favorites: [],      // 可以加进来的收藏
    totalHours: 0,
    totalKm: '',
    isEmpty: true
  },

  onLoad(query) {
    const sat = nextWeekday(6);
    const sun = nextWeekday(0);
    this.setData({
      date: query.date || sat,
      quick: [
        { date: sat, label: '本周六' },
        { date: sun, label: '本周日' }
      ]
    });
  },

  onShow() {
    this.load();
  },

  load() {
    const plan = store.planOfDate(this.data.date);
    this.plan = plan;

    const all = placeUtil.decorateAll(placeUtil.getAll(), app.globalData.location);
    const byId = {};
    all.forEach((p) => {
      byId[p.id] = p;
    });

    // 按时段分组
    const slots = SLOTS.map((s) => ({
      key: s.key,
      label: s.label,
      places: plan.items
        .filter((it) => it.slot === s.key)
        .map((it) => byId[it.placeId])
        .filter(Boolean)
    }));

    // 顺序：上午 → 中午 → 下午，用来算总时长和总距离
    const ordered = slots.reduce((acc, s) => acc.concat(s.places), []);
    let hours = 0;
    let km = 0;
    ordered.forEach((p, i) => {
      hours += p.duration || 0;
      if (i > 0) km += geo.distanceKm(ordered[i - 1], p) || 0;
    });

    // 还没排进计划的收藏
    const inPlan = plan.items.map((it) => it.placeId);
    const favorites = store.getFavorites()
      .map((f) => byId[f.placeId])
      .filter((p) => p && inPlan.indexOf(p.id) === -1);

    this.setData({
      dateText: dateLabel(this.data.date),
      quick: this.data.quick.map((q) => Object.assign({}, q, { on: q.date === this.data.date })),
      slots: slots,
      favorites: favorites,
      totalHours: hours,
      totalKm: km ? km.toFixed(1) : '',
      isEmpty: !ordered.length
    });
  },

  onQuickTap(e) {
    this.setData({ date: e.currentTarget.dataset.date }, () => this.load());
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value }, () => this.load());
  },

  /** 把一个收藏加进某个时段 */
  onAdd(e) {
    const placeId = e.currentTarget.dataset.id;
    wx.showActionSheet({
      itemList: SLOTS.map((s) => '加到' + s.label),
      success: (res) => {
        this.plan.items.push({ placeId: placeId, slot: SLOTS[res.tapIndex].key });
        store.savePlan(this.plan);
        this.load();
      },
      fail: () => {}
    });
  },

  onRemove(e) {
    const placeId = e.currentTarget.dataset.id;
    this.plan.items = this.plan.items.filter((it) => it.placeId !== placeId);
    store.savePlan(this.plan);
    this.load();
  },

  onDetail(e) {
    wx.navigateTo({ url: '/pages/place/place?id=' + e.currentTarget.dataset.id });
  },

  onGoFavorite() {
    wx.navigateTo({ url: '/pages/favorite/favorite' });
  },

  /** 把这天的地点放到地图上看 */
  onViewOnMap() {
    const ids = this.plan.items.map((it) => it.placeId);
    if (!ids.length) return;
    app.globalData.pendingFilters = {
      filters: Object.assign(placeUtil.emptyFilters(), { ids: ids }),
      title: '📅 ' + this.data.dateText + ' 的计划'
    };
    wx.switchTab({ url: '/pages/map/map' });
  },

  onShareAppMessage() {
    return { title: this.data.dateText + ' 带娃计划', path: '/pages/plan/plan?date=' + this.data.date };
  }
});

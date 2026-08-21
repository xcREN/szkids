/**
 * 童年地图（PRD 十七 ~ 十九）
 * ------------------------------------------------------------
 * 三块内容：
 *   1. 地图：去过的地点点亮成彩色针，没去过的是灰针（PRD 十八）
 *   2. 成长统计：今年去了多少地方 / 多少个区 / 户外多少次 / 累计陪伴（PRD 十九）
 *   3. 打卡记录：按日期倒序，点进去可以改
 *
 * 数字全部由打卡记录实时算出来（utils/stats.js），不单独存一份。
 */
const placeUtil = require('../../utils/place.js');
const store = require('../../utils/store.js');
const stats = require('../../utils/stats.js');
const geo = require('../../utils/geo.js');

const MARKER_ON = { w: 30, h: 38 };
const MARKER_OFF = { w: 22, h: 28 };

/** 2026-08-08 -> 8月8日 */
function dateText(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
  if (!m) return d || '';
  return Number(m[2]) + '月' + Number(m[3]) + '日';
}

Page({
  data: {
    // 年份切换
    year: 0,
    years: [],          // [{value, label, on}]，value 为 0 表示全部

    exploration: { visited: 0, total: 0, percent: 0 },
    statRows: [],

    // 地图
    latitude: geo.SZ_CENTER.latitude,
    longitude: geo.SZ_CENTER.longitude,
    scale: 10,
    markers: [],

    records: [],
    empty: true
  },

  onLoad() {
    this.setData({ year: new Date().getFullYear() });
  },

  onShow() {
    this.load();
  },

  load() {
    const checkins = store.getCheckins();
    const thisYear = new Date().getFullYear();

    // 有记录的年份 + 今年，倒序；再加一个「全部」
    const years = [];
    checkins.forEach((c) => {
      const y = Number(String(c.date || '').slice(0, 4));
      if (y && years.indexOf(y) === -1) years.push(y);
    });
    if (years.indexOf(thisYear) === -1) years.push(thisYear);
    years.sort((a, b) => b - a);

    const year = years.indexOf(this.data.year) > -1 ? this.data.year : years[0];
    const g = stats.growth(year);

    // 地图：全部地点都画上，去过的用分类彩针，没去过的用灰针
    const visited = store.visitedIds();
    const all = placeUtil.decorateAll(placeUtil.getAll(), null);
    this.mapPlaces = all;
    const markers = all.map((p, i) => {
      const on = visited.indexOf(p.id) > -1;
      const size = on ? MARKER_ON : MARKER_OFF;
      return {
        id: i,
        latitude: p.latitude,
        longitude: p.longitude,
        iconPath: on ? p.markerIcon : '/images/markers/_unvisited.png',
        width: size.w,
        height: size.h,
        anchor: { x: 0.5, y: 1 },
        zIndex: on ? 9 : 1,
        alpha: on ? 1 : 0.7,
        callout: {
          content: p.name,
          color: '#1E241F',
          fontSize: 11,
          borderRadius: 8,
          borderWidth: 0,
          bgColor: '#FFFFFF',
          padding: 6,
          display: 'BYCLICK',
          textAlign: 'center'
        }
      };
    });

    // 记录列表
    const byId = {};
    all.forEach((p) => {
      byId[p.id] = p;
    });
    const children = {};
    store.getChildren().forEach((c) => {
      children[c.id] = c.name;
    });

    const records = checkins
      .filter((c) => !year || String(c.date).slice(0, 4) === String(year))
      .map((c) => {
        const p = byId[c.placeId];
        if (!p) return null;
        return {
          id: c.id,
          placeId: c.placeId,
          date: c.date,
          dateText: dateText(c.date),
          name: p.name,
          emoji: p.categoryEmoji,
          district: p.district,
          childNames: (c.childIds || []).map((id) => children[id]).filter(Boolean).join('、'),
          stars: '★★★★★'.slice(0, c.childRating || 0),
          note: c.note || '',
          photos: c.photos || []
        };
      })
      .filter(Boolean);

    this.setData({
      year: year,
      years: years.map((y) => ({ value: y, label: y + '年', on: y === year })),
      exploration: stats.exploration(),
      statRows: [
        { key: 'places', label: '探索地点', value: g.places },
        { key: 'districts', label: '去过的区', value: g.districts },
        { key: 'outdoor', label: '户外活动', value: g.outdoor },
        { key: 'museum', label: '场馆', value: g.museum },
        { key: 'nature', label: '自然探索', value: g.nature },
        { key: 'hours', label: '累计陪伴', value: g.hours, unit: '小时' }
      ],
      markers: markers,
      records: records,
      empty: !checkins.length
    });
  },

  onYearTap(e) {
    this.setData({ year: Number(e.currentTarget.dataset.year) }, () => this.load());
  },

  /** 点地图上的针：进地点详情 */
  onMarkerTap(e) {
    const p = this.mapPlaces[e.detail.markerId];
    if (p) wx.navigateTo({ url: '/pages/place/place?id=' + p.id });
  },

  onRecordTap(e) {
    wx.navigateTo({ url: '/pages/checkin/checkin?id=' + e.currentTarget.dataset.id });
  },

  onPreviewPhoto(e) {
    const ds = e.currentTarget.dataset;
    wx.previewImage({ current: ds.src, urls: ds.urls });
  },

  onShareCard() {
    wx.navigateTo({ url: '/pages/share/share?year=' + this.data.year });
  },

  onGoMap() {
    wx.switchTab({ url: '/pages/map/map' });
  },

  onShareAppMessage() {
    return { title: '我们的童年地图', path: '/pages/map/map' };
  }
});

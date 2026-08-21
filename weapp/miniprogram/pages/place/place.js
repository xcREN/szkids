/**
 * 地点详情
 * ------------------------------------------------------------
 * PRD 十一 ~ 十四：大图 + 亲子指数 + 推荐年龄 + 推荐理由
 *                 + 家长最关心的信息矩阵 + 不同年龄体验 + 天气适配。
 * 原则四：停车、厕所、年龄、费用、预约、时长，优先级高于长篇介绍。
 */
const placeUtil = require('../../utils/place.js');
const store = require('../../utils/store.js');
const ui = require('../../utils/ui.js');

const app = getApp();

/** 天气维度展示顺序与文案 */
const WEATHER_ROWS = [
  { key: 'sunny', label: '晴天' },
  { key: 'cloudy', label: '阴天' },
  { key: 'lightRain', label: '小雨' },
  { key: 'heavyRain', label: '大雨' },
  { key: 'hot', label: '炎热' },
  { key: 'cold', label: '寒冷' }
];

/** 把 0~5 的分数转成星星；0 分直接标成不推荐 */
function stars(score) {
  if (!score) return '❌';
  return '★★★★★'.slice(0, score) + '☆☆☆☆☆'.slice(0, 5 - score);
}

Page({
  data: {
    place: null,
    favorited: false,
    visitCount: 0,
    lastVisit: '',
    ageRows: [],
    weatherRows: [],
    facts: []
  },

  onShow() {
    // 从打卡页返回时，来过次数和收藏状态都要刷新
    if (this.data.place) this.refreshState();
  },

  /** 收藏状态 + 来过几次 */
  refreshState() {
    const id = this.data.place.id;
    const visits = store.checkinsForPlace(id);
    const last = visits[0];
    this.setData({
      favorited: store.isFavorited(id),
      visitCount: visits.length,
      lastVisit: last ? String(last.date).replace(/^\d{4}-/, '').replace('-', '月') + '日' : ''
    });
  },

  onLoad(query) {
    const raw = placeUtil.getById(query.id);
    if (!raw) {
      wx.showToast({ title: '没有找到这个地点', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }
    const place = placeUtil.decorate(raw, app.globalData.location);

    // 家长最关心的信息矩阵：只列出「确定的事实」，避免模棱两可
    const facts = [
      { emoji: '💰', text: place.priceText },
      { emoji: '🚗', text: place.parkingText },
      { emoji: '🚻', text: place.toilet ? '有卫生间' : '无卫生间' },
      { emoji: '👶', text: place.stroller ? '可推婴儿车' : '不便推婴儿车' },
      { emoji: '🍼', text: place.babyRoom ? '有母婴室' : '无母婴室' },
      { emoji: place.outdoor ? '🌳' : '🏛', text: place.indoor && place.outdoor ? '室内+户外' : (place.indoor ? '室内' : '户外') },
      { emoji: '⏱', text: place.duration + '小时' },
      { emoji: '🍱', text: place.picnic ? '可野餐' : '不便野餐' },
      { emoji: '⛺', text: place.camping ? '可搭帐篷' : '不可搭帐篷' },
      { emoji: '🚲', text: place.cycling ? '可骑行' : '不可骑行' },
      { emoji: '💦', text: place.waterPlay ? '可玩水' : '不可玩水' },
      { emoji: '📅', text: place.reservation ? '需要预约' : '无需预约' }
    ];

    const weatherRows = WEATHER_ROWS.map((w) => {
      const score = (place.weatherTags || {})[w.key] || 0;
      return { label: w.label, stars: stars(score), bad: score === 0 };
    });

    wx.setNavigationBarTitle({ title: place.name });
    this.setData({
      place: place,
      favorited: store.isFavorited(place.id),
      facts: facts,
      ageRows: placeUtil.ageRatingRows(place),
      weatherRows: weatherRows
    });
  },

  /** 打开微信内置地图，可直接一键导航 */
  onNavigate() {
    const p = this.data.place;
    wx.openLocation({
      latitude: p.latitude,
      longitude: p.longitude,
      name: p.name,
      address: p.address,
      scale: 15,
      fail: () => wx.showToast({ title: '打开地图失败', icon: 'none' })
    });
  },

  onCopyAddress() {
    wx.setClipboardData({ data: this.data.place.address });
  },

  /**
   * 打电话确认。
   * 开放时间这类信息最容易过期，与其让用户信一个可能不准的数字，
   * 不如给他一条能当场问清楚的路。没录电话时按钮根本不显示。
   */
  onCall() {
    const phone = this.data.place && this.data.place.phone;
    if (!phone) return;
    wx.makePhoneCall({ phoneNumber: phone, fail: () => {} });
  },

  onFavorite() {
    ui.toggleFavorite(this.data.place.id, (on) => this.setData({ favorited: on }));
  },

  /** 我们来过：去写一条打卡记录 */
  onCheckIn() {
    wx.navigateTo({ url: '/pages/checkin/checkin?placeId=' + this.data.place.id });
  },

  onShareAppMessage() {
    const p = this.data.place;
    return {
      title: p.name + ' · 推荐年龄' + p.ageText,
      path: '/pages/place/place?id=' + p.id
    };
  }
});

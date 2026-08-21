/**
 * 今天去哪（Phase 5）
 * ------------------------------------------------------------
 * PRD 十五：帮用户做决定。整页只回答一个问题——「今天带孩子去哪」。
 *
 * 三块内容，从上到下就是决策过程：
 *   1. 今天什么天气 → 所以适合什么样的地方（给出推荐的前提）
 *   2. 三个候选，每个都写明为什么是它（够选，又不至于要挑）
 *   3. 还是选不出来 → 摇一摇，让它替你定
 *
 * 打分逻辑全在 utils/recommend.js，这个页面只管拿结果和渲染。
 */
const placeUtil = require('../../utils/place.js');
const store = require('../../utils/store.js');
const weatherUtil = require('../../utils/weather.js');
const recommend = require('../../utils/recommend.js');
const ui = require('../../utils/ui.js');
const { groupForAge } = require('../../data/categories.js');

const app = getApp();

/**
 * 摇一摇的判定阈值（单位 g）。
 * 静止时三轴合力约等于 1（只有重力），日常走动大概 1.2~1.5，
 * 2.2 是「明显甩了一下」才会到的量级，不会走两步就误触发。
 */
const SHAKE_THRESHOLD = 2.2;
/** 触发后的冷却，避免一次摇动连着触发好几回 */
const SHAKE_COOLDOWN = 1500;

Page({
  data: {
    loading: true,
    weatherLine: '',      // 「⛅ 阴 32°」
    weatherOk: false,
    weatherStale: false,  // 用的是缓存里的旧值
    advice: '',           // 天气对应的一句话建议
    childLine: '',        // 「按 星星 6岁 挑的」
    list: [],             // 三个候选
    lucky: null,          // 摇一摇/帮我决定 的结果
    shaking: false,
    empty: false
  },

  onLoad() {
    this.load();
  },

  onShow() {
    this.startShake();
  },

  onHide() {
    this.stopShake();
  },

  onUnload() {
    this.stopShake();
  },

  /** 拉定位 → 拉天气 → 打分 → 渲染 */
  load(forceWeather) {
    this.setData({ loading: true });
    return app.ensureLocation().then(({ location }) => {
      return weatherUtil.current(location, { force: forceWeather }).then((w) => {
        this.weather = w;
        this.location = location;
        this.render(w, location);
      });
    });
  },

  render(w, location) {
    const child = store.getActiveChild();
    const age = child ? store.ageOf(child) : null;
    const ageGroup = age === null ? '' : groupForAge(age);

    const decorated = store.markFavorites(
      placeUtil.decorateAll(placeUtil.getAll(), location)
    );
    const ctx = recommend.buildContext(w, ageGroup);
    this.ctx = ctx;
    this.decorated = decorated;

    const picked = recommend.pickTop(decorated, ctx, 3);

    this.setData({
      loading: false,
      weatherOk: !!w.ok,
      weatherStale: !!w.stale,
      weatherLine: weatherUtil.summaryText(w),
      advice: w.ok ? w.advice : '没拿到天气，这次按年龄、兴趣和距离来挑。',
      childLine: child && ageGroup ? '按 ' + child.name + ' ' + age + '岁 挑的' : '',
      list: picked.map((it) => this.toView(it)),
      lucky: null,
      empty: picked.length === 0
    });
  },

  /** 打分结果 → 卡片要用的扁平结构（WXML 里不做复杂表达式） */
  toView(item) {
    const p = item.place;
    return {
      id: p.id,
      name: p.name,
      emoji: p.categoryEmoji,
      categoryLabel: p.categoryLabel,
      district: p.district,
      distanceText: p.distanceText,
      driveText: p.driveText,
      priceText: p.priceText,
      durationText: p.durationText,
      image: (p.images && p.images.length) ? p.images[0] : '',
      color: p.categoryColor,
      favorited: !!p.favorited,
      reasons: item.reasons,
      scoreText: item.score.toFixed(1)
    };
  },

  /* ---------------- 摇一摇 ---------------- */

  startShake() {
    if (this._shakeOn) return;
    this._shakeOn = true;
    this._lastShake = 0;
    this._onAcc = (res) => {
      const mag = Math.sqrt(res.x * res.x + res.y * res.y + res.z * res.z);
      if (mag < SHAKE_THRESHOLD) return;
      const now = Date.now();
      if (now - this._lastShake < SHAKE_COOLDOWN) return;
      this._lastShake = now;
      this.roll(true);
    };
    wx.onAccelerometerChange(this._onAcc);
    wx.startAccelerometer({
      interval: 'normal',
      fail: () => {
        // 有些设备/权限下拿不到重力感应，按钮还在，不影响使用
        this._shakeOn = false;
      }
    });
  },

  stopShake() {
    if (!this._shakeOn) return;
    this._shakeOn = false;
    if (this._onAcc && wx.offAccelerometerChange) wx.offAccelerometerChange(this._onAcc);
    wx.stopAccelerometer({ fail: () => {} });
  },

  /**
   * 抽一个。
   * @param {boolean} byShake 是摇出来的还是点按钮点出来的（只影响震动反馈）
   */
  roll(byShake) {
    if (!this.decorated || this.data.shaking) return;
    const prev = this.data.lucky ? this.data.lucky.id : '';
    const item = recommend.pickRandom(this.decorated, this.ctx, prev);
    if (!item) {
      wx.showToast({ title: '今天这天气没有合适的地点', icon: 'none' });
      return;
    }
    if (byShake) wx.vibrateShort({ type: 'medium', fail: () => {} });

    // 先亮一下再出结果，让「摇」这个动作有反馈，不然像卡了一下
    this.setData({ shaking: true });
    setTimeout(() => {
      this.setData({ lucky: this.toView(item), shaking: false });
    }, 320);
  },

  onLuckyTap() {
    this.roll(false);
  },

  /* ---------------- 其他交互 ---------------- */

  /** 换一批：重新抽三个（天气不用重拉，缓存内直接用） */
  onRefresh() {
    if (!this.decorated) return;
    const picked = recommend.pickTop(this.decorated, this.ctx, 3);
    this.setData({ list: picked.map((it) => this.toView(it)), lucky: null });
  },

  /** 手动刷新天气 */
  onWeatherTap() {
    wx.showLoading({ title: '刷新天气', mask: true });
    this.load(true).then(() => wx.hideLoading());
  },

  onCardTap(e) {
    wx.navigateTo({ url: '/pages/place/place?id=' + e.currentTarget.dataset.id });
  },

  onFavorite(e) {
    const id = e.currentTarget.dataset.id;
    ui.toggleFavorite(id, (on) => {
      this.decorated = this.decorated.map((p) =>
        p.id === id ? Object.assign({}, p, { favorited: on }) : p);
      const patch = {};
      this.data.list.forEach((it, i) => {
        if (it.id === id) patch['list[' + i + '].favorited'] = on;
      });
      if (this.data.lucky && this.data.lucky.id === id) patch['lucky.favorited'] = on;
      this.setData(patch);
    });
  },

  onShareAppMessage() {
    const first = this.data.list[0];
    return {
      title: first ? '今天带娃去' + first.name + '？' : '今天带孩子去哪',
      path: '/pages/map/map'
    };
  }
});

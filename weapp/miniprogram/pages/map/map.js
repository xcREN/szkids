/**
 * 首页 · 深圳亲子地图
 * ------------------------------------------------------------
 * 原则一「地图第一」：打开就是地图，不做信息流。
 * 流程：拿定位 → 加工地点数据（算距离）→ 按筛选条件生成 Marker
 *      → 点 Marker 弹地点卡片 → 进详情页。
 *
 * 筛选：this.data.filters 是唯一事实来源（结构见 utils/place.js 的 emptyFilters）。
 *      顶部快捷 chip 和「更多筛选」面板改的都是同一个对象，
 *      搜索页 / 专题页也通过 app.globalData.pendingFilters 把条件带进来。
 *
 * Marker：map 组件要求 marker.id 是数字，所以用数组下标当 id，
 *        再通过 this.visible[index] 反查真实地点。
 */
const placeUtil = require('../../utils/place.js');
const geo = require('../../utils/geo.js');
const store = require('../../utils/store.js');
const ui = require('../../utils/ui.js');
const weatherUtil = require('../../utils/weather.js');
const { AGE_GROUPS, groupForAge } = require('../../data/categories.js');

const app = getApp();

/** Marker 尺寸（px）：选中的那个放大，便于看清当前选择 */
const MARKER_SIZE = { w: 32, h: 40 };
const MARKER_SIZE_ON = { w: 44, h: 55 };

Page({
  data: {
    // 地图视野
    latitude: geo.SZ_CENTER.latitude,
    longitude: geo.SZ_CENTER.longitude,
    scale: 11,
    markers: [],

    // 顶部
    city: '深圳',
    locatedOk: false,
    locationFuzzy: true,   // 微信只给模糊定位时，底部要说明距离是大致值
    statusBarHeight: 20,   // 自定义导航栏，需要自己避开状态栏和右上角胶囊
    weatherLine: '天气加载中…',   // 顶栏那一行，由 utils/weather.js 拼好

    // 筛选
    filters: placeUtil.emptyFilters(),
    chip: { nearby: false, free: false, outdoor: false, age: '孩子年龄', more: 0 },
    showFilter: false,     // 筛选面板是否展开
    draftCount: 0,         // 面板里「查看 N 个地点」的 N
    topicTitle: '',        // 从专题进来时显示的横幅
    childTitle: '',        // 「按 星星 6岁 推荐」
    bannerText: '',        // 横幅文案，由 syncChips 拼好

    // 区域搜索
    canSearchRegion: false, // 拖动地图后出现「搜索这片区域」
    regionLocked: false,    // 是否已限定在某个可视范围内

    /**
     * 'map' | 'list'。同一套筛选结果换个看法：
     * 地图回答「我附近有什么」，列表回答「这几个里挑哪个」。
     * 筛选状态是共用的，切视图不会丢条件。
     */
    viewMode: 'map',
    listPlaces: [],        // 只在列表模式下填，见 applyFilters

    // 结果
    total: 0,
    selected: null         // 当前选中的地点（决定底部卡片是否显示）
  },

  onLoad() {
    /**
     * 这三行必须在**任何 setData 之前**。
     *
     * setData 会触发首次渲染，渲染会创建 filter-panel 组件，
     * 而组件的属性观察器会同步抛一次 change 事件 —— 回调 onFilterChange
     * 里要读 this.decorated。放在 setData 后面初始化的话，那一次回调读到的是
     * undefined，直接 TypeError（虽然不影响功能，但控制台一直挂着个红叉）。
     */
    this.allPlaces = placeUtil.getAll();
    this.decorated = [];   // 加工后的全部地点
    this.visible = [];     // 当前筛选命中的地点

    // 状态栏高度：兼容新旧基础库
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      this.setData({ statusBarHeight: info.statusBarHeight || 20 });
    } catch (e) {
      // 取不到就用默认值，不影响功能
    }
    this.applyChildDefault(true);   // 原则二：先按孩子的年龄筛
    this.refresh();
  },

  onShow() {
    // 搜索页 / 专题页 / 发现页把条件放在 globalData 里，切到地图时取一次
    const pending = app.globalData.pendingFilters;
    if (pending) {
      app.globalData.pendingFilters = null;
      const filters = Object.assign(placeUtil.emptyFilters(), pending.filters || {});
      this.setData(
        { filters: filters, topicTitle: pending.title || '', selected: null, regionLocked: false },
        () => {
          this.syncChips();
          this.applyFilters();
          this.fitToResults();
        }
      );
      return;
    }
    if (!this.decorated || !this.decorated.length) return;
    // 在「我的」里换了当前孩子，回到地图要跟着变
    const child = store.getActiveChild();
    const cid = child ? child.id : '';
    if (cid !== this._appliedChildId) this.applyChildDefault();
    else this.applyFilters();
  },

  /**
   * 按当前孩子的年龄预设年龄筛选（PRD 原则二：儿童年龄第一）。
   * 这个默认值是「看得见」的：年龄 chip 会高亮，横幅会写明按谁筛的，
   * 点横幅上的「清除」就能回到全部，不做用户看不见的暗改。
   */
  applyChildDefault(silent) {
    const child = store.getActiveChild();
    const age = child ? store.ageOf(child) : null;
    const group = age === null ? '' : groupForAge(age);
    this._appliedChildId = child ? child.id : '';

    const next = {
      childTitle: child && group ? '按 ' + child.name + ' ' + age + '岁 推荐' : '',
      filters: Object.assign({}, this.data.filters, { ageGroup: group })
    };
    if (silent) {
      // onLoad 阶段数据还没加工好，只写状态，等 refresh 里统一算
      this.setData(next, () => this.syncChips());
      return;
    }
    this.setData(next, () => {
      this.syncChips();
      this.applyFilters();
    });
  },

  /** 拿定位 → 重新加工数据 → 应用筛选 */
  refresh(force) {
    return app.ensureLocation(force).then(({ location, ok }) => {
      this.decorated = store.markFavorites(placeUtil.decorateAll(this.allPlaces, location));
      this.setData({
        locatedOk: ok,
        locationFuzzy: !!app.globalData.locationFuzzy,
        latitude: location.latitude,
        longitude: location.longitude
      });
      this.applyFilters();
      // 天气单独异步拉，不让它拖慢地图的首屏
      this.loadWeather(location, force);
    });
  },

  /**
   * 顶栏天气（Phase 5）。
   * weather.current() 不会 reject，拿不到也只是显示一句「天气获取失败」，
   * 所以这里不需要 catch，也不会因为天气影响地图。
   */
  loadWeather(location, force) {
    weatherUtil.current(location, { force: force }).then((w) => {
      this.weather = w;
      this.setData({ weatherLine: weatherUtil.summaryText(w) });
    });
  },

  /** 重新计算 Marker 列表 */
  applyFilters() {
    const list = placeUtil.sort(placeUtil.filter(this.decorated, this.data.filters), 'distance');
    this.visible = list;

    const selectedId = this.data.selected && this.data.selected.id;
    const stillThere = list.some((p) => p.id === selectedId);

    const markers = list.map((p, i) => {
      const on = p.id === selectedId && stillThere;
      const size = on ? MARKER_SIZE_ON : MARKER_SIZE;
      return {
        id: i,                       // map 组件要求数字 id
        latitude: p.latitude,
        longitude: p.longitude,
        iconPath: p.markerIcon,
        width: size.w,
        height: size.h,
        anchor: { x: 0.5, y: 1 },    // 图标底部尖点对准坐标
        zIndex: on ? 99 : 1,
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

    const patch = {
      markers: markers,
      total: list.length,
      selected: stillThere ? this.data.selected : null
    };
    // 列表模式才把结果推到视图层。地点多起来之后这个数组不小，
    // 地图模式下推它纯属浪费一次 setData
    if (this.data.viewMode === 'list') patch.listPlaces = list;
    this.setData(patch);
  },

  /** 地图 / 列表来回切 */
  onToggleView() {
    const next = this.data.viewMode === 'map' ? 'list' : 'map';
    this.setData({ viewMode: next, selected: null }, () => this.applyFilters());
  },

  /** 把筛选条件同步到顶部 chip 和横幅的显示状态 */
  syncChips() {
    const f = this.data.filters;
    const age = AGE_GROUPS.filter((g) => g.key === f.ageGroup)[0];

    // 横幅：说明当前在看的是哪个专题 / 搜索词 / 区域限制
    const parts = [];
    if (this.data.topicTitle) parts.push(this.data.topicTitle);
    else if (f.keyword) parts.push('搜索：' + f.keyword);
    else if (this.data.childTitle && f.ageGroup) parts.push(this.data.childTitle);
    if (this.data.regionLocked) parts.push('只看当前区域');

    this.setData({
      bannerText: parts.join(' · '),
      chip: {
        nearby: f.maxDistance === 10,
        free: f.maxPrice === 0,
        outdoor: f.env === 'outdoor',
        age: age ? age.label : '孩子年龄',
        more: placeUtil.countConditions(f)
      }
    });
  },

  /** 改筛选条件的统一入口 */
  patchFilters(patch) {
    const filters = Object.assign({}, this.data.filters, patch);
    this.setData({ filters: filters }, () => {
      this.syncChips();
      this.applyFilters();
    });
  },

  /** 结果不在当前视野时，把地图挪到第一个结果附近 */
  fitToResults() {
    const first = this.visible[0];
    if (!first) return;
    this.setData({ latitude: first.latitude, longitude: first.longitude, scale: 12 });
  },

  /* ---------------- 交互 ---------------- */

  /** 点 Marker：弹出地点卡片，并把地图中心稍微上移，避免卡片挡住 Marker */
  onMarkerTap(e) {
    const place = this.visible[e.detail.markerId];
    if (!place) return;
    this.setData(
      {
        selected: place,
        latitude: place.latitude - 0.008,   // 视觉上把点抬到屏幕中上部
        longitude: place.longitude
      },
      () => this.applyFilters()             // 重画 Marker，让选中的那个变大
    );
  },

  /** 点地图空白处：收起卡片 */
  onMapTap() {
    if (this.data.selected) {
      this.setData({ selected: null }, () => this.applyFilters());
    }
  },

  onCloseCard() {
    this.setData({ selected: null }, () => this.applyFilters());
  },

  /** 用户手动拖动/缩放地图后，才提示「搜索这片区域」 */
  onRegionChange(e) {
    if (e.type !== 'end') return;
    const by = e.causedBy || (e.detail && e.detail.causedBy);
    if (by !== 'drag' && by !== 'gesture' && by !== 'scale') return;
    if (!this.data.canSearchRegion) this.setData({ canSearchRegion: true });
  },

  /** 只看当前屏幕范围内的地点 */
  onSearchRegion() {
    const ctx = wx.createMapContext('szmap');
    ctx.getRegion({
      success: (res) => {
        this.setData({ canSearchRegion: false, regionLocked: true });
        this.patchFilters({ bounds: { southwest: res.southwest, northeast: res.northeast } });
      },
      fail: () => wx.showToast({ title: '获取地图范围失败', icon: 'none' })
    });
  },

  /** 快捷筛选（附近 / 免费 / 户外） */
  onQuickTap(e) {
    const key = e.currentTarget.dataset.key;
    const f = this.data.filters;
    if (key === 'nearby') this.patchFilters({ maxDistance: f.maxDistance === 10 ? null : 10 });
    else if (key === 'free') this.patchFilters({ maxPrice: f.maxPrice === 0 ? null : 0 });
    else if (key === 'outdoor') this.patchFilters({ env: f.env === 'outdoor' ? '' : 'outdoor' });
  },

  /** 年龄：用系统 ActionSheet，比展开整个面板快 */
  onAgeTap() {
    const labels = ['不限年龄'].concat(AGE_GROUPS.map((g) => g.label));
    wx.showActionSheet({
      itemList: labels,
      success: (res) => {
        const i = res.tapIndex;
        this.patchFilters({ ageGroup: i === 0 ? '' : AGE_GROUPS[i - 1].key });
      },
      fail: () => {}
    });
  },

  /* ---------------- 筛选面板 ---------------- */

  onMoreFilterTap() {
    this.setData({ showFilter: true, selected: null });
  },

  /** 面板里每改一下，算一次能筛出多少个，显示在确定按钮上 */
  onFilterChange(e) {
    const n = placeUtil.filter(this.decorated, e.detail.filters).length;
    this.setData({ draftCount: n });
  },

  onFilterConfirm(e) {
    this.setData({ showFilter: false, filters: e.detail.filters }, () => {
      this.syncChips();
      this.applyFilters();
      if (this.data.total > 0) this.fitToResults();
    });
  },

  onFilterClose() {
    this.setData({ showFilter: false });
  },

  /** 清掉全部条件（含专题和区域限制） */
  onClearAll() {
    this.setData({ topicTitle: '', childTitle: '', regionLocked: false, canSearchRegion: false });
    this.patchFilters(placeUtil.emptyFilters());
  },

  /* ---------------- 其他 ---------------- */

  /** 回到我的位置 */
  onLocateTap() {
    wx.showLoading({ title: '定位中', mask: true });
    this.refresh(true).then(() => {
      wx.hideLoading();
      this.setData({ scale: 13 });
      if (!this.data.locatedOk) {
        wx.showToast({ title: '未获取到定位，已回到深圳市中心', icon: 'none', duration: 2200 });
      }
    });
  },

  onDetail(e) {
    wx.navigateTo({ url: '/pages/place/place?id=' + e.detail.id });
  },

  /** 收藏：切换后要同时更新缓存里的标记和当前卡片 */
  onFavorite(e) {
    const id = e.detail.id;
    ui.toggleFavorite(id, (on) => {
      this.decorated = this.decorated.map((p) =>
        p.id === id ? Object.assign({}, p, { favorited: on }) : p);
      const sel = this.data.selected;
      if (sel && sel.id === id) {
        this.setData({ selected: Object.assign({}, sel, { favorited: on }) });
      }
      this.applyFilters();
    });
  },

  onSearchTap() {
    wx.navigateTo({ url: '/pages/search/search' });
  },

  onTodayTap() {
    wx.navigateTo({ url: '/pages/today/today' });
  },

  /** 点顶栏天气：拿到了就说一句今天适合什么，没拿到就重试一次 */
  onWeatherTap() {
    const w = this.weather;
    if (w && w.ok) {
      wx.showToast({ title: w.advice, icon: 'none', duration: 2600 });
      return;
    }
    this.setData({ weatherLine: '天气加载中…' });
    this.loadWeather(this.data.latitude ? {
      latitude: this.data.latitude,
      longitude: this.data.longitude
    } : null, true);
  },

  onShareAppMessage() {
    return { title: '深圳亲子地图 · 发现适合孩子的每一个地方', path: '/pages/map/map' };
  }
});

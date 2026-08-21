/**
 * 添加 / 编辑一个地点
 * ------------------------------------------------------------
 * 这是为「站在现场填」设计的：先把名称和位置点出来就能存，
 * 其余都有合理默认值，回头再补。门槛越低，才越可能真的记下来
 * （和打卡页同一个道理）。
 *
 * 位置用 <map> 组件的 bindtap 自己做选点，**不用 wx.chooseLocation**：
 * 那个接口要在 mp 后台单独申请开通，而 map 组件的点击事件本来就带经纬度，
 * 精度由缩放级别决定，比模糊定位准得多，还不需要任何额外权限。
 */
const draft = require('../../utils/draft.js');
const cloudPlaces = require('../../utils/cloudplaces.js');
const geo = require('../../utils/geo.js');
const { CATEGORIES, DISTRICTS } = require('../../data/categories.js');

const app = getApp();

const PARKING = [
  { key: 'free', label: '免费停车' },
  { key: 'paid', label: '有停车场（收费）' },
  { key: 'hard', label: '停车较难' },
  { key: 'none', label: '无停车场' }
];
/**
 * 最多 3 张。
 * 小程序本机文件空间总共只有 10MB，打卡照片也在占同一份空间，
 * 所以数量要限、上传要压（sizeType: compressed）。
 */
const MAX_PHOTOS = 3;

const CROWD = [
  { key: 'low', label: '人少' },
  { key: 'mid', label: '周末人中等' },
  { key: 'high', label: '周末人多' }
];

Page({
  data: {
    d: null,                 // 当前编辑的草稿
    isNew: true,
    isAdmin: false,

    // 地图选点
    mapLat: geo.SZ_CENTER.latitude,
    mapLng: geo.SZ_CENTER.longitude,
    mapScale: 16,            // 默认放得比较大，点选才够准
    markers: [],
    coordText: '还没选位置',

    // 选择器数据
    categories: CATEGORIES,
    categoryLabels: CATEGORIES.map((c) => c.emoji + ' ' + c.label),
    categoryIndex: 0,
    districts: DISTRICTS,
    districtIndex: 0,
    parking: PARKING,
    parkingLabels: PARKING.map((p) => p.label),
    parkingIndex: 1,
    crowd: CROWD,
    crowdLabels: CROWD.map((c) => c.label),
    crowdIndex: 1,
    facilities: draft.FACILITIES,
    weatherKeys: Object.keys(draft.WEATHER_PRESETS),
    weatherList: Object.keys(draft.WEATHER_PRESETS).map((k) => ({
      key: k, label: draft.WEATHER_PRESETS[k].label
    })),

    // 文本域用的中间态（数组字段在表单里是多行文本）
    tagsText: '',
    reasonsText: '',
    maxPhotos: MAX_PHOTOS,
    saving: false
  },

  onLoad(q) {
    const d = q && q.id ? draft.get(q.id) : null;
    const item = d || draft.blank();
    this.setData({ isNew: !d });
    wx.setNavigationBarTitle({ title: d ? '编辑地点' : '添加地点' });
    this.fill(item);

    // 新建时把地图挪到用户附近，省得从市中心开始拖
    if (!d) {
      app.ensureLocation().then(({ location }) => {
        if (this.data.d && this.data.d.latitude === null) {
          this.setData({ mapLat: location.latitude, mapLng: location.longitude, mapScale: 15 });
        }
      });
    }

    cloudPlaces.whoami().then((r) => {
      this.setData({ isAdmin: !!(r && r.isAdmin) });
    });
  },

  /** 把草稿对象铺到表单各个控件上 */
  fill(item) {
    const ci = CATEGORIES.findIndex((c) => c.key === item.category);
    const di = DISTRICTS.indexOf(item.district);
    const pi = PARKING.findIndex((p) => p.key === item.parking);
    const qi = CROWD.findIndex((c) => c.key === item.crowdLevel);
    const patch = {
      d: item,
      categoryIndex: ci > -1 ? ci : 0,
      districtIndex: di > -1 ? di : 0,
      parkingIndex: pi > -1 ? pi : 1,
      crowdIndex: qi > -1 ? qi : 1,
      tagsText: (item.tags || []).join('、'),
      reasonsText: (item.reasons || []).join('\n')
    };
    if (item.latitude !== null && item.longitude !== null) {
      patch.mapLat = item.latitude;
      patch.mapLng = item.longitude;
      patch.markers = this.markerAt(item.latitude, item.longitude);
      patch.coordText = this.coordText(item.latitude, item.longitude);
    }
    this.setData(patch);
  },

  markerAt(lat, lng) {
    return [{
      id: 0,
      latitude: lat,
      longitude: lng,
      width: 32,
      height: 40,
      anchor: { x: 0.5, y: 1 },
      iconPath: '/images/markers/park.png'
    }];
  },

  coordText(lat, lng) {
    return lat.toFixed(5) + ', ' + lng.toFixed(5);
  },

  /* ---------------- 地图选点 ---------------- */

  /** 点地图任意位置就把标记挪过去，坐标精度由当前缩放决定 */
  onMapTap(e) {
    const { latitude, longitude } = e.detail || {};
    if (typeof latitude !== 'number') return;
    this.patch({ latitude: latitude, longitude: longitude });
    this.setData({
      markers: this.markerAt(latitude, longitude),
      coordText: this.coordText(latitude, longitude)
    });
  },

  /** 把地图挪到我现在的位置（模糊定位，只用来大致定位视野） */
  onLocate() {
    wx.showLoading({ title: '定位中', mask: true });
    app.ensureLocation(true).then(({ location, ok }) => {
      wx.hideLoading();
      this.setData({ mapLat: location.latitude, mapLng: location.longitude, mapScale: 16 });
      wx.showToast({
        title: ok ? '已挪到你附近，放大后点准确位置' : '没拿到定位，先手动拖地图',
        icon: 'none',
        duration: 2400
      });
    });
  },

  /* ---------------- 表单 ---------------- */

  /** 所有字段改动的统一入口 */
  patch(obj) {
    this.setData({ d: Object.assign({}, this.data.d, obj) });
  },

  onInput(e) {
    const k = e.currentTarget.dataset.k;
    const v = e.detail.value;
    if (k === 'tagsText') {
      this.setData({ tagsText: v });
      this.patch({ tags: v.split(/[、,，]/).map((s) => s.trim()).filter(Boolean) });
      return;
    }
    if (k === 'reasonsText') {
      this.setData({ reasonsText: v });
      this.patch({ reasons: v.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 3) });
      return;
    }
    this.patch({ [k]: v });
  },

  onNumber(e) {
    const k = e.currentTarget.dataset.k;
    const n = parseFloat(e.detail.value);
    this.patch({ [k]: isNaN(n) ? 0 : n });
  },

  onPick(e) {
    const k = e.currentTarget.dataset.k;
    const i = Number(e.detail.value);
    if (k === 'category') this.setData({ categoryIndex: i }, () => this.patch({ category: CATEGORIES[i].key }));
    else if (k === 'district') this.setData({ districtIndex: i }, () => this.patch({ district: DISTRICTS[i] }));
    else if (k === 'parking') this.setData({ parkingIndex: i }, () => this.patch({ parking: PARKING[i].key }));
    else if (k === 'crowd') this.setData({ crowdIndex: i }, () => this.patch({ crowdLevel: CROWD[i].key }));
  },

  onToggle(e) {
    const k = e.currentTarget.dataset.k;
    this.patch({ [k]: !this.data.d[k] });
  },

  onEnv(e) {
    const v = e.currentTarget.dataset.v;
    if (v === 'outdoor') this.patch({ outdoor: true, indoor: false });
    else if (v === 'indoor') this.patch({ outdoor: false, indoor: true });
    else this.patch({ outdoor: true, indoor: true });
  },

  onWeather(e) {
    this.patch({ weatherPreset: e.currentTarget.dataset.k });
  },

  /* ---------------- 照片 ---------------- */

  /**
   * 选照片。和打卡页同一套做法：chooseMedia 给的是临时路径，
   * 必须 saveFile 存成本地永久文件，否则下次启动就失效了。
   * 存的是**本机**文件 —— 不上传，别人看不到。
   */
  onAddPhoto() {
    const cur = (this.data.d.images || []).slice();
    const left = MAX_PHOTOS - cur.length;
    if (left <= 0) {
      wx.showToast({ title: '最多 ' + MAX_PHOTOS + ' 张', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: left,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const fs = wx.getFileSystemManager();
        const saved = [];
        let done = 0;
        res.tempFiles.forEach((f) => {
          fs.saveFile({
            tempFilePath: f.tempFilePath,
            success: (r) => saved.push(r.savedFilePath),
            // 存不下就先用临时路径，至少这次能看到
            fail: () => saved.push(f.tempFilePath),
            complete: () => {
              done++;
              if (done === res.tempFiles.length) this.patch({ images: cur.concat(saved) });
            }
          });
        });
      },
      fail: () => {}
    });
  },

  onPreviewPhoto(e) {
    wx.previewImage({
      current: e.currentTarget.dataset.src,
      urls: this.data.d.images || []
    });
  },

  /**
   * 删一张。已经发布过的话，云端那份不会跟着删 ——
   * 下次点「更新公共库」时会按当前这几张重新传。
   */
  onRemovePhoto(e) {
    const i = Number(e.currentTarget.dataset.i);
    const images = (this.data.d.images || []).slice();
    images.splice(i, 1);
    this.patch({ images: images });
  },

  /* ---------------- 保存 / 删除 / 发布 ---------------- */

  onSave() {
    const errs = draft.validate(this.data.d);
    if (errs.length) {
      wx.showModal({ title: '还差一点', content: errs.join('\n'), showCancel: false });
      return;
    }
    draft.save(this.data.d);
    wx.showToast({ title: '已保存到这台手机', icon: 'none' });
    setTimeout(() => wx.navigateBack(), 700);
  },

  onDelete() {
    wx.showModal({
      title: '删掉这个地点？',
      content: this.data.d.publishedAt
        ? '本机的记录会删掉。注意：已经发布到公共库的那份不会被删，要撤下得单独操作。'
        : '删掉之后无法恢复。',
      confirmColor: '#B4503F',
      success: (r) => {
        if (!r.confirm) return;
        draft.remove(this.data.d.id);
        wx.navigateBack();
      }
    });
  },

  /**
   * 发布到公共库。只有作者能成功——云函数会校验 openid，
   * 这里的 isAdmin 只是决定按钮显不显示，真正的门在服务端。
   */
  onPublish() {
    const errs = draft.validate(this.data.d);
    if (errs.length) {
      wx.showModal({ title: '还差一点', content: errs.join('\n'), showCancel: false });
      return;
    }
    if (!this.data.d.verified) {
      wx.showModal({
        title: '还没勾「现场核实过」',
        content: '公共库里的地点会被所有用户看到。没核实过的信息发出去，别人可能按着它白跑一趟。确定要发吗？',
        confirmText: '仍要发布',
        confirmColor: '#B4503F',
        success: (r) => { if (r.confirm) this.doPublish(); }
      });
      return;
    }
    this.doPublish();
  },

  /**
   * 发布：先把本机照片传到云存储，再把地点写进公共库。
   * 顺序不能反 —— 公共库里存的必须是云地址，本机路径换台设备就打不开。
   */
  doPublish() {
    const item = draft.save(this.data.d);
    const photos = item.images || [];
    this.setData({ saving: true });
    wx.showLoading({ title: photos.length ? '上传照片…' : '发布中', mask: true });

    cloudPlaces.uploadPhotos(item.id, photos).then((fileIds) => {
      const withCloud = draft.setCloudImages(item.id, fileIds) || item;
      const lost = photos.length - fileIds.length;
      wx.showLoading({ title: '发布中', mask: true });
      return cloudPlaces
        .publish(draft.toPlace(withCloud, { forCloud: true }))
        .then((r) => ({ r: r, lost: lost }));
    }).then(({ r, lost }) => {
      wx.hideLoading();
      this.setData({ saving: false });
      if (r && r.ok) {
        draft.markPublished(item.id);
        this.setData({ d: draft.get(item.id) });
        wx.showToast({
          title: lost > 0
            ? '已发布，但有 ' + lost + ' 张图没传上去'
            : (r.mode === 'created' ? '已发布，所有人可见' : '已更新公共库'),
          icon: 'none',
          duration: lost > 0 ? 2600 : 1800
        });
        return;
      }
      wx.showModal({
        title: '没发出去',
        content: (r && r.msg) || '未知错误',
        showCancel: false
      });
    });
  }
});

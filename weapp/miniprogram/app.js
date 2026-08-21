/**
 * 深圳亲子地图 · 小程序入口
 * ------------------------------------------------------------
 * globalData 里只放「跨页面都要用」的东西：
 *   location      当前定位（gcj02），拿不到时是深圳市民中心
 *   locatedOk     定位是否成功（false 时页面上要提示是默认位置）
 *   child         孩子档案（Phase 3 接入本地存储 / 云端）
 */
const geo = require('./utils/geo.js');

App({
  globalData: {
    location: null,
    locatedOk: false,
    child: null,
    /**
     * 搜索页 / 专题页要把筛选条件交给地图页，
     * 但 switchTab 不能带参数，只能在这里中转：
     * { filters: {...}, title: '专题名' }，地图页 onShow 取一次就清空。
     */
    pendingFilters: null
  },

  onLaunch() {
    // 云开发 Phase 1 还用不上，先按可用则初始化处理，失败不影响地图
    if (wx.cloud) {
      try {
        wx.cloud.init({ env: wx.cloud.DYNAMIC_CURRENT_ENV, traceUser: true });
      } catch (e) {
        console.warn('云开发未初始化（Phase 1 不影响使用）', e);
      }
    }
    this.ensureLocation();
  },

  /**
   * 获取定位，结果缓存在 globalData，多个页面共用一次授权。
   * 失败时回落到深圳市民中心，并把 locatedOk 置为 false，
   * 页面据此提示用户「当前是默认位置」。
   * @returns {Promise<{location, ok}>}
   */
  ensureLocation(force) {
    if (this.globalData.location && !force) {
      return Promise.resolve({ location: this.globalData.location, ok: this.globalData.locatedOk });
    }
    if (this._locating && !force) return this._locating;

    this._locating = new Promise((resolve) => {
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          this.globalData.location = { latitude: res.latitude, longitude: res.longitude };
          this.globalData.locatedOk = true;
          resolve({ location: this.globalData.location, ok: true });
        },
        fail: (err) => {
          console.warn('定位失败，使用深圳市中心兜底：', err && err.errMsg);
          this.globalData.location = Object.assign({}, geo.SZ_CENTER);
          this.globalData.locatedOk = false;
          resolve({ location: this.globalData.location, ok: false });
        },
        complete: () => {
          this._locating = null;
        }
      });
    });
    return this._locating;
  }
});

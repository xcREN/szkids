/**
 * 深圳亲子地图 · 小程序入口
 * ------------------------------------------------------------
 * globalData 里只放「跨页面都要用」的东西：
 *   location      当前定位（gcj02），拿不到时是深圳市民中心
 *   locatedOk     定位是否成功（false 时页面上要提示是默认位置）
 *   child         孩子档案（Phase 3 接入本地存储 / 云端）
 */
const geo = require('./utils/geo.js');

/**
 * 定位一律走 wx.getFuzzyLocation（模糊定位），不用 wx.getLocation。
 *
 * 精确定位那个接口要在 mp 后台单独申请，开通条件是「具备与实时地理位置
 * 强相关的使用场景」——指导航、打车、跑腿这类。「推荐附近适合孩子的地方」
 * 不符合，后台直接显示「类目未符合开通条件」，个人主体基本申请不下来。
 * 而且 app.json 的 requiredPrivateInfos 里只要写了 getLocation，
 * **提交审核会被直接拦下**，报「接口无权限」。
 *
 * 这里刻意连 `wx.getLocation` 这个字面量都不留：代码包里出现未获授权的
 * 隐私接口名，本身就是审核风险，留个用不到的分支不值得。
 *
 * 代价是经纬度只到公里级。筛「附近 10km」、按距离排序、算大致车程都不受
 * 影响，受影响的只有「离你 800m」这种百米级说法 —— 所以距离和车程的文案
 * 会自动说得含糊些，见 utils/geo.js 的 formatDistance / formatDriveMinutes。
 *
 * 哪天真申请下来了：把下面的 wx.getFuzzyLocation 换成 wx.getLocation，
 * fuzzy / locationFuzzy 两处改成 false，app.json 的 requiredPrivateInfos
 * 换成 getLocation，别处不用动。
 */

App({
  globalData: {
    location: null,
    locatedOk: false,
    locationFuzzy: true,   // 是否是模糊定位（见文件顶部 PRECISE_LOCATION）
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
      if (!wx.getFuzzyLocation) {
        // 基础库太老，没有 getFuzzyLocation（2.25.0 才有）
        return resolve(this._useFallbackLocation('基础库不支持 getFuzzyLocation'));
      }
      wx.getFuzzyLocation({
        type: 'gcj02',
        success: (res) => {
          this.globalData.location = {
            latitude: res.latitude,
            longitude: res.longitude,
            // 模糊定位精度只到公里级，页面据此把距离说得含糊一点，
            // 不要拿 3 公里的误差去显示「离你 800m」
            fuzzy: true
          };
          this.globalData.locatedOk = true;
          this.globalData.locationFuzzy = true;
          resolve({ location: this.globalData.location, ok: true });
        },
        fail: (err) => {
          resolve(this._useFallbackLocation(err && err.errMsg));
        },
        complete: () => {
          this._locating = null;
        }
      });
    });
    return this._locating;
  },

  /** 拿不到定位时统一回落到深圳市民中心 */
  _useFallbackLocation(why) {
    console.warn('定位失败，使用深圳市中心兜底：', why);
    this.globalData.location = Object.assign({}, geo.SZ_CENTER, { fuzzy: true });
    this.globalData.locatedOk = false;
    this.globalData.locationFuzzy = true;
    this._locating = null;
    return { location: this.globalData.location, ok: false };
  }
});

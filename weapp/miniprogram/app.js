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
 * 用精确定位还是模糊定位。
 *
 * **默认 false，也就是走 wx.getFuzzyLocation。**
 *
 * `wx.getLocation` 需要在 mp 后台单独申请开通，而微信的开通条件是
 * 「具备与实时地理位置强相关的使用场景」——指的是导航、打车、跑腿这类，
 * 「推荐附近适合孩子的地方」不属于，个人主体基本申请不下来
 * （后台显示：类目未符合开通条件）。
 * app.json 里只要声明了 getLocation，**提交审核会被直接拦下**。
 *
 * getFuzzyLocation 不需要申请，返回的经纬度精度到公里级。
 * 对这个产品够用：筛「附近 10km」、按距离排序、算大致车程都不受影响，
 * 受影响的只有「离你 800m」这种精确到百米的说法，所以模糊定位下
 * 距离文案会自动说得含糊一些（见 utils/geo.js 的 formatDistance）。
 *
 * 哪天真的申请下来了 getLocation，把这里改成 true，
 * 同时把 app.json 的 requiredPrivateInfos 换回 getLocation 即可，别处不用动。
 */
const PRECISE_LOCATION = false;

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
      const api = PRECISE_LOCATION ? wx.getLocation : wx.getFuzzyLocation;
      if (!api) {
        // 基础库太老，没有 getFuzzyLocation（2.25.0 才有）
        return resolve(this._useFallbackLocation('基础库不支持 getFuzzyLocation'));
      }
      api({
        type: 'gcj02',
        success: (res) => {
          this.globalData.location = {
            latitude: res.latitude,
            longitude: res.longitude,
            // 模糊定位精度只到公里级，页面据此把距离说得含糊一点，
            // 不要拿 3 公里的误差去显示「离你 800m」
            fuzzy: !PRECISE_LOCATION
          };
          this.globalData.locatedOk = true;
          this.globalData.locationFuzzy = !PRECISE_LOCATION;
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

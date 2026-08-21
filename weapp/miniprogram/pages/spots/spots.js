/**
 * 我的地点
 * ------------------------------------------------------------
 * 对**所有用户**：在这里添加自己发现的地方，只存在这台手机上，
 * 别人看不到、也不会上传。加完立刻出现在地图和推荐里。
 *
 * 对**作者**（openid 匹配 cloudfunctions/places 里的 ADMIN_OPENID）：
 * 多一个「发布到公共库」的能力，发布后所有用户都能看到。
 *
 * 这个分工是有意的：公共库里的内容 100% 出自作者一人之手，
 * 所以不构成 UGC —— 不需要内容审核，也不需要 UGC 声明。
 */
const draft = require('../../utils/draft.js');
const cloudPlaces = require('../../utils/cloudplaces.js');
const { CATEGORY_MAP } = require('../../data/categories.js');

Page({
  data: {
    list: [],
    isAdmin: false,
    openid: '',
    configured: true,     // 云函数是否已配 ADMIN_OPENID
    cloudCount: 0,
    cloudTip: '',
    showId: false         // 作者用：显示 openid 好去配云函数
  },

  onShow() {
    this.load();
    cloudPlaces.whoami().then((r) => {
      this.setData({
        isAdmin: !!(r && r.isAdmin),
        openid: (r && r.openid) || '',
        configured: !(r && r.configured === false)
      });
    });
    this.refreshCloud();
  },

  load() {
    const list = draft.list().map((d) => {
      const cat = CATEGORY_MAP[d.category] || {};
      return {
        id: d.id,
        name: d.name || '未命名地点',
        emoji: cat.emoji || '📍',
        categoryLabel: cat.label || '',
        district: d.district,
        located: d.latitude !== null && d.longitude !== null,
        verified: !!d.verified,
        published: !!d.publishedAt
      };
    });
    this.setData({ list: list });
  },

  refreshCloud() {
    cloudPlaces.sync().then((r) => {
      const n = cloudPlaces.cached().length;
      let tip = '';
      if (r && !r.ok) {
        if (r.reason === 'nocollection') tip = '云端还没建 places 集合';
        else if (r.reason === 'nocloud') tip = '这个环境用不了云开发';
        else tip = '暂时连不上云端，显示的是上次同步的结果';
      }
      this.setData({ cloudCount: n, cloudTip: tip });
    });
  },

  onAdd() {
    wx.navigateTo({ url: '/pages/spot/spot' });
  },

  onEdit(e) {
    wx.navigateTo({ url: '/pages/spot/spot?id=' + e.currentTarget.dataset.id });
  },

  onSeeOnMap() {
    wx.switchTab({ url: '/pages/map/map' });
  },

  /* ---------------- 作者专用 ---------------- */

  onToggleId() {
    this.setData({ showId: !this.data.showId });
  },

  onCopyId() {
    if (!this.data.openid) return;
    wx.setClipboardData({
      data: this.data.openid,
      success: () => wx.showToast({ title: 'openid 已复制', icon: 'none' })
    });
  },

  /**
   * 导出成 places.js 代码。
   * 有了云端发布之后这个仍然有用：把地点沉淀进代码包，
   * 就算哪天云环境没了或者用户没网，这些地点也还在。
   */
  onExport() {
    const code = draft.toCodeAll();
    if (!code) {
      wx.showToast({ title: '还没有可导出的地点', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showModal({
          title: '已复制 ' + draft.count() + ' 条',
          content: '发给自己（文件传输助手），在电脑上粘进 data/places.js 的 PLACES 数组里，下个版本就随代码包发给所有人了。',
          showCancel: false
        });
      },
      fail: () => wx.showToast({ title: '复制失败', icon: 'none' })
    });
  },

  onRefreshCloud() {
    wx.showLoading({ title: '同步中', mask: true });
    cloudPlaces.sync({ force: true }).then(() => {
      wx.hideLoading();
      this.refreshCloud();
      wx.showToast({ title: '已同步', icon: 'none' });
    });
  }
});

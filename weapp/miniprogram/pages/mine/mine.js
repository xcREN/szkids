/**
 * 我的（Phase 3）
 * ------------------------------------------------------------
 * 头像昵称用微信开放能力直接填（chooseAvatar + type="nickname"），
 * 不做 wx.login / openid：本地数据不需要账号体系，用户也不用被挡在登录页前面。
 * 想上云同步时再补登录，改动集中在 utils/store.js。
 */
const store = require('../../utils/store.js');
const { groupForAge, AGE_GROUPS } = require('../../data/categories.js');

Page({
  data: {
    profile: { avatarUrl: '', nickName: '' },
    children: [],       // 带 ageText / on（是否当前孩子）
    favCount: 0,
    checkinCount: 0,
    planCount: 0,
    version: 'v0.4 · Phase 4'
  },

  onShow() {
    this.load();
  },

  load() {
    const active = store.getActiveChild();
    const checkins = store.getCheckins();
    const children = store.getChildren().map((c) => {
      const age = store.ageOf(c);
      const group = AGE_GROUPS.filter((g) => g.key === groupForAge(age))[0];
      return Object.assign({}, c, {
        ageText: age === null ? '' : age + '岁',
        groupText: group ? group.label : '',
        on: !!active && c.id === active.id
      });
    });
    this.setData({
      profile: store.getProfile(),
      children: children,
      favCount: store.getFavorites().length,
      checkinCount: checkins.length,
      planCount: store.getPlans().filter((p) => p.items.length).length
    });
  },

  /* ---------------- 头像昵称 ---------------- */

  /**
   * chooseAvatar 给的是临时文件路径，要先存到本地永久目录，
   * 否则下次启动就失效了。
   */
  onChooseAvatar(e) {
    const tmp = e.detail.avatarUrl;
    wx.getFileSystemManager().saveFile({
      tempFilePath: tmp,
      success: (res) => {
        store.saveProfile({ avatarUrl: res.savedFilePath });
        this.load();
      },
      fail: () => {
        // 存不下就先用临时路径，至少这次能看到
        store.saveProfile({ avatarUrl: tmp });
        this.load();
      }
    });
  },

  onNickInput(e) {
    store.saveProfile({ nickName: e.detail.value });
    this.setData({ 'profile.nickName': e.detail.value });
  },

  /* ---------------- 孩子 ---------------- */

  onAddChild() {
    wx.navigateTo({ url: '/pages/child/child' });
  },

  onEditChild(e) {
    wx.navigateTo({ url: '/pages/child/child?id=' + e.currentTarget.dataset.id });
  },

  /** 点一下切换「当前孩子」，地图的年龄推荐跟着它走 */
  onPickChild(e) {
    store.setActiveChildId(e.currentTarget.dataset.id);
    this.load();
    wx.showToast({ title: '已切换', icon: 'none' });
  },

  /* ---------------- 其他入口 ---------------- */

  onFavorite() {
    wx.navigateTo({ url: '/pages/favorite/favorite' });
  },

  /** 打卡记录都在童年地图那一页里 */
  onCheckin() {
    wx.switchTab({ url: '/pages/timeline/timeline' });
  },

  onPlan() {
    wx.navigateTo({ url: '/pages/plan/plan' });
  },

  onClearData() {
    wx.showModal({
      title: '清空本地数据',
      content: '孩子资料、收藏、头像昵称都会被删掉，且无法恢复。',
      confirmColor: '#B4503F',
      success: (res) => {
        if (!res.confirm) return;
        store.clearAll();
        this.load();
        wx.showToast({ title: '已清空', icon: 'none' });
      }
    });
  }
});

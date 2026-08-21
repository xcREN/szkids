/**
 * 我的（Phase 3）
 * ------------------------------------------------------------
 * 头像昵称用微信开放能力直接填（chooseAvatar + type="nickname"），
 * 不做 wx.login / openid：本地数据不需要账号体系，用户也不用被挡在登录页前面。
 * 想上云同步时再补登录，改动集中在 utils/store.js。
 */
const store = require('../../utils/store.js');
const draft = require('../../utils/draft.js');
const { groupForAge, AGE_GROUPS } = require('../../data/categories.js');

/**
 * 联系方式。改这里一处就够，页面上两行都从这取。
 *
 * 为什么要放：`data/places.js` 里的开放时间、收费、预约规则都会变
 * （README 第四节说的「lastVerifiedAt 是这类产品的生命线」），
 * 光靠自己核实跟不上，得让用户能直接把错报给你。
 *
 * phoneText 只是分段显示，好认；拨号用的是 phone 那个纯数字串。
 */
const CONTACT = {
  wechat: 'Atlas-Ren',
  phone: '18926533343',
  phoneText: '189 2653 3343'
};

Page({
  data: {
    profile: { avatarUrl: '', nickName: '' },
    children: [],       // 带 ageText / on（是否当前孩子）
    favCount: 0,
    checkinCount: 0,
    planCount: 0,
    spotCount: 0,
    contact: CONTACT,
    version: 'v1.0.1 · Phase 5'
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
      planCount: store.getPlans().filter((p) => p.items.length).length,
      spotCount: draft.count()
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

  onSpots() {
    wx.navigateTo({ url: '/pages/spots/spots' });
  },

  /* ---------------- 联系方式 ---------------- */

  /**
   * 复制微信号。
   * 不做「跳转加好友」——小程序没有这个能力，
   * 复制到剪贴板再让用户自己去搜是唯一靠谱的做法。
   */
  onCopyWechat() {
    wx.setClipboardData({
      data: CONTACT.wechat,
      success: () => {
        wx.showToast({ title: '微信号已复制，去微信搜索添加', icon: 'none', duration: 2400 });
      },
      fail: () => wx.showToast({ title: '复制失败，微信号：' + CONTACT.wechat, icon: 'none' })
    });
  },

  /** 拨打电话。用户取消拨号也会走 fail，不用提示 */
  onCallPhone() {
    wx.makePhoneCall({
      phoneNumber: CONTACT.phone,
      fail: () => {}
    });
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

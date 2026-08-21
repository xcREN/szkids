/**
 * 孩子档案（PRD 二十三）
 * ------------------------------------------------------------
 * 只存出生年份，不存具体生日：一是够用（年龄段是按岁分的），
 * 二是少收一点个人信息，过审和隐私都省事。
 * 年龄每年自动 +1，推荐会跟着变。
 *
 * 进入方式：
 *   /pages/child/child            新增
 *   /pages/child/child?id=xxx     编辑
 */
const store = require('../../utils/store.js');
const { INTERESTS, groupForAge, AGE_GROUPS } = require('../../data/categories.js');

/** 出生年份可选范围：最近 15 年 */
function birthYearOptions() {
  const now = new Date().getFullYear();
  const arr = [];
  for (let y = now; y >= now - 15; y--) arr.push(y);
  return arr;
}

Page({
  data: {
    editing: false,
    id: '',
    name: '',
    yearOptions: [],
    yearIndex: -1,
    gender: '',            // '' | 'girl' | 'boy'
    interests: [],         // 选中的兴趣 key
    interestOptions: [],
    ageText: '',           // 「今年 6 岁 · 属于 6-8岁 档」
    canSave: false
  },

  onLoad(query) {
    const years = birthYearOptions();
    const child = query.id ? store.getChildren().filter((c) => c.id === query.id)[0] : null;

    this.setData({
      editing: !!child,
      id: child ? child.id : '',
      name: child ? child.name : '',
      yearOptions: years,
      yearIndex: child ? years.indexOf(child.birthYear) : -1,
      gender: child ? child.gender || '' : '',
      interests: child ? (child.interests || []).slice() : []
    });
    this.renderInterests();
    wx.setNavigationBarTitle({ title: child ? '编辑孩子资料' : '添加孩子' });
    this.refreshDerived();
  },

  /** 年龄提示 + 是否可保存，统一算一次 */
  refreshDerived() {
    const y = this.data.yearOptions[this.data.yearIndex];
    let ageText = '';
    if (y) {
      const age = new Date().getFullYear() - y;
      const group = AGE_GROUPS.filter((g) => g.key === groupForAge(age))[0];
      ageText = '今年 ' + age + ' 岁' + (group ? ' · 按「' + group.label + '」推荐' : '');
    }
    this.setData({
      ageText: ageText,
      canSave: !!(this.data.name.trim() && y)
    });
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value }, () => this.refreshDerived());
  },

  onYearChange(e) {
    this.setData({ yearIndex: Number(e.detail.value) }, () => this.refreshDerived());
  },

  onGenderTap(e) {
    const g = e.currentTarget.dataset.g;
    this.setData({ gender: this.data.gender === g ? '' : g });
  },

  /** WXML 里不能调用 indexOf，选中态在这里算好 */
  renderInterests() {
    const on = this.data.interests;
    this.setData({
      interestOptions: INTERESTS.map((it) => ({
        key: it.key,
        label: it.label,
        emoji: it.emoji,
        on: on.indexOf(it.key) > -1
      }))
    });
  },

  onInterestTap(e) {
    const key = e.currentTarget.dataset.key;
    const arr = this.data.interests.slice();
    const i = arr.indexOf(key);
    if (i > -1) arr.splice(i, 1);
    else arr.push(key);
    this.setData({ interests: arr }, () => this.renderInterests());
  },

  onSave() {
    if (!this.data.canSave) {
      wx.showToast({ title: '昵称和出生年份要填一下', icon: 'none' });
      return;
    }
    const child = store.saveChild({
      id: this.data.id || undefined,
      name: this.data.name.trim(),
      birthYear: this.data.yearOptions[this.data.yearIndex],
      gender: this.data.gender,
      interests: this.data.interests
    });
    store.setActiveChildId(child.id);
    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 700);
  },

  onDelete() {
    wx.showModal({
      title: '删除这个孩子的资料',
      content: '删除后推荐会回到不限年龄，收藏和打卡不受影响。',
      confirmColor: '#B4503F',
      success: (res) => {
        if (!res.confirm) return;
        store.removeChild(this.data.id);
        wx.navigateBack();
      }
    });
  }
});

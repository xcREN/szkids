const CONFIG = require("../../config.js");

const db = () => wx.cloud.database();

Page({
  data: {
    activity: CONFIG.activity,
    map: CONFIG.map || {},
    hasLnglat: !!(CONFIG.map && CONFIG.map.lnglat),
    photos: CONFIG.photos || [],
    photoNote: CONFIG.photoNote || "",
    lightbox: "",     // 全屏查看中的图片路径，空字符串表示不显示
    display: [],      // 带上"谁选了什么"的题目列表，直接给 wxml 用
    answers: {},      // 我选了哪个选项 { depart:"a", meal:"other" }
    customs: {},      // 选了"自己填"时填的内容 { meal:"想吃海鲜" }
    name: "",
    joined: 0,        // 已经填了的人数
    voted: false,     // 我提交过没有
    loading: true,
    submitting: false
  },

  onLoad() {
    this.buildDisplay([]);
    this.loadAll();
  },

  onPullDownRefresh() {
    this.loadAll(() => wx.stopPullDownRefresh());
  },

  /* 拉取所有人的选择 + 我自己的记录 */
  loadAll(done) {
    Promise.all([
      db().collection("votes").limit(100).get().catch(() => ({ data: [] })),
      wx.cloud.callFunction({ name: "vote", data: { action: "me" } }).catch(() => null)
    ]).then(([all, meRes]) => {
      const list = (all && all.data) || [];
      const mine = meRes && meRes.result && meRes.result.ok ? meRes.result.mine : null;
      this.buildDisplay(list);
      this.setData({
        joined: list.length,
        loading: false,
        voted: !!mine,
        name: mine ? mine.name : this.data.name,
        answers: mine ? (mine.answers || {}) : this.data.answers,
        customs: mine ? (mine.customs || {}) : this.data.customs
      });
      if (done) done();
    }).catch(() => {
      this.setData({ loading: false });
      if (done) done();
      wx.showToast({ title: "加载失败，下拉重试", icon: "none" });
    });
  },

  /* 把"每题每个选项分别有谁选了"算好，wxml 里就不用写复杂表达式 */
  buildDisplay(list) {
    const display = CONFIG.questions.map((q) => ({
      key: q.key,
      title: q.title,
      options: q.options.map((opt) => {
        // 选了这个选项的人；"自己填"的选项把填的内容跟在名字后面
        const names = list
          .filter((r) => r.answers && r.answers[q.key] === opt.key)
          .map((r) => {
            const extra = opt.custom && r.customs && r.customs[q.key]
              ? "（" + r.customs[q.key] + "）" : "";
            return (r.name || "") + extra;
          })
          .filter((s) => s);
        return {
          key: opt.key,
          label: opt.label,
          custom: !!opt.custom,
          placeholder: opt.placeholder || "填一下你的想法",
          count: names.length,
          names: names.join("、")
        };
      })
    }));
    this.setData({ display });
  },

  onPick(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ answers: Object.assign({}, this.data.answers, { [key]: e.detail.value }) });
  },

  /* "自己填"输入框 */
  onCustom(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ customs: Object.assign({}, this.data.customs, { [key]: e.detail.value }) });
  },

  onName(e) {
    this.setData({ name: e.detail.value });
  },

  submit() {
    const name = (this.data.name || "").trim();
    if (!name) {
      wx.showToast({ title: "请先填个称呼", icon: "none" });
      return;
    }

    // 每题都得选；选了"自己填"的，内容不能空着
    for (let i = 0; i < CONFIG.questions.length; i++) {
      const q = CONFIG.questions[i];
      const picked = this.data.answers[q.key];
      if (!picked) {
        wx.showToast({ title: "还没选「" + q.title + "」", icon: "none" });
        return;
      }
      const opt = q.options.find((o) => o.key === picked);
      if (opt && opt.custom && !(this.data.customs[q.key] || "").trim()) {
        wx.showToast({ title: "「" + q.title + "」还没填内容", icon: "none" });
        return;
      }
    }

    this.setData({ submitting: true });
    wx.cloud.callFunction({
      name: "vote",
      data: {
        action: "submit",
        name: name,
        answers: this.data.answers,
        customs: this.data.customs
      }
    }).then((res) => {
      this.setData({ submitting: false });
      if (!res.result || !res.result.ok) {
        wx.showToast({ title: (res.result && res.result.error) || "提交失败", icon: "none" });
        return;
      }
      wx.showToast({ title: this.data.voted ? "已修改" : "提交成功", icon: "success" });
      this.loadAll();
    }).catch(() => {
      this.setData({ submitting: false });
      wx.showToast({ title: "提交失败，请重试", icon: "none" });
    });
  },

  cancel() {
    wx.showModal({
      title: "撤回我的选择",
      content: "撤回后你的名字会从下面的名单里消失，可以重新填。",
      confirmColor: "#2f7a55",
      success: (r) => {
        if (!r.confirm) return;
        wx.cloud.callFunction({ name: "vote", data: { action: "cancel" } })
          .then(() => {
            this.setData({ voted: false, answers: {}, customs: {} });
            this.loadAll();
          })
          .catch(() => wx.showToast({ title: "撤回失败", icon: "none" }));
      }
    });
  },

  copyPlace() {
    wx.setClipboardData({ data: CONFIG.activity.place });
  },

  /* 打开微信内置地图，可以直接点导航，不用跳出微信 */
  openMap() {
    const m = CONFIG.map || {};
    const parts = String(m.lnglat || "").split(",");
    const lng = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);
    if (!isFinite(lng) || !isFinite(lat)) {
      wx.showToast({ title: "还没填坐标", icon: "none" });
      return;
    }
    wx.openLocation({
      latitude: lat,
      longitude: lng,
      name: m.name || CONFIG.activity.title,
      address: m.address || "",
      scale: 16
    });
  },

  copyAddr() {
    const m = CONFIG.map || {};
    wx.setClipboardData({
      data: m.address || CONFIG.activity.place,
      success: () => wx.showToast({ title: "地址已复制", icon: "none" })
    });
  },

  openPhoto(e) {
    const p = this.data.photos[e.currentTarget.dataset.index];
    if (p) this.setData({ lightbox: p.src });
  },

  closePhoto() {
    this.setData({ lightbox: "" });
  },

  /* 分享到群里 */
  onShareAppMessage() {
    return {
      title: CONFIG.activity.title + " —— 选个出发时间和吃饭方式",
      path: "/pages/index/index"
    };
  }
});

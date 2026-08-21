/**
 * 打卡「我们来过」（PRD 十七）
 * ------------------------------------------------------------
 * 记录：日期 / 哪个孩子 / 照片 / 孩子评分 / 家长评分 / 一句话。
 * 除了日期，其他都可以不填——门槛越低，用户才越可能真的记录下来。
 *
 * 进入方式：
 *   /pages/checkin/checkin?placeId=xxx   新增
 *   /pages/checkin/checkin?id=xxx        编辑
 *
 * 照片说明：chooseMedia 给的是临时路径，必须 saveFile 存成本地永久文件，
 * 否则下次启动就打不开了。小程序本地文件总共只有 10MB，所以限制 3 张。
 */
const placeUtil = require('../../utils/place.js');
const store = require('../../utils/store.js');

const MAX_PHOTOS = 3;

/** 停留时长选项，存成小时数供统计用 */
const HOURS = [
  { label: '1小时', value: 1 },
  { label: '2小时', value: 2 },
  { label: '3小时', value: 3 },
  { label: '半天（4小时）', value: 4 },
  { label: '一天（8小时）', value: 8 }
];

function today() {
  const d = new Date();
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

Page({
  data: {
    editing: false,
    id: '',
    place: null,
    date: '',
    today: '',
    children: [],        // [{id,name,on}]
    childRating: 0,
    parentRating: 0,
    note: '',
    photos: [],
    hourOptions: HOURS,
    hourIndex: 2,        // 默认 3 小时
    stars: [1, 2, 3, 4, 5]
  },

  onLoad(query) {
    const record = query.id ? store.getCheckin(query.id) : null;
    const placeId = record ? record.placeId : query.placeId;
    const raw = placeUtil.getById(placeId);
    if (!raw) {
      wx.showToast({ title: '地点不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }

    const picked = record ? record.childIds || [] : [];
    const active = store.getActiveChild();
    // 新增时默认勾上当前孩子，省一次点击
    const defaultIds = picked.length ? picked : (active ? [active.id] : []);

    const hourIndex = record
      ? Math.max(0, HOURS.findIndex((h) => h.value === Number(record.hours)))
      : 2;

    this.setData({
      editing: !!record,
      id: record ? record.id : '',
      place: placeUtil.decorate(raw, null),
      date: record ? record.date : today(),
      today: today(),
      children: store.getChildren().map((c) => ({
        id: c.id,
        name: c.name,
        on: defaultIds.indexOf(c.id) > -1
      })),
      childRating: record ? record.childRating || 0 : 0,
      parentRating: record ? record.parentRating || 0 : 0,
      note: record ? record.note || '' : '',
      photos: record ? (record.photos || []).slice() : [],
      hourIndex: hourIndex < 0 ? 2 : hourIndex
    });
    wx.setNavigationBarTitle({ title: record ? '编辑记录' : '我们来过' });
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value });
  },

  onHourChange(e) {
    this.setData({ hourIndex: Number(e.detail.value) });
  },

  onChildTap(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      children: this.data.children.map((c) =>
        c.id === id ? Object.assign({}, c, { on: !c.on }) : c)
    });
  },

  onAddChild() {
    wx.navigateTo({ url: '/pages/child/child' });
  },

  /** 星级：点已选中的最后一颗可以清零 */
  onRate(e) {
    const n = Number(e.currentTarget.dataset.n);
    const key = e.currentTarget.dataset.key;
    const patch = {};
    patch[key] = this.data[key] === n ? 0 : n;
    this.setData(patch);
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  /* ---------------- 照片 ---------------- */

  onAddPhoto() {
    const left = MAX_PHOTOS - this.data.photos.length;
    if (left <= 0) {
      wx.showToast({ title: '最多 3 张', icon: 'none' });
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
            fail: () => saved.push(f.tempFilePath),
            complete: () => {
              done++;
              if (done === res.tempFiles.length) {
                this.setData({ photos: this.data.photos.concat(saved) });
              }
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
      urls: this.data.photos
    });
  },

  onRemovePhoto(e) {
    const i = Number(e.currentTarget.dataset.i);
    const photos = this.data.photos.slice();
    photos.splice(i, 1);
    this.setData({ photos: photos });
  },

  /* ---------------- 保存 ---------------- */

  onSave() {
    const d = this.data;
    store.saveCheckin({
      id: d.id || undefined,
      placeId: d.place.id,
      date: d.date,
      childIds: d.children.filter((c) => c.on).map((c) => c.id),
      childRating: d.childRating,
      parentRating: d.parentRating,
      note: d.note.trim(),
      photos: d.photos,
      hours: HOURS[d.hourIndex].value
    });
    wx.showToast({ title: '记下了', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 700);
  },

  onDelete() {
    wx.showModal({
      title: '删除这条记录',
      content: '删除后童年地图和成长统计都会跟着变。',
      confirmColor: '#B4503F',
      success: (res) => {
        if (!res.confirm) return;
        store.removeCheckin(this.data.id);
        wx.navigateBack();
      }
    });
  }
});

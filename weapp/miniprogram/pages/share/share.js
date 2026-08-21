/**
 * 足迹分享卡片（PRD 二十）
 * ------------------------------------------------------------
 * 用 canvas 2d 画一张图，可以保存到相册、直接发给微信好友。
 *
 * 两个容易踩的点，这里都处理了：
 *   1. canvas 2d 必须自己按 pixelRatio 放大，否则在高分屏上是糊的；
 *   2. 画布的逻辑尺寸不要写死，用 SelectorQuery 量出来的实际尺寸，
 *      再按比例缩放所有坐标，这样在不同宽度的手机上排版一致。
 */
const store = require('../../utils/store.js');
const stats = require('../../utils/stats.js');

/** 设计稿基准宽度，所有坐标都按 320 宽写，再乘以 scale */
const BASE = 320;

const C = {
  bg: '#F3F1EC',
  brand: '#4B7A5A',
  dark: '#3A6248',
  text: '#1E241F',
  sub: '#6C736B',
  faint: '#9AA096',
  white: '#FFFFFF'
};

Page({
  data: {
    year: 0,
    imagePath: '',      // 生成好的临时图片
    drawing: true,
    summary: ''         // 顶部一句话，说明这张卡片是什么
  },

  onLoad(query) {
    const year = Number(query.year) || new Date().getFullYear();
    this.setData({ year: year });
    wx.setNavigationBarTitle({ title: year + ' 足迹卡片' });
    this.draw();
  },

  /** 画卡片 → 导出成图片 */
  draw() {
    this.setData({ drawing: true });
    wx.createSelectorQuery()
      .in(this)
      .select('#card')
      .fields({ node: true, size: true })
      .exec((res) => {
        const item = res && res[0];
        if (!item || !item.node) {
          this.setData({ drawing: false });
          wx.showToast({ title: '画布初始化失败', icon: 'none' });
          return;
        }
        const canvas = item.node;
        const ctx = canvas.getContext('2d');
        const dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2;
        const W = item.width;
        const H = item.height;

        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.scale(dpr, dpr);

        this.paint(ctx, W, H);

        wx.canvasToTempFilePath({
          canvas: canvas,
          success: (r) => this.setData({ imagePath: r.tempFilePath, drawing: false }),
          fail: () => {
            this.setData({ drawing: false });
            wx.showToast({ title: '生成图片失败', icon: 'none' });
          }
        });
      });
  },

  /** 具体画什么 */
  paint(ctx, W, H) {
    const s = W / BASE;                 // 缩放系数
    const x = (v) => v * s;             // 坐标换算
    const g = stats.growth(this.data.year);
    const ex = stats.exploration();
    const child = store.getActiveChild();
    const profile = store.getProfile();

    const age = child ? store.ageOf(child) : null;
    const who = child
      ? child.name + (age === null ? '' : ' · ' + age + '岁')
      : (profile.nickName ? profile.nickName + ' 一家' : '我们家');

    // 底
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // 顶部绿色块
    ctx.fillStyle = C.brand;
    ctx.fillRect(0, 0, W, x(150));

    ctx.fillStyle = C.white;
    ctx.textAlign = 'left';
    ctx.font = 'bold ' + x(22) + 'px sans-serif';
    ctx.fillText(who, x(28), x(52));

    ctx.globalAlpha = 0.85;
    ctx.font = x(13) + 'px sans-serif';
    ctx.fillText(this.data.year + ' 成长足迹', x(28), x(78));
    ctx.globalAlpha = 1;

    // 大数字：「个地方」要跟在数字后面，所以量一下数字实际多宽
    const numStr = String(g.places);
    ctx.font = 'bold ' + x(58) + 'px sans-serif';
    ctx.fillText(numStr, x(28), x(132));
    const numW = ctx.measureText(numStr).width;
    ctx.font = x(14) + 'px sans-serif';
    ctx.fillText('个地方', x(28) + numW + x(8), x(132));

    // 下面用固定版式（设计稿高度 480，画布按 2:3 出图），
    // 不用 y 累加——否则分类多一行就会把进度条推到底部文字上。
    ctx.fillStyle = C.text;
    ctx.font = 'bold ' + x(14) + 'px sans-serif';
    ctx.fillText('这一年我们去了', x(28), x(186));

    ctx.font = x(14) + 'px sans-serif';
    ctx.fillStyle = C.sub;
    if (g.categories.length) {
      // 最多 4 行，多出来的合并成「其他 × n」，版式高度就固定了
      const top = g.categories.slice(0, 4);
      const restCount = g.categories.slice(4).reduce((n, c) => n + c.count, 0);
      if (restCount) top[3] = { emoji: '📍', label: '其他', count: restCount };
      top.forEach((c, i) => {
        ctx.fillText(c.emoji + ' ' + c.label + ' × ' + c.count, x(28), x(210 + i * 22));
      });
    } else {
      ctx.fillText('还没有打卡记录，先去玩一次吧', x(28), x(210));
    }

    // 统计条
    const blockY = 306;
    ctx.fillStyle = C.white;
    ctx.fillRect(x(20), x(blockY), W - x(40), x(80));
    const cols = [
      { label: '去过的区', value: g.districts },
      { label: '户外活动', value: g.outdoor },
      { label: '累计陪伴', value: g.hours + 'h' }
    ];
    cols.forEach((col, i) => {
      const cx = x(20) + (W - x(40)) / 3 * (i + 0.5);
      ctx.textAlign = 'center';
      ctx.fillStyle = C.dark;
      ctx.font = 'bold ' + x(24) + 'px sans-serif';
      ctx.fillText(String(col.value), cx, x(blockY + 36));
      ctx.fillStyle = C.faint;
      ctx.font = x(11) + 'px sans-serif';
      ctx.fillText(col.label, cx, x(blockY + 60));
    });

    // 探索度进度条
    ctx.textAlign = 'left';
    ctx.fillStyle = C.sub;
    ctx.font = x(12) + 'px sans-serif';
    ctx.fillText('深圳探索度 ' + ex.percent + '%（' + ex.visited + '/' + ex.total + '）', x(28), x(406));
    ctx.fillStyle = '#E8E4DC';
    ctx.fillRect(x(28), x(414), W - x(56), x(6));
    ctx.fillStyle = C.brand;
    ctx.fillRect(x(28), x(414), (W - x(56)) * ex.percent / 100, x(6));

    // 底部
    ctx.textAlign = 'center';
    ctx.fillStyle = C.text;
    ctx.font = 'bold ' + x(15) + 'px sans-serif';
    ctx.fillText('童年很短，周末一起去看看世界', W / 2, x(452));
    ctx.fillStyle = C.faint;
    ctx.font = x(11) + 'px sans-serif';
    ctx.fillText('深圳亲子地图', W / 2, x(472));

    this.setData({
      summary: g.checkins
        ? this.data.year + ' 年出去玩了 ' + g.checkins + ' 次，去过 ' + g.places + ' 个地方'
        : '这一年还没有打卡记录'
    });
  },

  /* ---------------- 导出 ---------------- */

  onSave() {
    if (!this.data.imagePath) return;
    wx.saveImageToPhotosAlbum({
      filePath: this.data.imagePath,
      success: () => wx.showToast({ title: '已存到相册', icon: 'success' }),
      fail: (err) => {
        // 用户拒绝过相册权限，引导去设置里打开
        if (String(err.errMsg || '').indexOf('auth') > -1) {
          wx.showModal({
            title: '需要相册权限',
            content: '保存图片需要你允许「保存到相册」。',
            confirmText: '去设置',
            success: (r) => {
              if (r.confirm) wx.openSetting();
            }
          });
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      }
    });
  },

  /** 直接把图片发给好友（基础库 2.14.4+） */
  onShareImage() {
    if (!this.data.imagePath) return;
    if (!wx.showShareImageMenu) {
      wx.showToast({ title: '当前微信版本请先保存到相册', icon: 'none' });
      return;
    }
    wx.showShareImageMenu({ path: this.data.imagePath });
  },

  onShareAppMessage() {
    return { title: '我们的童年地图', path: '/pages/map/map' };
  }
});

/**
 * 几个页面共用的交互封装
 * ------------------------------------------------------------
 * 放在这里是为了让「收藏」在地图、搜索、专题、详情四个地方行为完全一致：
 * 第一次收藏时问一下放进哪个收藏夹，取消收藏则直接取消。
 */
const store = require('./store.js');

/**
 * 切换收藏，带收藏夹选择
 * @param {string} placeId
 * @param {function} done 回调，参数是切换后是否已收藏
 */
function toggleFavorite(placeId, done) {
  const cb = done || function () {};

  if (store.isFavorited(placeId)) {
    store.removeFavorite(placeId);
    wx.showToast({ title: '已取消收藏', icon: 'none' });
    cb(false);
    return;
  }

  const folders = store.FOLDERS;
  wx.showActionSheet({
    itemList: folders.concat(['先不分类']),
    success: (res) => {
      const folder = res.tapIndex < folders.length ? folders[res.tapIndex] : '';
      store.addFavorite(placeId, folder);
      wx.showToast({ title: folder ? '已收藏到「' + folder + '」' : '已收藏', icon: 'none' });
      cb(true);
    },
    // 关掉选择框不代表不想收藏，直接存成不分类
    fail: () => {
      store.addFavorite(placeId, '');
      wx.showToast({ title: '已收藏', icon: 'none' });
      cb(true);
    }
  });
}

module.exports = { toggleFavorite };

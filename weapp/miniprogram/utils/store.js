/**
 * 本地存储层（Phase 3）
 * ------------------------------------------------------------
 * 孩子档案、收藏、个人资料都存在本机 Storage，**不需要登录**。
 *
 * 为什么 Phase 3 没做微信登录：
 *   1. 这些数据只服务于用户自己，没有跨设备协作的需求，本地存够用；
 *   2. 不强制登录，用户打开就能用，个人主体小程序过审也更稳；
 *   3. 真要上云同步，只需要在这一层的读写函数里加一次网络调用，
 *      页面代码一行都不用改（见文件末尾的「接云开发」说明）。
 *
 * 数据结构：
 *   children  [{ id, name, birthYear, gender, interests: [] }]
 *   favorites [{ placeId, folder, createdAt }]
 *   profile   { avatarUrl, nickName }
 *   checkins  [{ id, placeId, date:'2026-08-08', childIds: [], childRating, parentRating,
 *               note, photos: [], hours, createdAt }]
 *   plans     [{ id, date:'2026-08-22', items: [{ placeId, slot:'am'|'noon'|'pm' }] }]
 */

const KEYS = {
  children: 'children',
  activeChildId: 'active_child_id',
  favorites: 'favorites',
  profile: 'profile',
  checkins: 'checkins',
  plans: 'plans'
};

/** 收藏夹预设分类（PRD 二十一），用户也可以自己写一个 */
const FOLDERS = ['这个周末', '暑假去', '下次去', '下雨天备用', '免费遛娃', '户外'];

/* ------------------------------------------------------------------ 通用 */

function read(key, fallback) {
  try {
    const v = wx.getStorageSync(key);
    return v === '' || v === null || v === undefined ? fallback : v;
  } catch (e) {
    console.warn('读取本地存储失败', key, e);
    return fallback;
  }
}

function write(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (e) {
    console.warn('写入本地存储失败', key, e);
    wx.showToast({ title: '保存失败，本机存储空间可能不足', icon: 'none' });
  }
}

/** 简易唯一 id */
function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}

/* ------------------------------------------------------------------ 孩子 */

function getChildren() {
  return read(KEYS.children, []);
}

/** 新增或更新一个孩子，返回保存后的对象 */
function saveChild(child) {
  const list = getChildren();
  const item = Object.assign({ id: child.id || uid('c'), interests: [] }, child);
  const i = list.findIndex((c) => c.id === item.id);
  if (i > -1) list[i] = item;
  else list.push(item);
  write(KEYS.children, list);
  // 第一个孩子自动设为当前孩子
  if (!read(KEYS.activeChildId, '')) write(KEYS.activeChildId, item.id);
  return item;
}

function removeChild(id) {
  const list = getChildren().filter((c) => c.id !== id);
  write(KEYS.children, list);
  if (read(KEYS.activeChildId, '') === id) {
    write(KEYS.activeChildId, list.length ? list[0].id : '');
  }
}

function setActiveChildId(id) {
  write(KEYS.activeChildId, id);
}

/** 当前孩子；没有档案时返回 null */
function getActiveChild() {
  const list = getChildren();
  if (!list.length) return null;
  const id = read(KEYS.activeChildId, '');
  return list.filter((c) => c.id === id)[0] || list[0];
}

/**
 * 按出生年份算周岁（只精确到年）。
 * PRD 二十三要的就是这个效果：今年 6 岁，明年自动变 7 岁，推荐跟着变。
 */
function ageOf(child) {
  if (!child || !child.birthYear) return null;
  return Math.max(0, new Date().getFullYear() - child.birthYear);
}

/* ------------------------------------------------------------------ 收藏 */

function getFavorites() {
  return read(KEYS.favorites, []);
}

function isFavorited(placeId) {
  return getFavorites().some((f) => f.placeId === placeId);
}

function addFavorite(placeId, folder) {
  const list = getFavorites();
  if (list.some((f) => f.placeId === placeId)) return list;
  list.unshift({ placeId: placeId, folder: folder || '', createdAt: Date.now() });
  write(KEYS.favorites, list);
  return list;
}

function removeFavorite(placeId) {
  write(KEYS.favorites, getFavorites().filter((f) => f.placeId !== placeId));
}

/** 切换收藏状态，返回切换后是否已收藏 */
function toggleFavorite(placeId, folder) {
  if (isFavorited(placeId)) {
    removeFavorite(placeId);
    return false;
  }
  addFavorite(placeId, folder);
  return true;
}

/** 改某条收藏所在的收藏夹 */
function setFavoriteFolder(placeId, folder) {
  const list = getFavorites();
  const item = list.filter((f) => f.placeId === placeId)[0];
  if (!item) return;
  item.folder = folder;
  write(KEYS.favorites, list);
}

/** 当前用到过的收藏夹（预设 + 用户自定义），带每个夹子里的数量 */
function folderStats() {
  const favs = getFavorites();
  const names = FOLDERS.slice();
  favs.forEach((f) => {
    if (f.folder && names.indexOf(f.folder) === -1) names.push(f.folder);
  });
  return names.map((name) => ({
    name: name,
    count: favs.filter((f) => f.folder === name).length
  }));
}

/**
 * 给 decorate 之后的地点数组打上收藏标记，
 * 列表里 place-card 的 favorited 就是从这里来的。
 */
function markFavorites(list) {
  const ids = getFavorites().map((f) => f.placeId);
  return list.map((p) => Object.assign({}, p, { favorited: ids.indexOf(p.id) > -1 }));
}

/* ------------------------------------------------------------------ 打卡 */

/** 全部打卡记录，按日期倒序（同一天按写入时间倒序） */
function getCheckins() {
  const list = read(KEYS.checkins, []).slice();
  return list.sort((a, b) => {
    if (a.date === b.date) return (b.createdAt || 0) - (a.createdAt || 0);
    return a.date < b.date ? 1 : -1;
  });
}

/** 新增或更新一条打卡 */
function saveCheckin(c) {
  const list = read(KEYS.checkins, []);
  const item = Object.assign(
    { id: c.id || uid('k'), childIds: [], photos: [], createdAt: Date.now() },
    c
  );
  const i = list.findIndex((x) => x.id === item.id);
  if (i > -1) list[i] = item;
  else list.push(item);
  write(KEYS.checkins, list);
  return item;
}

function removeCheckin(id) {
  write(KEYS.checkins, read(KEYS.checkins, []).filter((c) => c.id !== id));
}

function getCheckin(id) {
  return read(KEYS.checkins, []).filter((c) => c.id === id)[0] || null;
}

/** 某个地点的全部打卡 */
function checkinsForPlace(placeId) {
  return getCheckins().filter((c) => c.placeId === placeId);
}

/** 去过的地点 id（去重），童年地图点亮用 */
function visitedIds() {
  const ids = [];
  read(KEYS.checkins, []).forEach((c) => {
    if (ids.indexOf(c.placeId) === -1) ids.push(c.placeId);
  });
  return ids;
}

/* ------------------------------------------------------------------ 周末计划 */

function getPlans() {
  return read(KEYS.plans, []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
}

function getPlan(id) {
  return read(KEYS.plans, []).filter((p) => p.id === id)[0] || null;
}

/** 某天的计划，没有就新建一条 */
function planOfDate(date) {
  const list = read(KEYS.plans, []);
  const found = list.filter((p) => p.date === date)[0];
  if (found) return found;
  const plan = { id: uid('p'), date: date, items: [] };
  list.push(plan);
  write(KEYS.plans, list);
  return plan;
}

function savePlan(plan) {
  const list = read(KEYS.plans, []);
  const i = list.findIndex((p) => p.id === plan.id);
  if (i > -1) list[i] = plan;
  else list.push(plan);
  write(KEYS.plans, list);
  return plan;
}

function removePlan(id) {
  write(KEYS.plans, read(KEYS.plans, []).filter((p) => p.id !== id));
}

/* ------------------------------------------------------------------ 资料 */

function getProfile() {
  return read(KEYS.profile, { avatarUrl: '', nickName: '' });
}

function saveProfile(profile) {
  write(KEYS.profile, Object.assign(getProfile(), profile));
}

/** 设置页用：清空所有本地数据 */
function clearAll() {
  Object.keys(KEYS).forEach((k) => {
    try {
      wx.removeStorageSync(KEYS[k]);
    } catch (e) {
      // 忽略
    }
  });
}

/*
 * 接云开发时怎么改（Phase 3.5）：
 *   1. 云数据库建 children / favorites 两个集合，权限「仅创建者可读写」，
 *      记录里带上 _openid，微信会自动填，不需要自己做登录；
 *   2. 把上面 read/write 换成「先读本地、异步拉云端、合并后回写本地」，
 *      页面依旧同步拿本地数据，不会因为网络慢而白屏；
 *   3. 冲突策略建议以 createdAt 较新的为准，够用了。
 */
module.exports = {
  FOLDERS,
  getChildren,
  saveChild,
  removeChild,
  getActiveChild,
  setActiveChildId,
  ageOf,
  getFavorites,
  isFavorited,
  addFavorite,
  removeFavorite,
  toggleFavorite,
  setFavoriteFolder,
  folderStats,
  markFavorites,
  getCheckins,
  getCheckin,
  saveCheckin,
  removeCheckin,
  checkinsForPlace,
  visitedIds,
  getPlans,
  getPlan,
  planOfDate,
  savePlan,
  removePlan,
  getProfile,
  saveProfile,
  clearAll
};

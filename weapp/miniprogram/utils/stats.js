/**
 * 成长统计（PRD 十八、十九、二十）
 * ------------------------------------------------------------
 * 全部由打卡记录算出来，不额外存一份统计结果——
 * 免得改了/删了打卡以后数字对不上。
 *
 * 「累计陪伴」优先用打卡时填的时长；没填就退回地点的建议游玩时长，
 * 这样不至于因为用户懒得填就一直是 0。
 */
const placeUtil = require('./place.js');
const store = require('./store.js');
const { CATEGORY_MAP } = require('./../data/categories.js');

/** 算「博物馆」「自然探索」这类归类时用的分类集合 */
const GROUPS = {
  museum: ['museum', 'science', 'art', 'library'],
  nature: ['nature', 'hiking', 'farm', 'animal', 'seaside']
};

function placeMap() {
  const m = {};
  placeUtil.getAll().forEach((p) => {
    m[p.id] = p;
  });
  return m;
}

/**
 * 某一年的成长足迹
 * @param {number} year 不传则统计全部
 */
function growth(year) {
  const map = placeMap();
  const all = store.getCheckins();
  const list = year ? all.filter((c) => String(c.date || '').slice(0, 4) === String(year)) : all;

  const placeIds = [];
  const districts = [];
  const categoryCount = {};
  let outdoor = 0;
  let museum = 0;
  let nature = 0;
  let hours = 0;

  list.forEach((c) => {
    const p = map[c.placeId];
    if (!p) return; // 地点被删了就跳过，不让统计崩
    if (placeIds.indexOf(p.id) === -1) placeIds.push(p.id);
    if (districts.indexOf(p.district) === -1) districts.push(p.district);
    categoryCount[p.category] = (categoryCount[p.category] || 0) + 1;
    if (p.outdoor) outdoor++;
    if (GROUPS.museum.indexOf(p.category) > -1) museum++;
    if (GROUPS.nature.indexOf(p.category) > -1) nature++;
    hours += Number(c.hours) || p.duration || 0;
  });

  return {
    year: year || null,
    checkins: list.length,     // 出去玩了多少次
    places: placeIds.length,   // 去过多少个不同的地方
    districts: districts.length,
    outdoor: outdoor,
    museum: museum,
    nature: nature,
    hours: Math.round(hours),
    /** [{key,label,emoji,count}]，分享卡片用，按次数倒序 */
    categories: Object.keys(categoryCount)
      .map((k) => ({
        key: k,
        label: (CATEGORY_MAP[k] || {}).label || k,
        emoji: (CATEGORY_MAP[k] || {}).emoji || '📍',
        count: categoryCount[k]
      }))
      .sort((a, b) => b.count - a.count)
  };
}

/**
 * 深圳探索度：去过的地点 / 收录的地点
 * 收录的地点会越来越多，所以这个百分比是「相对当前数据库」的，
 * 页面上要写清楚分母，不然用户会以为自己在倒退。
 */
function exploration() {
  const total = placeUtil.getAll().length;
  const visited = store.visitedIds().length;
  return {
    visited: visited,
    total: total,
    percent: total ? Math.round((visited / total) * 100) : 0
  };
}

module.exports = { growth, exploration };

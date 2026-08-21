/**
 * 地点数据的加工与筛选
 * ------------------------------------------------------------
 * 页面只管拿结果渲染，所有「算距离、拼文案、过滤」的逻辑都收在这里，
 * 以后数据从云数据库来，也只需要换 data 层，这里不用动。
 */
const { PLACES } = require('../data/places.js');
const { CATEGORY_MAP, AGE_GROUPS, PARKING_TEXT, CROWD_TEXT } = require('../data/categories.js');
const geo = require('./geo.js');

/** 默认筛选条件。页面里 Object.assign 一份再改，避免互相污染 */
function emptyFilters() {
  return {
    keyword: '',        // 关键词（Phase 2 搜索用）
    ageGroup: '',       // '0-2' | '3-5' | '6-8' | '9-12'
    districts: [],      // 行政区
    categories: [],     // 主分类 key
    env: '',            // 'indoor' | 'outdoor'
    maxPrice: null,     // 费用上限，0 表示只看免费
    maxDistance: null,  // 距离上限（km）
    maxDuration: null,  // 时长上限（小时）
    features: [],       // 其他条件，key 直接对应 place 上的布尔字段
    weather: '',        // 天气适配：weatherTags 里的键，要求评分 >= 4（专题用）
    bounds: null,       // 地图可视范围 {southwest, northeast}，「搜索这片区域」用
    ids: []             // 只看这些 id（收藏、打卡记录放到地图上看时用）
  };
}

/** 除 keyword / bounds 外，用户主动选了几个条件——用来在按钮上显示角标 */
function countConditions(f) {
  const cond = Object.assign(emptyFilters(), f || {});
  let n = 0;
  if (cond.ageGroup) n++;
  if (cond.env) n++;
  if (cond.maxPrice !== null && cond.maxPrice !== undefined) n++;
  if (cond.maxDistance) n++;
  if (cond.maxDuration) n++;
  if (cond.weather) n++;
  n += cond.districts.length + cond.categories.length + cond.features.length;
  return n;
}

/**
 * 给一条地点补上展示用字段（不改原数据）
 * @param {object} place 原始地点
 * @param {object} location 用户位置 {latitude, longitude}，可为空
 */
function decorate(place, location) {
  const cat = CATEGORY_MAP[place.category] || {};
  const km = location ? geo.distanceKm(location, place) : null;
  const driveMin = geo.estimateDriveMinutes(km);
  // 模糊定位（wx.getFuzzyLocation）时，app.js 会在 location 上打这个标记，
  // 距离和车程的文案跟着说得含糊一点，别给出做不到的精度
  const fuzzy = !!(location && location.fuzzy);
  return Object.assign({}, place, {
    categoryLabel: cat.label || '',
    categoryEmoji: cat.emoji || '📍',
    categoryColor: cat.color || '#4B7A5A',
    markerIcon: '/images/markers/' + place.category + '.png',
    distanceKm: km,
    distanceFuzzy: fuzzy,
    distanceText: geo.formatDistance(km, fuzzy),
    driveText: geo.formatDriveMinutes(driveMin, fuzzy),
    ageText: place.ageMin + '-' + place.ageMax + '岁',
    priceText: place.free ? '免费' : '人均' + place.price + '元',
    durationText: '建议' + place.duration + '小时',
    parkingText: PARKING_TEXT[place.parking] || '',
    crowdText: CROWD_TEXT[place.crowdLevel] || '',
    scoreText: place.recommendScore.toFixed(1),
    /**
     * 核实状态文案。
     * lastVerifiedAt 为空 = 这条还没逐条核实过，就必须明说，
     * 不能拿整理日期冒充核实日期 —— 用户按一个假的「最后核实」
     * 开车带孩子过去，发现闭馆或涨价，这比不显示更糟。
     */
    verified: !!place.lastVerifiedAt,
    verifiedText: place.lastVerifiedAt
      ? '最后核实 ' + place.lastVerifiedAt
      : '信息未逐条核实，出发前请再确认',
    /** 卡片上最多显示 3 个玩法标签 */
    topTags: (place.tags || []).slice(0, 3)
  });
}

/** 批量加工 */
function decorateAll(list, location) {
  return list.map((p) => decorate(p, location));
}

/**
 * 按条件筛选。传进来的应该是 decorate 之后的数组（需要 distanceKm）。
 * 任一条件为空即视为不限制。
 */
function filter(list, f) {
  const cond = Object.assign(emptyFilters(), f || {});
  return list.filter((p) => {
    // 关键词：名称、区域、分类、标签任一命中
    if (cond.keyword) {
      const kw = cond.keyword.trim().toLowerCase();
      const hay = [p.name, p.district, p.categoryLabel, p.address]
        .concat(p.tags || []).join(' ').toLowerCase();
      if (hay.indexOf(kw) === -1) return false;
    }
    // 年龄：该年龄段评分 >= 3 才算适合
    if (cond.ageGroup) {
      const score = (p.ageRatings || {})[cond.ageGroup] || 0;
      if (score < 3) return false;
    }
    if (cond.districts.length && cond.districts.indexOf(p.district) === -1) return false;
    if (cond.categories.length && cond.categories.indexOf(p.category) === -1) return false;
    if (cond.env === 'indoor' && !p.indoor) return false;
    if (cond.env === 'outdoor' && !p.outdoor) return false;
    if (cond.maxPrice !== null && cond.maxPrice !== undefined && p.price > cond.maxPrice) return false;
    if (cond.maxDuration && p.duration > cond.maxDuration) return false;
    if (cond.maxDistance && (p.distanceKm === null || p.distanceKm > cond.maxDistance)) return false;
    // 天气适配：该天气下评分 >= 4 才算合适（0 分是「这天别去」）
    if (cond.weather) {
      const ws = (p.weatherTags || {})[cond.weather] || 0;
      if (ws < 4) return false;
    }
    // 指定 id（收藏 / 打卡）
    if (cond.ids && cond.ids.length && cond.ids.indexOf(p.id) === -1) return false;
    // 地图可视范围
    if (cond.bounds) {
      const sw = cond.bounds.southwest;
      const ne = cond.bounds.northeast;
      if (p.latitude < sw.latitude || p.latitude > ne.latitude) return false;
      if (p.longitude < sw.longitude || p.longitude > ne.longitude) return false;
    }
    // 其他条件：features 里的 key 直接当布尔字段查
    for (let i = 0; i < cond.features.length; i++) {
      if (!p[cond.features[i]]) return false;
    }
    return true;
  });
}

/** 排序：'distance' 由近到远（没有定位时退化为按推荐分），'score' 按推荐分 */
function sort(list, by) {
  const arr = list.slice();
  if (by === 'distance' && arr.length && arr[0].distanceKm !== null) {
    return arr.sort((a, b) => a.distanceKm - b.distanceKm);
  }
  return arr.sort((a, b) => b.recommendScore - a.recommendScore);
}

/** 取全部原始数据（以后换成云函数请求，只改这一个函数） */
function getAll() {
  return PLACES;
}

/** 按 id 取一条 */
function getById(id) {
  return PLACES.filter((p) => p.id === id)[0] || null;
}

/** 年龄段评分转成星星文案，详情页用 */
function ageRatingRows(place) {
  return AGE_GROUPS.map((g) => {
    const score = (place.ageRatings || {})[g.key] || 0;
    return {
      key: g.key,
      label: g.label,
      score: score,
      stars: '★★★★★'.slice(0, score) + '☆☆☆☆☆'.slice(0, 5 - score)
    };
  });
}

module.exports = {
  emptyFilters,
  countConditions,
  decorate,
  decorateAll,
  filter,
  sort,
  getAll,
  getById,
  ageRatingRows
};

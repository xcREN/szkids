/**
 * 全局常量：分类 / 区域 / 年龄 / 筛选项
 * ------------------------------------------------------------
 * 所有页面的筛选、Marker 图标、标签展示都从这里取，避免各处写死。
 * 新增一个分类：在 CATEGORIES 里加一项，并在
 * images/markers/ 下放一张同名 png（用 tools/gen_assets.py 生成）。
 */

/** 地点主分类。color 只用四组，保证地图上的视觉体系统一 */
const CATEGORIES = [
  { key: 'park',       label: '公园',     emoji: '🌳', color: '#4B7A5A' },
  { key: 'climbing',   label: '攀爬',     emoji: '🧗', color: '#4B7A5A' },
  { key: 'cycling',    label: '骑行',     emoji: '🚲', color: '#4B7A5A' },
  { key: 'camping',    label: '露营',     emoji: '⛺', color: '#4B7A5A' },
  { key: 'hiking',     label: '徒步',     emoji: '🥾', color: '#4B7A5A' },
  { key: 'nature',     label: '自然探索', emoji: '🌿', color: '#4B7A5A' },
  { key: 'farm',       label: '农场',     emoji: '🐄', color: '#4B7A5A' },
  { key: 'animal',     label: '动物',     emoji: '🦒', color: '#4B7A5A' },
  { key: 'water',      label: '玩水',     emoji: '💦', color: '#3F7F8C' },
  { key: 'seaside',    label: '海边',     emoji: '🏖', color: '#3F7F8C' },
  { key: 'museum',     label: '博物馆',   emoji: '🏛', color: '#B5714C' },
  { key: 'science',    label: '科技馆',   emoji: '🔬', color: '#B5714C' },
  { key: 'library',    label: '图书馆',   emoji: '📚', color: '#B5714C' },
  { key: 'art',        label: '美术馆',   emoji: '🎨', color: '#B5714C' },
  { key: 'playground', label: '室内乐园', emoji: '🎠', color: '#7E6A92' },
  { key: 'sports',     label: '体育运动', emoji: '⛹', color: '#7E6A92' }
];

/** key -> 分类对象，取图标/颜色用 */
const CATEGORY_MAP = CATEGORIES.reduce((acc, c) => {
  acc[c.key] = c;
  return acc;
}, {});

/** 深圳行政区。以后扩到东莞/惠州时，这里加 city 字段即可 */
const DISTRICTS = ['福田', '南山', '罗湖', '宝安', '龙岗', '龙华', '光明', '坪山', '盐田', '大鹏'];

/** 年龄段。key 同时是 place.ageRatings 的键 */
const AGE_GROUPS = [
  { key: '0-2',  label: '0-2岁',  min: 0, max: 2 },
  { key: '3-5',  label: '3-5岁',  min: 3, max: 5 },
  { key: '6-8',  label: '6-8岁',  min: 6, max: 8 },
  { key: '9-12', label: '9-12岁', min: 9, max: 12 }
];

/** 年龄 -> 所属年龄段 key，孩子档案按年龄自动推荐时用 */
function groupForAge(age) {
  const g = AGE_GROUPS.filter((x) => age >= x.min && age <= x.max)[0];
  // 超过 12 岁的按最大一档算，不至于筛不出东西
  return g ? g.key : (age > 12 ? AGE_GROUPS[AGE_GROUPS.length - 1].key : '');
}

/** 孩子兴趣，和活动类型对应，用来做推荐（PRD 二十三） */
const INTERESTS = [
  { key: 'climbing', label: '攀爬', emoji: '🧗' },
  { key: 'water', label: '玩水', emoji: '💦' },
  { key: 'animal', label: '动物', emoji: '🦒' },
  { key: 'nature', label: '自然', emoji: '🌿' },
  { key: 'science', label: '科学', emoji: '🔬' },
  { key: 'cycling', label: '骑行', emoji: '🚲' },
  { key: 'library', label: '阅读', emoji: '📚' },
  { key: 'art', label: '艺术', emoji: '🎨' }
];

/** 场地环境 */
const ENV_OPTIONS = [
  { key: 'outdoor', label: '户外' },
  { key: 'indoor',  label: '室内' }
];

/** 费用档位（元，max 为上限） */
const PRICE_OPTIONS = [
  { key: 'free', label: '免费',      max: 0 },
  { key: '50',   label: '50元以内',  max: 50 },
  { key: '100',  label: '100元以内', max: 100 },
  { key: '200',  label: '200元以内', max: 200 }
];

/** 距离档位（km） */
const DISTANCE_OPTIONS = [5, 10, 20, 30, 50];

/** 建议游玩时长（小时，max 为上限） */
const DURATION_OPTIONS = [
  { key: '1',    label: '1小时',   max: 1 },
  { key: '3',    label: '2-3小时', max: 3 },
  { key: 'half', label: '半天',    max: 4 },
  { key: 'day',  label: '一天',    max: 24 }
];

/**
 * 其他条件。key 直接对应 place 上的布尔字段，
 * 筛选时按 place[key] === true 判断，加新条件不用改筛选代码。
 */
const FEATURE_OPTIONS = [
  { key: 'freeParking', label: '免费停车', emoji: '🅿️' },
  { key: 'toilet',      label: '有卫生间', emoji: '🚻' },
  { key: 'stroller',    label: '可推婴儿车', emoji: '👶' },
  { key: 'babyRoom',    label: '有母婴室', emoji: '🍼' },
  { key: 'camping',     label: '可搭帐篷', emoji: '⛺' },
  { key: 'picnic',      label: '可以野餐', emoji: '🍱' },
  { key: 'cycling',     label: '可以骑车', emoji: '🚲' },
  { key: 'waterPlay',   label: '可以玩水', emoji: '💦' },
  { key: 'climbing',    label: '有攀爬',   emoji: '🧗' },
  { key: 'pet',         label: '可带宠物', emoji: '🐶' },
  { key: 'noReservation', label: '无需预约', emoji: '✅' }
];

/** 停车情况文案 */
const PARKING_TEXT = {
  free: '免费停车',
  paid: '有停车场（收费）',
  hard: '停车较难',
  none: '无停车场'
};

/** 人流程度文案 */
const CROWD_TEXT = { low: '人少', mid: '周末人中等', high: '周末人多' };

module.exports = {
  CATEGORIES,
  INTERESTS,
  groupForAge,
  CATEGORY_MAP,
  DISTRICTS,
  AGE_GROUPS,
  ENV_OPTIONS,
  PRICE_OPTIONS,
  DISTANCE_OPTIONS,
  DURATION_OPTIONS,
  FEATURE_OPTIONS,
  PARKING_TEXT,
  CROWD_TEXT
};

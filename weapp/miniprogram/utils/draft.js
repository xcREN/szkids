/**
 * 我的地点（本地草稿）
 * ------------------------------------------------------------
 * 用户在手机上自己添加的地点，**只存在这台手机里**，不上传、别人看不到。
 *
 * 为什么要有这个：
 *   places.js 里的 26 条是查资料整理的，一条都没到现场核实过。
 *   而作者本人带孩子出门时是**站在现场**的 —— 开放时间、有没有卫生间、
 *   停车收不收费、有没有树荫，这些在现场是一眼看到的事实，
 *   比在电脑上查官网可靠得多。所以录入这件事应该发生在手机上、在现场。
 *
 * 数据怎么回到正式库：
 *   草稿录完 → toCode() 生成 places.js 格式的代码 → 复制到剪贴板 →
 *   发给自己（文件传输助手）→ 电脑上粘进 data/places.js → 下个版本发布。
 *   小程序的代码包是静态的，运行时加的数据进不了包，这一步绕不过去。
 *
 * 草稿会被 utils/place.js 的 getAll() 合并进来，所以录完立刻能在地图上看到，
 * 坐标点歪了当场就能发现。代价是童年地图的探索度分母会变大 ——
 * 这是对的：你现在知道了一个还没去过的地方。
 */
const AGE_GROUPS = ['0-2', '3-5', '6-8', '9-12'];

const STORAGE_KEY = 'place_drafts';

/** 和 data/places.js 顶部的 W 一一对应，导出时会还原成 W.xxx 的写法 */
const WEATHER_PRESETS = {
  outdoorShade: { label: '户外·有树荫', v: { sunny: 5, cloudy: 5, lightRain: 2, heavyRain: 0, hot: 3, cold: 5 } },
  outdoorOpen:  { label: '户外·空旷暴晒', v: { sunny: 4, cloudy: 5, lightRain: 1, heavyRain: 0, hot: 2, cold: 4 } },
  indoor:       { label: '室内', v: { sunny: 3, cloudy: 4, lightRain: 5, heavyRain: 5, hot: 5, cold: 5 } },
  water:        { label: '玩水', v: { sunny: 5, cloudy: 4, lightRain: 1, heavyRain: 0, hot: 5, cold: 1 } }
};

/** 现场用得上的设施勾选项，key 直接是 place 上的布尔字段 */
const FACILITIES = [
  { key: 'toilet', label: '有卫生间' },
  { key: 'babyRoom', label: '有母婴室' },
  { key: 'stroller', label: '可推婴儿车' },
  { key: 'picnic', label: '可以野餐' },
  { key: 'camping', label: '可搭帐篷' },
  { key: 'cycling', label: '可以骑车' },
  { key: 'waterPlay', label: '可以玩水' },
  { key: 'climbing', label: '有攀爬' },
  { key: 'pet', label: '可带宠物' }
];

/* ------------------------------------------------------------------ 存储 */

function readAll() {
  try {
    const v = wx.getStorageSync(STORAGE_KEY);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

function writeAll(list) {
  try {
    wx.setStorageSync(STORAGE_KEY, list);
    return true;
  } catch (e) {
    wx.showToast({ title: '保存失败，本机存储可能满了', icon: 'none' });
    return false;
  }
}

/** 按最后修改时间倒序 */
function list() {
  return readAll().slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function get(id) {
  return readAll().filter((d) => d.id === id)[0] || null;
}

function remove(id) {
  writeAll(readAll().filter((d) => d.id !== id));
}

function count() {
  return readAll().length;
}

/** 发布成功后记一笔，列表页据此区分「已发布」和「只有你看得到」 */
function markPublished(id) {
  const all = readAll();
  const item = all.filter((d) => d.id === id)[0];
  if (!item) return null;
  item.publishedAt = Date.now();
  writeAll(all);
  return item;
}

/**
 * 生成 id。
 * 用时间戳而不是拼音：手机上没法可靠地把中文转成拼音，
 * 而 id 只要唯一且稳定就行 —— 导出到 places.js 时再由你改成好看的名字。
 */
function makeId() {
  return 'my-' + Date.now().toString(36);
}

/** 新建一条空草稿（不落盘），字段和 places.js 对齐 */
function blank() {
  const d = {
    id: makeId(),
    name: '',
    city: '深圳',
    district: '福田',
    latitude: null,
    longitude: null,
    address: '',
    openingHours: '',
    phone: '',
    category: 'park',
    tags: [],
    ageMin: 3,
    ageMax: 12,
    indoor: false,
    outdoor: true,
    price: 0,
    parking: 'paid',
    reservation: false,
    duration: 3,
    crowdLevel: 'mid',
    weatherPreset: 'outdoorShade',
    recommendScore: 4,
    description: '',
    reasons: [],
    tips: '',
    verified: false,      // 我人在现场核实过
    publishedAt: 0,       // 发布到云端公共库的时间；0 = 还没发布过
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  FACILITIES.forEach((f) => { d[f.key] = false; });
  return d;
}

function save(draft) {
  const all = readAll();
  const item = Object.assign({}, draft, { updatedAt: Date.now() });
  const i = all.findIndex((d) => d.id === item.id);
  if (i > -1) all[i] = item;
  else all.push(item);
  writeAll(all);
  return item;
}

/* ------------------------------------------------------------------ 转换 */

/**
 * 由推荐年龄区间推出四个年龄段的评分。
 * 手机上让用户填四个数字太重了，而这个映射足够合理：
 * 落在区间里给 5，紧挨着区间边缘给 3（勉强能玩），再远给 1。
 * 导出后想微调，在 places.js 里改就是了。
 */
function ratingsFor(ageMin, ageMax) {
  const RANGE = { '0-2': [0, 2], '3-5': [3, 5], '6-8': [6, 8], '9-12': [9, 12] };
  const out = {};
  AGE_GROUPS.forEach((g) => {
    const [lo, hi] = RANGE[g];
    if (hi >= ageMin && lo <= ageMax) out[g] = 5;            // 有重叠
    else if (lo - ageMax <= 2 && ageMin - hi <= 2) out[g] = 3; // 差 2 岁以内
    else out[g] = 1;
  });
  return out;
}

/** 草稿 -> 和 places.js 里一条数据完全同构的对象（给地图/推荐直接用） */
function toPlace(d) {
  const w = (WEATHER_PRESETS[d.weatherPreset] || WEATHER_PRESETS.outdoorShade).v;
  const p = {
    id: d.id,
    name: d.name || '未命名地点',
    city: d.city || '深圳',
    district: d.district,
    latitude: d.latitude,
    longitude: d.longitude,
    address: d.address || '',
    openingHours: d.openingHours || '',
    phone: d.phone || '',
    category: d.category,
    tags: d.tags || [],
    ageMin: d.ageMin,
    ageMax: d.ageMax,
    ageRatings: ratingsFor(d.ageMin, d.ageMax),
    indoor: !!d.indoor,
    outdoor: !!d.outdoor,
    price: Number(d.price) || 0,
    free: (Number(d.price) || 0) === 0,
    parking: d.parking,
    freeParking: d.parking === 'free',
    reservation: !!d.reservation,
    noReservation: !d.reservation,
    duration: Number(d.duration) || 2,
    crowdLevel: d.crowdLevel,
    weatherTags: w,
    recommendScore: Number(d.recommendScore) || 4,
    description: d.description || '',
    reasons: d.reasons || [],
    tips: d.tips || '',
    images: [],
    source: d.verified ? '现场核实' : '我自己添加',
    lastVerifiedAt: d.verified ? dateOf(d.updatedAt) : '',
    compiledAt: dateOf(d.createdAt),
    /** 标记：地图和详情页据此提示「只有你自己看得到」 */
    isDraft: true,
    published: !!d.publishedAt
  };
  FACILITIES.forEach((f) => { p[f.key] = !!d[f.key]; });
  return p;
}

function dateOf(ts) {
  const d = new Date(ts || Date.now());
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/** 必填校验，返回问题数组（空 = 可以保存） */
function validate(d) {
  const errs = [];
  if (!String(d.name || '').trim()) errs.push('还没填名称');
  if (d.latitude === null || d.longitude === null) errs.push('还没在地图上点出位置');
  else if (d.latitude < 22.3 || d.latitude > 23.0 || d.longitude < 113.6 || d.longitude > 114.8) {
    errs.push('位置不在深圳范围内，确认一下点对了没有');
  }
  if (!d.indoor && !d.outdoor) errs.push('室内还是户外，至少选一个');
  return errs;
}

/* ------------------------------------------------------------------ 导出 */

/** 单引号字符串里的 ' 和 \ 要转义，否则粘进 js 会语法错误 */
function esc(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function arr(a) {
  return '[' + (a || []).map((s) => "'" + esc(s) + "'").join(', ') + ']';
}

function bool(v) {
  return v ? 'true' : 'false';
}

/**
 * 生成能直接粘进 data/places.js 的代码。
 * weatherTags 输出成 W.xxx 的引用而不是展开的对象，和现有 26 条写法保持一致。
 */
function toCode(d) {
  const p = toPlace(d);
  const L = [];
  L.push('  {');
  L.push("    id: '" + esc(p.id) + "',");
  L.push("    name: '" + esc(p.name) + "',");
  L.push("    city: '深圳', district: '" + esc(p.district) + "',");
  L.push('    latitude: ' + p.latitude + ', longitude: ' + p.longitude + ',');
  L.push("    address: '" + esc(p.address) + "',");
  L.push("    openingHours: '" + esc(p.openingHours) + "', phone: '" + esc(p.phone) + "',");
  L.push("    category: '" + p.category + "', tags: " + arr(p.tags) + ',');
  L.push('    ageMin: ' + p.ageMin + ', ageMax: ' + p.ageMax + ',');
  L.push('    ageRatings: { ' + AGE_GROUPS.map((g) => "'" + g + "': " + p.ageRatings[g]).join(', ') + ' },');
  L.push('    indoor: ' + bool(p.indoor) + ', outdoor: ' + bool(p.outdoor) + ',');
  L.push('    price: ' + p.price + ', free: ' + bool(p.free) + ',');
  L.push("    parking: '" + p.parking + "', freeParking: " + bool(p.freeParking) + ',');
  L.push('    toilet: ' + bool(p.toilet) + ', babyRoom: ' + bool(p.babyRoom) + ', stroller: ' + bool(p.stroller) + ',');
  L.push('    camping: ' + bool(p.camping) + ', picnic: ' + bool(p.picnic) + ', cycling: ' + bool(p.cycling) +
         ', waterPlay: ' + bool(p.waterPlay) + ', climbing: ' + bool(p.climbing) + ', pet: ' + bool(p.pet) + ',');
  L.push('    reservation: ' + bool(p.reservation) + ', noReservation: ' + bool(p.noReservation) + ',');
  L.push("    duration: " + p.duration + ", crowdLevel: '" + p.crowdLevel + "',");
  L.push('    weatherTags: W.' + d.weatherPreset + ',');
  L.push('    recommendScore: ' + p.recommendScore + ',');
  L.push("    description: '" + esc(p.description) + "',");
  L.push('    reasons: ' + arr(p.reasons) + ',');
  L.push("    tips: '" + esc(p.tips) + "',");
  L.push('    images: [],');
  L.push("    source: '现场核实', lastVerifiedAt: '" + p.lastVerifiedAt + "', compiledAt: '" + p.compiledAt + "'");
  L.push('  },');
  return L.join('\n');
}

/** 全部草稿的代码，带一行说明 */
function toCodeAll() {
  const all = list();
  if (!all.length) return '';
  return '  // ---- 以下 ' + all.length + ' 条由手机端录入，粘进 PLACES 数组里 ----\n' +
    all.map(toCode).join('\n');
}

module.exports = {
  AGE_GROUPS,
  WEATHER_PRESETS,
  FACILITIES,
  list,
  get,
  save,
  remove,
  count,
  markPublished,
  blank,
  toPlace,
  ratingsFor,
  validate,
  toCode,
  toCodeAll
};

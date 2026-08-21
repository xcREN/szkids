/**
 * 「今天去哪」推荐（Phase 5）
 * ------------------------------------------------------------
 * PRD 十五：**帮用户做决定，不是制造更多选择**。所以这里只出 3 个，
 * 而且每个都必须说得出「为什么是它」——没有理由的推荐等于随机排序，
 * 用户不会信，也就不会用。
 *
 * 五个维度加权，全部来自已有数据，不需要任何后台：
 *
 *   天气 weatherTags[今天的档]   权重 1.2   —— Phase 5 新接入的那一维
 *   年龄 ageRatings[孩子年龄档]  权重 1.2   —— 原则二：儿童年龄第一
 *   基础 recommendScore          权重 1.0   —— 编辑给的亲子推荐指数
 *   兴趣 孩子档案里的 interests  权重 1.0
 *   距离 越近越高                权重 0.8   —— 带娃出门，远一点就不去了
 *   新鲜 没打卡过的加分          权重 0.6   —— 别老推同一个公园
 *
 * 一条硬规则：weatherTags 里今天这档是 0 分的直接**排除**，不参与打分。
 * 0 分在 places.js 的语义就是「这天别去」（比如暴雨天的空旷草地），
 * 让它靠其他维度补分补回来是错的。
 */
const geo = require('./geo.js');
const store = require('./store.js');

/**
 * 兴趣 key（data/categories.js 的 INTERESTS）怎么算命中一个地点。
 * 单纯比 category 会漏：喜欢玩水的孩子，海边和带戏水区的公园都该算。
 */
const INTEREST_MATCH = {
  climbing: (p) => p.category === 'climbing' || !!p.climbing,
  water: (p) => p.category === 'water' || p.category === 'seaside' || !!p.waterPlay,
  animal: (p) => p.category === 'animal' || p.category === 'farm',
  nature: (p) => p.category === 'nature' || p.category === 'hiking' || p.category === 'park',
  science: (p) => p.category === 'science',
  cycling: (p) => p.category === 'cycling' || !!p.cycling,
  library: (p) => p.category === 'library',
  art: (p) => p.category === 'art' || p.category === 'museum'
};

const WEIGHTS = {
  weather: 1.2,
  age: 1.2,
  base: 1.0,
  interest: 1.0,
  distance: 0.8,
  fresh: 0.6
};

/** 距离转 0~5 分：5km 内满分，40km 外 0 分，中间线性 */
function distanceScore(km) {
  if (km === null || km === undefined) return 3;   // 没定位，给个中间值，不因此惩罚任何地点
  if (km <= 5) return 5;
  if (km >= 40) return 0;
  return 5 * (1 - (km - 5) / 35);
}

/** 命中几个兴趣 → 0~5 分（命中 2 个就满分，再多也不额外加） */
function interestScore(place, interests) {
  if (!interests || !interests.length) return 3;   // 没填兴趣，中间值，不影响排序
  let hits = 0;
  interests.forEach((k) => {
    const fn = INTEREST_MATCH[k];
    if (fn && fn(place)) hits++;
  });
  return Math.min(hits, 2) * 2.5;
}

/**
 * 给一个地点打分。
 * @param {object} p       decorate 之后的地点
 * @param {object} ctx     {weatherTag, ageGroup, interests, visitedIds, penalty}
 * @returns {object|null}  null = 被硬规则排除
 */
function scoreOne(p, ctx) {
  const wt = p.weatherTags || {};
  let weather = 3;   // 没接上天气时给中间值：这一维不参与区分，其他维照常起作用
  if (ctx.weatherTag) {
    const w = wt[ctx.weatherTag];
    if (w === 0) return null;              // 硬规则：这天别去
    weather = typeof w === 'number' ? w : 3;
  }

  const age = ctx.ageGroup
    ? ((p.ageRatings || {})[ctx.ageGroup] || 0)
    : (p.recommendScore || 3);

  const parts = {
    weather: weather,
    age: age,
    base: p.recommendScore || 3,
    interest: interestScore(p, ctx.interests),
    distance: distanceScore(p.distanceKm),
    fresh: (ctx.visitedIds && ctx.visitedIds.indexOf(p.id) > -1) ? 1 : 5
  };

  let sum = 0;
  let total = 0;
  Object.keys(WEIGHTS).forEach((k) => {
    sum += parts[k] * WEIGHTS[k];
    total += WEIGHTS[k];
  });

  return { place: p, score: sum / total, parts: parts };
}

/**
 * 生成「为什么推荐它」。最多两条，短句，避免变成又一段说明文。
 * 顺序即优先级：先说今天才成立的理由（天气），再说这个孩子才成立的（年龄/兴趣），
 * 最后才是任何时候都成立的（免费、近）。
 */
function reasonsFor(item, ctx) {
  const p = item.place;
  const s = item.parts;
  const out = [];
  const who = ctx.childName || '孩子';

  if (ctx.weatherTag && s.weather >= 5) {
    out.push('今天' + (ctx.weatherLabel || '这天气') + '，这里正合适');
  } else if (ctx.weatherTag && s.weather >= 4 && p.indoor) {
    out.push('室内，不受天气影响');
  }

  if (out.length < 2 && ctx.ageGroup && s.age >= 5) {
    out.push(who + '这个年龄玩得最开');
  }
  if (out.length < 2 && s.interest >= 2.5 && ctx.interests && ctx.interests.length) {
    out.push('对上了' + who + '的兴趣');
  }
  if (out.length < 2 && s.fresh === 5) {
    out.push('还没去过');
  }
  if (out.length < 2 && p.free) {
    out.push('免费');
  }
  if (out.length < 2 && p.distanceKm !== null && p.distanceKm <= 10) {
    out.push('只有 ' + p.distanceText);
  }
  if (!out.length) out.push('综合评分最高的一个');
  return out;
}

/** 从页面/存储里凑齐打分要用的上下文 */
function buildContext(weather, ageGroup) {
  const child = store.getActiveChild();
  return {
    weatherTag: (weather && weather.ok) ? weather.tag : '',
    weatherLabel: (weather && weather.ok) ? weather.text : '',
    ageGroup: ageGroup || '',
    childName: child ? child.name : '',
    interests: child ? (child.interests || []) : [],
    visitedIds: store.visitedIds()
  };
}

/**
 * 挑 3 个。
 *
 * 用贪心逐个挑而不是直接取 top3，是为了**避免三个都是公园**：
 * 每选中一个，同分类的剩余地点打七折再选下一个。
 * 三个同类型的选项对「今天去哪」这个问题没有帮助——
 * 用户要的是三个不同的方向，不是一个方向的三个变体。
 */
function pickTop(list, ctx, n) {
  const scored = [];
  list.forEach((p) => {
    const r = scoreOne(p, ctx);
    if (r) scored.push(r);
  });
  scored.sort((a, b) => b.score - a.score);

  const picked = [];
  const usedCategory = {};
  const count = n || 3;

  while (picked.length < count && scored.length) {
    let bestIndex = -1;
    let bestValue = -1;
    for (let i = 0; i < scored.length; i++) {
      const it = scored[i];
      const penalty = usedCategory[it.place.category] ? 0.7 : 1;
      const v = it.score * penalty;
      if (v > bestValue) {
        bestValue = v;
        bestIndex = i;
      }
    }
    const chosen = scored.splice(bestIndex, 1)[0];
    usedCategory[chosen.place.category] = true;
    picked.push(Object.assign({}, chosen, { reasons: reasonsFor(chosen, ctx) }));
  }
  return picked;
}

/**
 * 摇一摇 / 帮我决定：随机推一个。
 *
 * 不是纯随机——在前 8 名里按分数加权抽。
 * 纯随机会抽到明显不合适的（比如暴雨天的沙滩），一次就把信任毁掉了；
 * 只取第一名又失去了「摇」的意义。加权抽签兼顾两头。
 */
function pickRandom(list, ctx, excludeId) {
  const scored = [];
  list.forEach((p) => {
    if (excludeId && p.id === excludeId) return;
    const r = scoreOne(p, ctx);
    if (r) scored.push(r);
  });
  if (!scored.length) return null;

  scored.sort((a, b) => b.score - a.score);
  const pool = scored.slice(0, 8);

  // 减去池子里的最低分再当权重，拉开差距，否则 3.9 和 4.1 几乎等概率
  const floor = pool[pool.length - 1].score - 0.2;
  let total = 0;
  pool.forEach((it) => { total += (it.score - floor); });

  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= (pool[i].score - floor);
    if (r <= 0) {
      return Object.assign({}, pool[i], { reasons: reasonsFor(pool[i], ctx) });
    }
  }
  const last = pool[pool.length - 1];
  return Object.assign({}, last, { reasons: reasonsFor(last, ctx) });
}

module.exports = {
  WEIGHTS,
  INTEREST_MATCH,
  scoreOne,
  buildContext,
  pickTop,
  pickRandom
};

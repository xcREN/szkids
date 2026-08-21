/**
 * 地图专题（PRD 二十五）
 * ------------------------------------------------------------
 * 一个专题本质上就是「一组预设的筛选条件」，不是另一套数据。
 * 所以这里只写条件，列表、地图、计数全部复用 utils/place.js 的 filter，
 * 加一个专题 = 在下面加一项，不需要写新页面。
 *
 * filters 的字段含义见 utils/place.js 的 emptyFilters()。
 */
const TOPICS = [
  {
    key: 'free',
    emoji: '🌳',
    title: '深圳免费遛娃地图',
    desc: '完全不花钱，随时可以出发的户外去处。',
    filters: { maxPrice: 0, env: 'outdoor' }
  },
  {
    key: 'water',
    emoji: '💦',
    title: '深圳玩水地图',
    desc: '戏水区、溪流、海边，夏天最解暑的一批。',
    filters: { features: ['waterPlay'] }
  },
  {
    key: 'climbing',
    emoji: '🧗',
    title: '深圳儿童攀爬地图',
    desc: '有攀爬设施或攀爬网，适合放电。',
    filters: { features: ['climbing'] }
  },
  {
    key: 'indoor',
    emoji: '🏛',
    title: '深圳室内场馆地图',
    desc: '博物馆、科技馆、图书馆、美术馆，有空调。',
    filters: { categories: ['museum', 'science', 'library', 'art'] }
  },
  {
    key: 'cycling',
    emoji: '🚲',
    title: '深圳亲子骑行地图',
    desc: '有独立骑行道或平坦绿道，适合学车。',
    filters: { features: ['cycling'] }
  },
  {
    key: 'rainy',
    emoji: '🌧',
    title: '深圳下雨天遛娃地图',
    desc: '按每个地点的天气适配打分选出来，小雨天照样能玩。',
    filters: { weather: 'lightRain' }
  },
  {
    key: 'hot',
    emoji: '🥵',
    title: '深圳高温天遛娃地图',
    desc: '34℃ 也不至于中暑的地方：室内、树荫、玩水。',
    filters: { weather: 'hot' }
  },
  {
    key: 'nature',
    emoji: '🌿',
    title: '深圳自然探索地图',
    desc: '山、林、农场、动物，能上一堂自然课。',
    filters: { categories: ['nature', 'hiking', 'farm', 'animal'] }
  },
  {
    key: 'camping',
    emoji: '⛺',
    title: '深圳搭帐篷地图',
    desc: '明确可以搭帐篷、野餐的草坪。',
    filters: { features: ['camping'] }
  },
  {
    key: 'seaside',
    emoji: '🏖',
    title: '深圳赶海地图',
    desc: '沙滩和礁石区，退潮能捡到东西。',
    filters: { categories: ['seaside'] }
  },
  {
    key: 'stroller',
    emoji: '👶',
    title: '深圳推车友好地图',
    desc: '路面平整、有卫生间，带小小孩也不怵。',
    filters: { features: ['stroller', 'toilet'] }
  }
];

/** key -> 专题 */
const TOPIC_MAP = TOPICS.reduce((acc, t) => {
  acc[t.key] = t;
  return acc;
}, {});

module.exports = { TOPICS, TOPIC_MAP };

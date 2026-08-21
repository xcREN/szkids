/**
 * 实时天气（Phase 5）
 * ------------------------------------------------------------
 * 对外只有一个入口 current()，返回的永远是一个「可以直接渲染」的对象，
 * **不会 reject**。没网、接口挂了、域名没配，都走同一套降级结构，
 * 页面不用写 try/catch，也不会因为天气拿不到就白屏。
 *
 * 为什么要把结果归一成 tag：
 *   data/places.js 里每个地点的 weatherTags 只有六个键
 *   （sunny / cloudy / lightRain / heavyRain / hot / cold），
 *   而各家接口返回的天气现象有几十种。归一放在这一层做，
 *   recommend.js 和页面就只认这六个键，换供应商不影响下游。
 *
 * 缓存：结果按「位置 + 时间」存在本地（见 weather.config.js 的 cacheMinutes）。
 *      请求失败时会拿旧值顶上——天气差半小时不影响决策，
 *      但页面上空一块很难看。
 */
const CONFIG = require('../weather.config.js');

const CACHE_KEY = 'weather_cache';

/** 六个天气档，和 places.js 里 weatherTags 的键严格一致 */
const TAG_LABEL = {
  sunny: '晴',
  cloudy: '多云',
  lightRain: '小雨',
  heavyRain: '大雨',
  hot: '高温',
  cold: '湿冷'
};

const TAG_EMOJI = {
  sunny: '☀️',
  cloudy: '⛅',
  lightRain: '🌦',
  heavyRain: '🌧',
  hot: '🥵',
  cold: '🧥'
};

/** 一句话建议，显示在「今天去哪」顶部，让推荐结果有个由头 */
const TAG_ADVICE = {
  sunny: '出太阳了，注意防晒补水，优先挑有树荫的地方。',
  cloudy: '不晒不闷，这种天气户外最舒服。',
  lightRain: '有点小雨，室内或者有遮挡的地方更稳妥。',
  heavyRain: '雨比较大，建议直接选室内，别折腾。',
  hot: '天太热了，避开正午，玩水和室内是优选。',
  cold: '偏冷，室内为主；去户外记得给孩子多带一件。'
};

/* ------------------------------------------------------------------ 归一 */

/**
 * 把「天气现象文字 + 气温」归一成六档之一。
 *
 * 判断顺序是有讲究的：下雨优先于冷热。
 * 34℃ 又在下暴雨时，真正决定「今天能不能去户外」的是雨不是热。
 *
 * @param {string} text 天气现象，如「多云」「雷阵雨」
 * @param {number} temp 气温（摄氏度），拿不到传 null
 */
function classify(text, temp) {
  const t = String(text || '');
  if (/暴雨|大雨|中雨|雷|暴雪|大雪|冰雹/.test(t)) return 'heavyRain';
  if (/小雨|阵雨|毛毛|细雨|小雪|雨夹雪|冻雨/.test(t)) return 'lightRain';
  if (/雨|雪/.test(t)) return 'lightRain';   // 只给「雨」这种笼统值时，按小雨算
  if (typeof temp === 'number' && !isNaN(temp)) {
    if (temp >= 33) return 'hot';
    if (temp <= 12) return 'cold';
  }
  if (/晴/.test(t)) return 'sunny';
  // 雾、霾、沙尘也落在这里。places.js 没有对应的档，
  // 按「多云」算不会把人推错方向（室内本来就得分高），不为此另造第七个键。
  return 'cloudy';
}

/** 归一结果补齐成页面直接能用的结构 */
function build(tag, text, temp, extra) {
  return Object.assign(
    {
      ok: true,
      tag: tag,
      label: TAG_LABEL[tag],
      emoji: TAG_EMOJI[tag],
      advice: TAG_ADVICE[tag],
      text: text || TAG_LABEL[tag],
      temp: temp,
      tempText: (typeof temp === 'number' && !isNaN(temp)) ? Math.round(temp) + '°' : '',
      fetchedAt: Date.now()
    },
    extra || {}
  );
}

/** 降级结构。ok:false 时页面显示 message，推荐照常跑，只是不看天气这一维 */
function fallback(reason, message) {
  return {
    ok: false,
    reason: reason,
    tag: '',
    label: '',
    emoji: '🌡',
    advice: '',
    text: message,
    temp: null,
    tempText: '',
    message: message,
    fetchedAt: Date.now()
  };
}

/* ------------------------------------------------------------------ 各家接口 */

/**
 * Open-Meteo 返回的是 WMO 天气代码（数字），先翻成中文再走同一套 classify。
 * 完整对照表见 https://open-meteo.com/en/docs
 */
const WMO_TEXT = {
  0: '晴',
  1: '晴间多云', 2: '多云', 3: '阴',
  45: '雾', 48: '冻雾',
  51: '毛毛雨', 53: '毛毛雨', 55: '毛毛雨',
  56: '冻毛毛雨', 57: '冻毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨',
  66: '冻雨', 67: '冻雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '米雪',
  80: '阵雨', 81: '强阵雨', 82: '大阵雨',
  85: '阵雪', 86: '强阵雪',
  95: '雷阵雨', 96: '雷阵雨伴冰雹', 99: '雷暴伴冰雹'
};

/** 彩云的 skycon 是英文枚举，同样先翻成中文 */
const SKYCON_TEXT = {
  CLEAR_DAY: '晴', CLEAR_NIGHT: '晴',
  PARTLY_CLOUDY_DAY: '多云', PARTLY_CLOUDY_NIGHT: '多云',
  CLOUDY: '阴',
  LIGHT_HAZE: '轻度霾', MODERATE_HAZE: '中度霾', HEAVY_HAZE: '重度霾',
  LIGHT_RAIN: '小雨', MODERATE_RAIN: '中雨', HEAVY_RAIN: '大雨', STORM_RAIN: '暴雨',
  FOG: '雾',
  LIGHT_SNOW: '小雪', MODERATE_SNOW: '中雪', HEAVY_SNOW: '大雪', STORM_SNOW: '暴雪',
  DUST: '浮尘', SAND: '沙尘', WIND: '大风'
};

function parseOpenMeteo(data) {
  const cur = data && data.current;
  if (!cur) return fallback('apierr', '天气接口返回异常');
  const text = WMO_TEXT[cur.weather_code] || '多云';
  const temp = typeof cur.temperature_2m === 'number' ? cur.temperature_2m : null;
  /**
   * 冷热判断用体感温度，显示用实际温度。
   * 深圳夏天湿度大，32℃ 的实际气温体感常常 38℃ 往上，
   * 用实际温度判断会漏掉一堆「其实热到不该去户外」的日子。
   */
  const feel = typeof cur.apparent_temperature === 'number' ? cur.apparent_temperature : temp;
  return build(classify(text, feel), text, temp, { feelsLike: feel, source: 'Open-Meteo' });
}

function parseQWeather(data) {
  if (!data || data.code !== '200' || !data.now) {
    return fallback('apierr', '天气接口返回异常' + (data && data.code ? '（' + data.code + '）' : ''));
  }
  const now = data.now;
  const temp = parseFloat(now.temp);
  const feel = now.feelsLike ? parseFloat(now.feelsLike) : temp;
  return build(classify(now.text, feel), now.text, temp, { feelsLike: feel, source: '和风天气' });
}

function parseCaiyun(data) {
  const rt = data && data.result && data.result.realtime;
  if (!data || data.status !== 'ok' || !rt) {
    return fallback('apierr', '天气接口返回异常');
  }
  const text = SKYCON_TEXT[rt.skycon] || '多云';
  const temp = typeof rt.temperature === 'number' ? rt.temperature : null;
  const feel = rt.apparent_temperature;
  return build(
    classify(text, typeof feel === 'number' ? feel : temp),
    text, temp,
    { feelsLike: typeof feel === 'number' ? feel : temp, source: '彩云天气' }
  );
}

const PARSERS = {
  openmeteo: parseOpenMeteo,
  qweather: parseQWeather,
  caiyun: parseCaiyun
};

/** 拼请求地址。位置精度取两位小数（约 1km），也让缓存更容易命中 */
function buildUrl(location) {
  const lng = location.longitude.toFixed(2);
  const lat = location.latitude.toFixed(2);
  if (CONFIG.provider === 'openmeteo') {
    return 'https://api.open-meteo.com/v1/forecast' +
      '?latitude=' + lat + '&longitude=' + lng +
      '&current=temperature_2m,apparent_temperature,precipitation,weather_code' +
      '&timezone=Asia%2FShanghai';
  }
  if (CONFIG.provider === 'qweather') {
    const host = (CONFIG.qweatherHost || 'https://devapi.qweather.com').replace(/\/+$/, '');
    return host + '/v7/weather/now?location=' + lng + ',' + lat + '&key=' + CONFIG.key;
  }
  if (CONFIG.provider === 'caiyun') {
    return 'https://api.caiyunapp.com/v2.6/' + CONFIG.key + '/' + lng + ',' + lat + '/realtime';
  }
  return '';
}

function fetchRemote(location) {
  return new Promise((resolve) => {
    const url = buildUrl(location);
    if (!url) return resolve(fallback('noprovider', '未配置天气接口'));
    wx.request({
      url: url,
      timeout: 8000,
      success: (res) => {
        if (res.statusCode !== 200) {
          return resolve(fallback('apierr', '天气接口 HTTP ' + res.statusCode));
        }
        const parse = PARSERS[CONFIG.provider] || parseOpenMeteo;
        resolve(parse(res.data));
      },
      fail: (err) => {
        // 最常见的两种：没在 mp 后台配 request 合法域名；真的没网。
        const msg = (err && err.errMsg) || '';
        console.warn('天气请求失败', msg);
        resolve(fallback(
          'neterr',
          /domain|url not in/i.test(msg) ? '域名未在 mp 后台配置' : '天气获取失败'
        ));
      }
    });
  });
}

/* ------------------------------------------------------------------ 缓存 */

function readCache(location) {
  try {
    const c = wx.getStorageSync(CACHE_KEY);
    if (!c || !c.data || !c.data.ok) return null;
    // 位置挪了 5km 以上就别用旧的了，深圳东西两头天气能差挺多
    if (location && c.location) {
      const dLat = Math.abs(c.location.latitude - location.latitude);
      const dLng = Math.abs(c.location.longitude - location.longitude);
      if (dLat > 0.05 || dLng > 0.05) return null;
    }
    const ageMin = (Date.now() - (c.data.fetchedAt || 0)) / 60000;
    return { data: c.data, stale: ageMin > (CONFIG.cacheMinutes || 30) };
  } catch (e) {
    return null;
  }
}

function writeCache(location, data) {
  if (!data || !data.ok) return;
  try {
    wx.setStorageSync(CACHE_KEY, { location: location, data: data });
  } catch (e) {
    // 存不下就算了，不影响这次显示
  }
}

/* ------------------------------------------------------------------ 对外 */

/**
 * 取当前天气。
 * @param {object} location {latitude, longitude}
 * @param {object} opts {force: 忽略缓存强制刷新}
 * @returns {Promise<object>} 永远 resolve，结构见 build() / fallback()
 */
function current(location, opts) {
  const force = opts && opts.force;
  if (!CONFIG.provider) {
    return Promise.resolve(fallback('noprovider', '未配置天气接口'));
  }
  // 和风、彩云要 key；Open-Meteo 不要
  if (CONFIG.provider !== 'openmeteo' && !CONFIG.key) {
    return Promise.resolve(fallback('nokey', '天气接口未填 key'));
  }
  if (!location) {
    return Promise.resolve(fallback('nolocation', '未获取到位置'));
  }

  const cached = readCache(location);
  if (cached && !cached.stale && !force) {
    return Promise.resolve(Object.assign({}, cached.data, { cached: true }));
  }

  return fetchRemote(location).then((data) => {
    if (data.ok) {
      writeCache(location, data);
      return data;
    }
    // 请求失败但手里有旧值：先用旧的顶上，标记 stale 让页面能提示
    if (cached) return Object.assign({}, cached.data, { cached: true, stale: true });
    return data;
  });
}

/** 顶部天气栏的一行文案 */
function summaryText(w) {
  if (!w) return '天气';
  if (!w.ok) return w.message || '天气不可用';
  return w.emoji + ' ' + w.text + (w.tempText ? ' ' + w.tempText : '');
}

module.exports = {
  TAG_LABEL,
  TAG_EMOJI,
  TAG_ADVICE,
  WMO_TEXT,
  classify,
  current,
  summaryText
};

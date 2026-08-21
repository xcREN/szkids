/**
 * 云端公共地点库（客户端这一侧）
 * ------------------------------------------------------------
 * 公共库里的地点由作者一人发布（写入走 cloudfunctions/places，
 * 云函数校验 openid），客户端**只读**。集合权限必须设成「所有用户可读」。
 *
 * 设计上的两个要点：
 *
 * 1. **getAll() 不能变成异步。** 九个页面都在同步调它，改成异步等于重写。
 *    所以这里维护一份本地缓存：cached() 永远同步、永远有值（拿不到网络就用
 *    上次的），sync() 在后台拉新数据、成功后更新缓存并通知订阅者重画。
 *
 * 2. **云端不可用不能影响可用性。** 没开云环境、没网、集合还没建，
 *    都只是让公共库为空，代码包里那 26 条照常工作。所有函数都不 reject。
 *
 * 客户端单次 get 最多 20 条，所以拉全量要分页。
 */
const CACHE_KEY = 'cloud_places';
const WHOAMI_KEY = 'cloud_whoami';
const PAGE_SIZE = 20;      // 微信客户端 collection.get() 的硬上限
const MAX_PAGES = 25;      // 500 条封顶，够用很久；防止集合异常时无限翻页

let memory = null;         // 内存缓存，避免每次 getAll 都读 Storage
let syncing = null;        // 进行中的 sync，防止并发重复拉
const listeners = [];

/* ------------------------------------------------------------------ 缓存 */

function readCache() {
  if (memory) return memory;
  try {
    const v = wx.getStorageSync(CACHE_KEY);
    memory = (v && Array.isArray(v.list)) ? v : { list: [], syncedAt: 0 };
  } catch (e) {
    memory = { list: [], syncedAt: 0 };
  }
  return memory;
}

function writeCache(list) {
  memory = { list: list, syncedAt: Date.now() };
  try {
    wx.setStorageSync(CACHE_KEY, memory);
  } catch (e) {
    // 存不下不影响本次使用，下次启动退回上一次的缓存而已
    console.warn('缓存云端地点失败', e);
  }
}

/** 同步返回当前已知的云端地点。永远有值，可能是空数组 */
function cached() {
  return readCache().list;
}

function syncedAt() {
  return readCache().syncedAt;
}

/** 数据更新后通知页面重画 */
function onChange(fn) {
  if (typeof fn === 'function' && listeners.indexOf(fn) === -1) listeners.push(fn);
}

function offChange(fn) {
  const i = listeners.indexOf(fn);
  if (i > -1) listeners.splice(i, 1);
}

function emit() {
  listeners.slice().forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.warn('地点更新回调出错', e);
    }
  });
}

/* ------------------------------------------------------------------ 拉取 */

function available() {
  return !!(wx.cloud && wx.cloud.database);
}

/**
 * 从云数据库拉全量地点。
 * @param {object} opts {force: 忽略节流}
 * @returns {Promise<{ok:boolean, count:number, reason?:string}>} 不会 reject
 */
function sync(opts) {
  const force = opts && opts.force;
  if (syncing) return syncing;
  if (!available()) {
    return Promise.resolve({ ok: false, count: cached().length, reason: 'nocloud' });
  }
  // 五分钟内拉过就不再拉，除非强制。地点数据不是秒级变化的东西
  if (!force && Date.now() - syncedAt() < 5 * 60 * 1000 && cached().length) {
    return Promise.resolve({ ok: true, count: cached().length, reason: 'fresh' });
  }

  syncing = (function () {
    const col = wx.cloud.database().collection('places');
    const acc = [];

    function page(n) {
      if (n >= MAX_PAGES) return Promise.resolve();
      return col.skip(n * PAGE_SIZE).limit(PAGE_SIZE).get().then((res) => {
        const rows = (res && res.data) || [];
        rows.forEach((r) => acc.push(r));
        if (rows.length < PAGE_SIZE) return;
        return page(n + 1);
      });
    }

    return page(0).then(() => {
      // 只有真拉到了才覆盖缓存；集合为空也算成功（作者可能还没发布任何东西）
      writeCache(acc.map(normalize));
      emit();
      return { ok: true, count: acc.length };
    }).catch((err) => {
      const msg = (err && (err.errMsg || err.message)) || '';
      console.warn('拉取云端地点失败', msg);
      // 集合不存在是「还没建」，不是错误，静默处理
      return {
        ok: false,
        count: cached().length,
        reason: /collection not exists|not exist/i.test(msg) ? 'nocollection' : 'neterr'
      };
    });
  })().then((r) => {
    syncing = null;
    return r;
  });

  return syncing;
}

/**
 * 云端记录 -> 和 places.js 同构的对象。
 * 补齐可能缺失的字段，免得某条数据不全就让下游到处判空。
 */
function normalize(row) {
  const p = Object.assign({}, row);
  p.id = p.id || p._id;
  p.city = p.city || '深圳';
  p.tags = p.tags || [];
  p.reasons = p.reasons || [];
  p.images = p.images || [];
  p.ageRatings = p.ageRatings || { '0-2': 3, '3-5': 3, '6-8': 3, '9-12': 3 };
  p.weatherTags = p.weatherTags || { sunny: 3, cloudy: 3, lightRain: 3, heavyRain: 3, hot: 3, cold: 3 };
  p.recommendScore = typeof p.recommendScore === 'number' ? p.recommendScore : 4;
  p.duration = typeof p.duration === 'number' ? p.duration : 2;
  p.price = typeof p.price === 'number' ? p.price : 0;
  p.free = p.price === 0;
  p.source = p.source || '现场核实';
  p.lastVerifiedAt = p.lastVerifiedAt || '';
  p.fromCloud = true;    // 页面据此显示「所有人可见」
  delete p._openid;      // 客户端用不上，也不该到处传
  return p;
}

/* ------------------------------------------------------------------ 身份与写入 */

function call(action, data) {
  if (!wx.cloud || !wx.cloud.callFunction) {
    return Promise.resolve({ ok: false, code: 'NOCLOUD', msg: '云开发不可用' });
  }
  return wx.cloud
    .callFunction({ name: 'places', data: Object.assign({ action: action }, data || {}) })
    .then((res) => (res && res.result) || { ok: false, code: 'EMPTY', msg: '云函数没有返回' })
    .catch((err) => {
      const msg = (err && (err.errMsg || err.message)) || '调用失败';
      console.warn('places 云函数调用失败', msg);
      return { ok: false, code: 'CALL_FAILED', msg: msg };
    });
}

/**
 * 我是谁 / 我是不是作者。结果缓存在本地，避免每次进页面都调一次云函数。
 * @param {boolean} force 忽略缓存
 */
function whoami(force) {
  if (!force) {
    try {
      const c = wx.getStorageSync(WHOAMI_KEY);
      if (c && c.openid) return Promise.resolve(c);
    } catch (e) {
      // 忽略，走网络
    }
  }
  return call('whoami').then((r) => {
    if (r && r.ok) {
      try {
        wx.setStorageSync(WHOAMI_KEY, r);
      } catch (e) {
        // 忽略
      }
      return r;
    }
    return { ok: false, openid: '', isAdmin: false, configured: false, msg: r && r.msg };
  });
}

/** 发布/更新一条到公共库（云函数会校验只有作者能写） */
function publish(place) {
  return call('upsert', { place: place }).then((r) => {
    if (r && r.ok) {
      // 立刻重拉，让本机马上看到发布后的效果
      return sync({ force: true }).then(() => r);
    }
    return r;
  });
}

/** 从公共库撤下一条 */
function unpublish(id) {
  return call('remove', { id: id }).then((r) => {
    if (r && r.ok) return sync({ force: true }).then(() => r);
    return r;
  });
}

module.exports = {
  available,
  cached,
  syncedAt,
  sync,
  whoami,
  publish,
  unpublish,
  onChange,
  offChange
};

/**
 * 地点发布云函数
 * ------------------------------------------------------------
 * 这个云函数只干一件事：**把地点写进公共库，且只允许作者本人写**。
 *
 * 为什么写入必须走云函数，而不是客户端直接写数据库：
 *
 *   云数据库的权限选项里，「所有用户可读，仅创建者可读写」听起来像是
 *   "只有我能写"，其实是**每个用户都能写自己的记录，而所有人都能读到**——
 *   那就是标准的 UGC 了，内容审核、举报入口、UGC 声明全都得跟上。
 *
 *   所以集合权限要设成「**所有用户可读**」（客户端只读，写不进去），
 *   写入一律经过这个云函数。云函数以管理员身份操作数据库，
 *   在第一行校验调用者的 openid 是不是作者，不是就直接拒绝。
 *
 * 结果：公共库里的内容 100% 出自作者一人之手 —— 不是 UGC。
 * 普通用户想记自己的地点，走本地草稿（utils/draft.js），存在自己手机上，
 * 别人看不到，同样不构成 UGC。
 *
 * ============ 部署前必须做的一步 ============
 * ADMIN_OPENID 现在是空的，也就是**谁都写不进去**（这是安全的默认值）。
 * 拿到你自己的 openid 的办法：
 *   1. 先原样部署这个云函数；
 *   2. 在小程序里打开「我的 → 我的地点」，页面底部会显示你的 openid
 *      （它调的就是下面的 whoami）；
 *   3. 把那串 openid 填到下面，或者在云开发控制台给这个云函数配一个
 *      名为 ADMIN_OPENID 的环境变量（推荐，改了不用重新部署）；
 *   4. 重新部署。
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLLECTION = 'places';

/** 作者的 openid。留空 = 拒绝一切写入 */
const ADMIN_OPENID = process.env.ADMIN_OPENID || '';

/** 只允许这些字段进公共库，多余的一律丢掉，防止客户端塞脏数据 */
const FIELDS = [
  'id', 'name', 'city', 'district', 'latitude', 'longitude', 'address',
  'category', 'tags', 'ageMin', 'ageMax', 'ageRatings',
  'indoor', 'outdoor', 'price', 'free', 'parking', 'freeParking',
  'toilet', 'babyRoom', 'stroller', 'camping', 'picnic', 'cycling',
  'waterPlay', 'climbing', 'pet',
  'reservation', 'noReservation', 'duration', 'crowdLevel',
  'weatherTags', 'recommendScore', 'description', 'reasons', 'tips',
  'images', 'source', 'lastVerifiedAt', 'compiledAt'
];

function pick(obj) {
  const out = {};
  FIELDS.forEach((k) => {
    if (obj[k] !== undefined) out[k] = obj[k];
  });
  return out;
}

/** 服务端也校验一遍，别信客户端 */
function validate(p) {
  if (!p.id || !/^[a-zA-Z0-9-_]+$/.test(p.id)) return 'id 不合法';
  if (!p.name) return '缺名称';
  if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') return '缺经纬度';
  if (p.latitude < 22.3 || p.latitude > 23.0 || p.longitude < 113.6 || p.longitude > 114.8) {
    return '坐标不在深圳范围内';
  }
  if (!p.category) return '缺分类';
  return null;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action;

  // 谁都能问「我是谁」，这是配置 ADMIN_OPENID 的唯一途径
  if (action === 'whoami') {
    return {
      ok: true,
      openid: OPENID,
      isAdmin: !!ADMIN_OPENID && OPENID === ADMIN_OPENID,
      configured: !!ADMIN_OPENID
    };
  }

  // 除 whoami 外，一律先过这道门
  if (!ADMIN_OPENID) {
    return { ok: false, code: 'NOT_CONFIGURED', msg: '云函数还没配 ADMIN_OPENID，暂不接受写入' };
  }
  if (OPENID !== ADMIN_OPENID) {
    return { ok: false, code: 'FORBIDDEN', msg: '只有作者可以发布地点' };
  }

  if (action === 'upsert') {
    const p = pick(event.place || {});
    const bad = validate(p);
    if (bad) return { ok: false, code: 'INVALID', msg: bad };

    p.updatedAt = Date.now();
    const doc = db.collection(COLLECTION).doc(p.id);
    try {
      const found = await doc.get();
      if (found && found.data) {
        await doc.update({ data: p });
        return { ok: true, mode: 'updated', id: p.id };
      }
    } catch (e) {
      // doc.get() 在记录不存在时会抛错，这是正常路径，继续走新增
    }
    p.createdAt = Date.now();
    await db.collection(COLLECTION).add({ data: Object.assign({ _id: p.id }, p) });
    return { ok: true, mode: 'created', id: p.id };
  }

  if (action === 'remove') {
    const id = event.id;
    if (!id) return { ok: false, code: 'INVALID', msg: '缺 id' };
    await db.collection(COLLECTION).doc(id).remove();
    return { ok: true, id: id };
  }

  return { ok: false, code: 'UNKNOWN_ACTION', msg: '不认识的 action：' + action };
};

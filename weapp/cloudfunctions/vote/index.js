/**
 * 云函数 vote —— 负责写入和查询"我自己的选择"
 *
 * 为什么要用云函数：只有在云函数里才能拿到调用者的 OPENID。
 * 有了 OPENID，一个微信号就只能有一条记录，天然防重复、也能改选择。
 *
 * action:
 *   me      查我自己填过没有
 *   submit  提交/修改（一个微信号只会有一条记录）
 *   cancel  撤回我的选择
 */
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLL = "votes";
const MAX_NAME = 12;
const MAX_CUSTOM = 20;   // "自己填"的内容最多几个字

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, error: "拿不到用户身份" };

  const action = event.action || "me";
  const col = db.collection(COLL);

  // 先找这个微信号有没有记录
  let mine = null;
  try {
    const r = await col.where({ _openid: OPENID }).limit(1).get();
    mine = r.data[0] || null;
  } catch (e) {
    // 集合还没建的时候会报错，当成"没有记录"处理
    if (String(e.errCode) !== "-502005") throw e;
  }

  if (action === "me") {
    return { ok: true, mine };
  }

  if (action === "cancel") {
    if (mine) await col.doc(mine._id).remove();
    return { ok: true };
  }

  if (action === "submit") {
    const name = String(event.name || "").trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
    if (!name) return { ok: false, error: "请先填个称呼" };

    // answers 形如 { depart: "a", meal: "restaurant" }，只保留字符串值
    const raw = event.answers || {};
    const answers = {};
    Object.keys(raw).forEach((k) => {
      if (/^[a-zA-Z0-9_-]{1,24}$/.test(k) && typeof raw[k] === "string") {
        answers[k] = raw[k].slice(0, 24);
      }
    });
    if (!Object.keys(answers).length) return { ok: false, error: "至少选一项" };

    // customs 形如 { meal: "想吃海鲜" }，选了"自己填"的选项才有
    const rawCustom = event.customs || {};
    const customs = {};
    Object.keys(rawCustom).forEach((k) => {
      if (/^[a-zA-Z0-9_-]{1,24}$/.test(k) && typeof rawCustom[k] === "string") {
        const v = rawCustom[k].trim().replace(/\s+/g, " ").slice(0, MAX_CUSTOM);
        if (v) customs[k] = v;
      }
    });

    const now = new Date();
    if (mine) {
      await col.doc(mine._id).update({ data: { name, answers, customs, updatedAt: now } });
    } else {
      // 云函数写库不会自动带 _openid，必须自己写进去
      await col.add({ data: { _openid: OPENID, name, answers, customs, createdAt: now, updatedAt: now } });
    }
    return { ok: true };
  }

  return { ok: false, error: "未知操作" };
};

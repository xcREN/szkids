/**
 * szkids 投票 API —— 跑在 Cloudflare Worker 上，和你家里的电脑无关，
 * 所以电脑关机 / 隧道断了，投票照样能投、能看。
 *
 * 路由：https://szkids.dpdns.org/api/*
 * 存储：KV（绑定名 VOTES）
 *
 * 存法：一个投票人一个 key，票数不做累加计数器。
 *   key = "v:<投票人ID>"   value = ""   metadata = { o:选项, n:昵称, t:时间戳 }
 * 这样两个人同时投票不会互相覆盖（累加计数器会有"读-改-写"竞争，会丢票）。
 * 读取时用 list() 一次拿回全部 metadata，只算 1 次读操作。
 */

const MAX_VOTERS = 300;   // 最多多少人投票（防刷）
const MAX_NAME = 12;      // 昵称最长几个字
const IP_LIMIT = 12;      // 同一个 IP 每小时最多写几次
const IP_WINDOW = 3600;   // 上面这个"每小时"的秒数

const ALLOW_ORIGINS = [
  "https://szkids.dpdns.org",
  "http://127.0.0.1:8080",   // 本地调试用
  "http://localhost:8080",
];

function headers(req) {
  const h = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
  const origin = req.headers.get("Origin") || "";
  if (ALLOW_ORIGINS.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Vary"] = "Origin";
  }
  return h;
}

function json(req, data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: headers(req) });
}

/** 同一个 IP 短时间内写太多次就拦掉 */
async function ipThrottled(env, req) {
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  const key = "ip:" + ip;
  const n = parseInt((await env.VOTES.get(key)) || "0", 10);
  if (n >= IP_LIMIT) return true;
  await env.VOTES.put(key, String(n + 1), { expirationTtl: IP_WINDOW });
  return false;
}

function readBody(body) {
  const v = String(body.v || "").trim();
  const o = String(body.o || "").trim();
  const n = String(body.n || "").trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
  return { v, o, n };
}

export default {
  async fetch(req, env) {
    const path = new URL(req.url).pathname.replace(/\/+$/, "");

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...headers(req),
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    /* ── 查看投票结果 ─────────────────────────────── */
    if (path === "/api/votes" && req.method === "GET") {
      const me = (new URL(req.url).searchParams.get("v") || "").slice(0, 64);
      const { keys } = await env.VOTES.list({ prefix: "v:", limit: 1000 });
      const list = keys
        .filter((k) => k.metadata && k.metadata.o)
        .map((k) => {
          const item = { o: k.metadata.o, n: k.metadata.n || "", t: k.metadata.t || 0 };
          if (me && k.name === "v:" + me) item.me = true;   // 标出"这票是你投的"
          return item;
        })
        .sort((a, b) => a.t - b.t);
      return json(req, { ok: true, total: list.length, list });
    }

    /* ── 投票 / 改票 ──────────────────────────────── */
    if (path === "/api/vote" && req.method === "POST") {
      let body;
      try { body = await req.json(); } catch { return json(req, { ok: false, error: "请求格式不对" }, 400); }
      const { v, o, n } = readBody(body);

      if (!/^[A-Za-z0-9_-]{6,64}$/.test(v)) return json(req, { ok: false, error: "投票人标识不合法" }, 400);
      if (!/^[a-z0-9_-]{1,24}$/.test(o)) return json(req, { ok: false, error: "选项不合法" }, 400);
      if (!n) return json(req, { ok: false, error: "请先填个昵称" }, 400);

      if (await ipThrottled(env, req)) {
        return json(req, { ok: false, error: "操作太频繁了，过一会儿再试" }, 429);
      }

      // 老投票人改票不占名额，只有全新的人才检查上限
      const exist = await env.VOTES.getWithMetadata("v:" + v);
      if (!exist.metadata) {
        const { keys } = await env.VOTES.list({ prefix: "v:", limit: 1000 });
        if (keys.length >= MAX_VOTERS) {
          return json(req, { ok: false, error: "投票人数已达上限" }, 429);
        }
      }

      await env.VOTES.put("v:" + v, "", { metadata: { o, n, t: Date.now() } });
      return json(req, { ok: true });
    }

    /* ── 取消投票 ─────────────────────────────────── */
    if (path === "/api/unvote" && req.method === "POST") {
      let body;
      try { body = await req.json(); } catch { return json(req, { ok: false, error: "请求格式不对" }, 400); }
      const { v } = readBody(body);
      if (!/^[A-Za-z0-9_-]{6,64}$/.test(v)) return json(req, { ok: false, error: "投票人标识不合法" }, 400);
      if (await ipThrottled(env, req)) {
        return json(req, { ok: false, error: "操作太频繁了，过一会儿再试" }, 429);
      }
      await env.VOTES.delete("v:" + v);
      return json(req, { ok: true });
    }

    return json(req, { ok: false, error: "没有这个接口" }, 404);
  },
};

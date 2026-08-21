/**
 * 天气接口配置（Phase 5）
 * ------------------------------------------------------------
 * 默认用 Open-Meteo：**不需要注册，不需要 key，直接就能跑**。
 * 所以这个文件通常你一个字都不用改。
 *
 * 唯一必须做的一步（三家都一样，跑不掉）：
 *   到 mp 后台「开发管理 → 开发设置 → 服务器域名 → request 合法域名」
 *   把下面用到的域名加进去。免 key 不等于免域名白名单——
 *   小程序真机只允许请求白名单里的域名，不配的话真机上必然失败，
 *   而开发者工具勾了「不校验合法域名」还是能通，很容易被这点骗过去。
 *
 *     openmeteo   https://api.open-meteo.com
 *     qweather    https://devapi.qweather.com
 *                 （新账号发的是专属域名 https://xxxxx.re.qweatherapi.com，
 *                   以后台给你的为准，同时改下面的 qweatherHost）
 *     caiyun      https://api.caiyunapp.com
 *
 * 关于 Open-Meteo 的授权：免费额度面向非商业用途（官方标注每天 1 万次以内）。
 * 这个小程序是个人自用，量级差着好几个数量级，够用。
 * 哪天要商用，要么买它的商业套餐，要么把 provider 换成和风/彩云，
 * 换供应商只改这个文件，utils/weather.js 里已经把字段差异抹平了。
 */
module.exports = {
  /** 'openmeteo' 免 key | 'qweather' 和风 | 'caiyun' 彩云 | '' 不接天气 */
  provider: 'openmeteo',

  /** 接口 key。openmeteo 用不到，留空即可；换和风/彩云时才需要填 */
  key: '',

  /** 和风的 API Host，以后台「设置 → 开发者信息」里显示的为准 */
  qweatherHost: 'https://devapi.qweather.com',

  /**
   * 缓存多少分钟。
   * 实时天气没必要每次进页面都请求：既费额度，也让页面多等一个网络往返。
   * 30 分钟对「今天带孩子去哪」这个决策粒度完全够用。
   */
  cacheMinutes: 30
};

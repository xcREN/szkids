/**
 * 位置与距离相关的工具函数
 * ------------------------------------------------------------
 * 小程序拿到的定位是 gcj02 坐标，data/places.js 里存的也是 gcj02，
 * 两边同一套坐标系，直接算距离即可，不需要转换。
 */

/** 深圳市民中心，定位失败时的兜底中心点 */
const SZ_CENTER = { latitude: 22.5446, longitude: 114.0546 };

/**
 * 两点间直线距离（Haversine 公式）
 * @returns {number} 公里
 */
function distanceKm(from, to) {
  if (!from || !to) return null;
  const R = 6371; // 地球半径，公里
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(to.latitude - from.latitude);
  const dLng = rad(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(from.latitude)) * Math.cos(rad(to.latitude)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** 距离显示文案：1 公里内用米 */
function formatDistance(km) {
  if (km === null || km === undefined) return '';
  if (km < 1) return Math.round(km * 100) * 10 + 'm';
  return km.toFixed(1) + 'km';
}

/**
 * 粗略车程估算。
 * 直线距离先乘 1.35 还原成路网距离，再按市区 25km/h、跨区 35km/h 估。
 * 只用于卡片上的「约 xx 分钟」，不是导航结果。
 */
function estimateDriveMinutes(km) {
  if (km === null || km === undefined) return null;
  const roadKm = km * 1.35;
  const speed = roadKm > 20 ? 35 : 25;
  return Math.max(5, Math.round((roadKm / speed) * 60));
}

/** 车程文案：超过 60 分钟显示成「1小时10分」 */
function formatDriveMinutes(min) {
  if (!min) return '';
  if (min < 60) return '约' + min + '分钟';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return '约' + h + '小时' + (m ? m + '分' : '');
}

/**
 * 按地图可视范围估算合适的缩放级别。
 * 只在「重新定位」等场景用，日常交给用户自己缩放。
 */
function scaleForRadius(km) {
  if (km <= 2) return 15;
  if (km <= 5) return 14;
  if (km <= 10) return 13;
  if (km <= 20) return 12;
  if (km <= 40) return 11;
  return 10;
}

module.exports = {
  SZ_CENTER,
  distanceKm,
  formatDistance,
  estimateDriveMinutes,
  formatDriveMinutes,
  scaleForRadius
};

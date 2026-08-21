/**
 * 活动配置 —— 以后换活动、换选项，只改这个文件
 *
 * questions 里每一组就是一道单选题，想加第三道（比如"要不要拼车"）
 * 照着复制一段就行。key 不能重复，也不要改已经开始投票的 key，
 * 改了之前的票会对不上。
 */
module.exports = {
  activity: {
    title: "周六亲子出游 · 鹏飞公园",
    date: "2026年8月8日 星期六",
    place: "深圳鹏飞公园（大鹏新区潮歌巷19号，金沙湾国际乐园内）",
    weather: "多云间晴，27~35℃，局地可能有短时雷阵雨。天气炎热，记得带防晒、驱蚊水和足够的水。",
    intro: "玥玥妈推荐，靠海滩又有无动力游乐设施，适合小孩子玩耍。从龙岗自驾过去约 1 小时，12:00 左右吃午饭。"
  },

  /**
   * 地图导航
   * lnglat 填了才会出现「地图导航」按钮（点了直接打开微信内置地图，能一键导航）；
   * 留空的话按钮自动降级成「复制地址」，不会指错地方。
   *
   * 怎么取坐标：打开 https://lbs.amap.com/tools/picker
   * 搜「鹏飞公园」→ 页面上会显示「经度,纬度」→ 原样复制到下面
   * （高德用的是 gcj02 坐标，和微信内置地图是同一套，直接填就行，不用转换）
   */
  map: {
    name: "鹏飞公园",
    address: "深圳市大鹏新区潮歌巷19号（金沙湾国际乐园内）",
    lnglat: ""   // 例："114.512345,22.593456"
  },

  /** 目的地照片。图片放在 miniprogram/images/ 下，路径以 / 开头 */
  photos: [
    { src: "/images/jinshawan-1.jpg", credit: "图：大鹏新区政府在线" },
    { src: "/images/jinshawan-2.jpg", credit: "图：大鹏新区政府在线" },
    { src: "/images/jinshawan-3.jpg", credit: "图：大鹏新区政府在线" }
  ],
  photoNote: "以上为金沙湾片区照片，鹏飞公园就在金沙湾国际乐园内",

  // 选项上加 custom: true，选中后会出现一个输入框让人自己填，
  // 填的内容会显示在名字后面的括号里，比如「豆豆妈（11点半再出发）」
  questions: [
    {
      key: "depart",
      title: "出发时间",
      options: [
        { key: "a", label: "09:30-10:00 出发" },
        { key: "b", label: "10:00-11:00 出发" },
        { key: "other", label: "其他时间（自己填）", custom: true, placeholder: "比如：11:00 之后出发" }
      ]
    },
    {
      key: "meal",
      title: "吃饭方式",
      options: [
        { key: "restaurant", label: "进公园前吃馆子（紫金八刀汤人均22 / 鹏之味潮汕牛肉粿条人均25，距公园3公里）" },
        { key: "diy", label: "自备干粮，或早上吃饱再出发" },
        { key: "other", label: "其他想法（自己填）", custom: true, placeholder: "比如：想吃海鲜 / 想野餐" }
      ]
    }
  ]
};

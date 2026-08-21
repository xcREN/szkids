/**
 * 完整筛选面板（PRD 九）
 * ------------------------------------------------------------
 * 从底部弹出，一次性给出：年龄 / 区域 / 活动类型 / 场地环境 /
 * 费用 / 距离 / 游玩时间 / 其他条件。
 *
 * 用法：
 *   <filter-panel show="{{showFilter}}" value="{{filters}}" count="{{draftCount}}"
 *                 bind:change="onFilterChange" bind:confirm="onFilterConfirm"
 *                 bind:close="onFilterClose" />
 *
 * 说明：
 *   - 组件内部改的是「草稿」，点确定才 triggerEvent('confirm') 交回页面；
 *   - 每次改动都会 triggerEvent('change')，页面据此算出「查看 N 个地点」的 N；
 *   - 选项一律用「section 下标 + option 下标」传递，不依赖 dataset 的类型转换。
 */
const {
  AGE_GROUPS, DISTRICTS, CATEGORIES, ENV_OPTIONS,
  PRICE_OPTIONS, DISTANCE_OPTIONS, DURATION_OPTIONS, FEATURE_OPTIONS
} = require('../../data/categories.js');
const placeUtil = require('../../utils/place.js');

/**
 * 面板结构。key 对应 utils/place.js 里的筛选字段：
 *   single —— 单选，再点一次取消
 *   multi  —— 多选，值存进数组
 */
const SECTIONS = [
  {
    key: 'ageGroup', title: '孩子年龄', mode: 'single',
    options: AGE_GROUPS.map((g) => ({ value: g.key, label: g.label }))
  },
  {
    key: 'districts', title: '区域', mode: 'multi',
    options: DISTRICTS.map((d) => ({ value: d, label: d }))
  },
  {
    key: 'categories', title: '活动类型', mode: 'multi',
    options: CATEGORIES.map((c) => ({ value: c.key, label: c.emoji + ' ' + c.label }))
  },
  {
    key: 'env', title: '场地环境', mode: 'single',
    options: ENV_OPTIONS.map((e) => ({ value: e.key, label: e.label }))
  },
  {
    key: 'maxPrice', title: '费用', mode: 'single',
    options: PRICE_OPTIONS.map((p) => ({ value: p.max, label: p.label }))
  },
  {
    key: 'maxDistance', title: '距离', mode: 'single',
    options: DISTANCE_OPTIONS.map((d) => ({ value: d, label: d + 'km以内' }))
  },
  {
    key: 'maxDuration', title: '游玩时间', mode: 'single',
    options: DURATION_OPTIONS.map((d) => ({ value: d.max, label: d.label }))
  },
  {
    key: 'features', title: '其他条件', mode: 'multi',
    options: FEATURE_OPTIONS.map((f) => ({ value: f.key, label: f.emoji + ' ' + f.label }))
  }
];

Component({
  properties: {
    show: { type: Boolean, value: false },
    /** 页面当前生效的筛选条件，打开面板时作为草稿初始值 */
    value: { type: Object, value: null },
    /** 当前草稿能筛出多少个地点，由页面算好传进来 */
    count: { type: Number, value: 0 }
  },

  data: {
    sections: []
  },

  observers: {
    // 打开面板时（或页面在打开状态下换了条件）用最新条件重建草稿
    'show, value': function (show, value) {
      if (show) this.resetDraftFrom(value);
    }
  },

  lifetimes: {
    attached() {
      this.resetDraftFrom(this.data.value);
    }
  },

  methods: {
    /** 用页面传来的条件重建草稿 */
    resetDraftFrom(value) {
      const draft = Object.assign(placeUtil.emptyFilters(), value || {});
      // 数组要拷贝一份，别和页面共用同一个引用
      draft.districts = (draft.districts || []).slice();
      draft.categories = (draft.categories || []).slice();
      draft.features = (draft.features || []).slice();
      this.draft = draft;
      this.render();
    },

    /** 把草稿翻译成带选中态的视图数据 */
    render() {
      const draft = this.draft;
      const sections = SECTIONS.map((sec) => ({
        key: sec.key,
        title: sec.title,
        options: sec.options.map((opt) => ({
          label: opt.label,
          on: sec.mode === 'multi'
            ? (draft[sec.key] || []).indexOf(opt.value) > -1
            : draft[sec.key] === opt.value
        }))
      }));
      this.setData({ sections: sections });
      this.triggerEvent('change', { filters: this.snapshot() });
    },

    /** 交给外部的永远是副本 */
    snapshot() {
      return Object.assign({}, this.draft, {
        districts: this.draft.districts.slice(),
        categories: this.draft.categories.slice(),
        features: this.draft.features.slice()
      });
    },

    onOptionTap(e) {
      const si = e.currentTarget.dataset.si;
      const oi = e.currentTarget.dataset.oi;
      const sec = SECTIONS[si];
      const value = sec.options[oi].value;

      if (sec.mode === 'multi') {
        const arr = this.draft[sec.key];
        const i = arr.indexOf(value);
        if (i > -1) arr.splice(i, 1);
        else arr.push(value);
      } else {
        // 单选：点已选中的那个就是取消
        const empty = placeUtil.emptyFilters()[sec.key];
        this.draft[sec.key] = this.draft[sec.key] === value ? empty : value;
      }
      this.render();
    },

    onReset() {
      const kept = { keyword: this.draft.keyword, bounds: this.draft.bounds };
      this.draft = Object.assign(placeUtil.emptyFilters(), kept);
      this.render();
    },

    onConfirm() {
      this.triggerEvent('confirm', { filters: this.snapshot() });
    },

    onClose() {
      this.triggerEvent('close', {});
    },

    /** 面板内部滚动时不要把页面也带着滚 */
    noop() {}
  }
});

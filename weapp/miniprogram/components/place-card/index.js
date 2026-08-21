/**
 * 地点卡片
 * ------------------------------------------------------------
 * PRD 十：点 Marker 后地图底部弹出，家长不进详情页就能完成第一次判断。
 * 用法：
 *   <place-card place="{{place}}" mode="map"
 *               bind:detail="onDetail" bind:favorite="onFavorite" bind:close="onClose" />
 * place 需要是 utils/place.js decorate() 之后的对象。
 */
Component({
  properties: {
    /** 加工后的地点数据 */
    place: { type: Object, value: null },
    /** map：地图底部浮层（带关闭按钮）；list：列表里平铺 */
    mode: { type: String, value: 'map' },
    /** 是否已收藏（Phase 3 接入真实收藏后由外部传入） */
    favorited: { type: Boolean, value: false }
  },

  methods: {
    onDetail() {
      this.triggerEvent('detail', { id: this.data.place.id });
    },
    onFavorite() {
      this.triggerEvent('favorite', { id: this.data.place.id });
    },
    onClose() {
      this.triggerEvent('close', {});
    },
    /** 点卡片空白处等同于看详情 */
    onCardTap() {
      this.onDetail();
    }
  }
});

<template>
  <div class="uniwersal__item">
    <UIColorIcon
      :color="props.fromAccountColor"
      :icon="props.fromAccountIcon"
    />
    <div class="item__info">
      <div class="info__name">{{ props.fromName }}</div>
      <div class="info__to secondary__color">
        <UIColorIcon
          v-if="props.toAccountIcon"
          :icon="props.toAccountIcon"
          size="20px"
        />
        <div v-if="secondaryText.length">{{ secondaryText.join(' | ') }}</div>
      </div>
    </div>
    <div class="item__amount">
      <div :class="`operation__type${props.typeId}`">
        {{ integerFormatter(props.fromAmount) }} {{ props.fromAccountCurrency }}
      </div>
      <div
        v-if="props.fromAccountCurrency !== props.toAccountCurrency"
        class="secondary__color"
      >
        {{ props.toAmount ? integerFormatter(props.toAmount) : '' }} {{ props.toAccountCurrency }}
      </div>
    </div>
  </div>
</template>

<script setup>
  import { computed } from 'vue'
  import { integerFormatter } from '@/helpers/numberToLocal'

  const props = defineProps({
    fromAccountColor: { type: String, required: false, default: null },
    fromAccountIcon: { type: String, required: false, default: null },
    fromName: { type: String, required: false, default: null },
    fromAmount: { type: [String, Number], required: false, default: null },
    fromAccountCurrency: { type: String, required: false, default: null },

    toAccountColor: { type: String, required: false, default: null },
    toAccountIcon: { type: String, required: false, default: null },
    toName: { type: String, required: false, default: null },
    toAmount: { type: String, required: false, default: null },
    toAccountCurrency: { type: String, required: false, default: null },

    comment: { type: String, required: false, default: null },
    typeId: { type: [Number, String], required: false, default: 3 },
  })

  const secondaryText = computed(() => {
    return [props.toName, props.comment].filter(Boolean)
  })
</script>

<style lang="scss" scoped>
  .uniwersal__item {
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-rows: 1fr;
    gap: 8px;
    padding: 8px;
    border-radius: 8px;
    cursor: pointer;
    @include transition();
    @include hover() {
      background: rgba(10, 10, 10, 0.1);
    }
  }

  .item__info {
    display: grid;
    grid-template-rows: auto auto;
  }

  .info__name {
    display: flex;
    align-items: center;
    font-weight: 400;
    font-size: 16px;
    line-height: 130%;
    letter-spacing: 0%;
  }

  .info__to {
    display: flex;
    align-items: center;
    gap: 4px;
    font-weight: 400;
    font-size: 12px;
    line-height: 130%;
    letter-spacing: 0%;
  }

  .main__color {
    color: #000000;
  }
  .secondary__color {
    color: #94a3b8;
  }

  .item__amount {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .operation__type3 {
    color: #94a3b8;
  }
  .operation__type2 {
    color: #f23737;
  }
  .operation__type1 {
    color: #2eba77;
  }
</style>

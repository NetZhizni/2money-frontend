<template>
  <div class="transaction-item">
    <UIMyIcon
      class="acc-icon-wrapper"
      :color="props.color"
      :icon="props.icon"
      type="transaction"
    />
    <div class="tx-details">
      <div class="tx-title">{{ props.title }}</div>
      <div class="tx-account">
        <Icon :icon="`mdi:${props.icon_to}`" />
        {{ props.title_to }}
      </div>
    </div>
    <div
      class="tx-amount"
      :class="`val-${props.type}`"
    >
      {{ props.amount }}
    </div>
  </div>
</template>

<script setup>
  import { ref, defineProps, defineEmits, computed } from 'vue'
  const props = defineProps({
    title: { type: String, required: true, default: 'asdasd' },
    // account: { type: String, required: true, default: '' },
    icon: { type: String, required: true, default: 'account' },
    icon_to: { type: String, required: true, default: 'account' },
    title_to: { type: String, required: true, default: 'asdaqwdq' },
    color: { type: String, required: true, default: '#888' },
    amount: { type: String, required: true, default: '0 ₴' },
    type: { type: String, required: true, default: 'expense' }, // 'expense', 'income', 'neutral'
  })
</script>

<style scoped>
  .acc-icon-wrapper {
    position: relative;
    margin-right: 15px;
  }

  .account-icon {
    background-color: color-mix(in srgb, currentColor 25%, transparent);
  }
  .transaction-item {
    display: flex;
    align-items: center;
    margin-bottom: 20px;
    cursor: pointer;
  }

  .tx-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 24px;
    color: #fff;
    margin-right: 15px;
    flex-shrink: 0;
  }

  /* Icon Background Colors */
  .bg-red {
    background-color: #de413e;
  }
  .bg-brown {
    background-color: #9d7b6a;
  }
  .bg-blue {
    background-color: #3e58b8;
  }
  .bg-green {
    background-color: #3d8c40;
  }

  .tx-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .tx-title {
    font-size: 16px;
    color: #333;
    font-weight: 500;
    margin-bottom: 4px;
  }

  .tx-account {
    font-size: 12px;
    color: #888;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .tx-amount {
    font-size: 15px;
    font-weight: 400;
  }

  .val-expense {
    color: #d65a76;
  }
  .val-income {
    color: #34a88b;
  }
  .val-neutral {
    color: #888;
  }
</style>

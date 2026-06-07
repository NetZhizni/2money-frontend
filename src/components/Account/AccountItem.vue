<template>
  <div class="account-item">
    <UIMyIcon
      class="acc-icon-wrapper"
      :icon="props.icon"
      :color="props.color"
    />
    <div class="acc-details">
      <div class="acc-name">{{ props.name }}</div>
      <div
        class="acc-balance"
        :class="textColor(props.balance)"
      >
        {{ customCurrencyFormatter(props.balance, props.currency, props.currency_display) }}
      </div>
    </div>
    <div class="acc-right-info">
      <div
        v-if="props.subBalance"
        class="acc-sub-balance text-gray"
      >
        {{ props.subBalance }}
      </div>
      <div
        v-if="props.progress"
        class="progress-ring"
      >
        <span>{{ props.progress }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, defineProps, defineEmits } from 'vue'
  import { Icon } from '@iconify/vue'
  import textColor from '@/helpers/textColor'
  import { customCurrencyFormatter } from '@/helpers/numberToLocal'
  const props = defineProps({
    name: { type: String, required: true, default: '' },
    icon: { type: String, required: true, default: 'account' },
    color: { type: String, required: true, default: '#539e60' },
    currency: { type: String, required: true, default: 'UAH' },
    currency_display: { type: String, required: true, default: 'code' },
    balance: { type: Number, required: true, default: '' },
    // !TODO
    // subBalance: { type: String, required: true, default: '' },
    // progress: { type: String, required: true, default: '' },
  })
  const emit = defineEmits({
    'update:modelValue': (value) => typeof value === 'string',
  })
</script>

<style scoped>
  /* Account Item */
  .account-item {
    display: flex;
    align-items: center;
    margin-bottom: 20px;
    cursor: pointer;
  }

  .acc-icon-wrapper {
    position: relative;
    margin-right: 15px;
  }

  .acc-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 24px;
  }

  /* Badges & Icons Styling */
  .star-badge {
    position: absolute;
    bottom: -5px;
    right: -5px;
    width: 22px;
    height: 22px;
    background-color: #f8b138;
    color: white;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 12px;
    border: 2px solid #fff;
  }

  /* Icon Backgrounds */
  .bg-brown {
    background-color: #937a6d;
    color: #fff;
  }
  .bg-red {
    background-color: #d32e35;
    color: #fff;
  }
  .bg-dark {
    background-color: #3c3c3e;
    color: #fff;
  }

  .bg-l-orange {
    background-color: #fcebe2;
    color: #e88349;
  }
  .bg-l-yellow {
    background-color: #fcf4df;
    color: #d7aa40;
  }
  .bg-l-green {
    background-color: #e6f3e6;
    color: #539e60;
  }

  .acc-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .acc-name {
    font-size: 15px;
    color: #333;
    font-weight: 500;
    margin-bottom: 4px;
  }

  .acc-balance {
    font-size: 15px;
    font-weight: 400;
  }

  /* Right side details (Progress ring etc) */
  .acc-right-info {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .acc-sub-balance {
    font-size: 14px;
    font-weight: 400;
  }

  .progress-ring {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: conic-gradient(#f8b138 35%, #ebebeb 0deg);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .progress-ring::before {
    content: '';
    position: absolute;
    width: 34px;
    height: 34px;
    background-color: #ffffff;
    border-radius: 50%;
  }

  .progress-ring span {
    position: relative;
    z-index: 1;
    font-size: 12px;
    font-weight: 600;
    color: #f8b138;
  }

  /* Bottom Navigation */
  .bottom-nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 25px 25px 25px;
    background-color: #fafafa;
    border-top: 1px solid #efefef;
    position: absolute;
    bottom: 0;
    width: 100%;
    z-index: 10;
  }

  .nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    color: #999;
    cursor: pointer;
  }

  .nav-item i {
    font-size: 24px;
    margin-bottom: 4px;
  }

  .nav-item span {
    font-size: 11px;
    font-weight: 500;
  }

  .nav-item.active {
    color: #333;
  }

  .nav-item.active i {
    font-weight: bold;
  }
</style>

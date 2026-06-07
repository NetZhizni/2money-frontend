<template>
  <header class="header">
    <div class="top-bar">
      <Icon
        :icon="`mdi:account`"
        class="icon"
      />
      <div class="balance-info">
        <div class="subtitle">Всі рахунки</div>
        <div class="amount">−19 020 ₴</div>
      </div>
      <Icon
        :icon="`mdi:pencil`"
        class="icon"
      />
    </div>
    <div class="date-selector">
      <Icon
        :icon="`mdi:chevron-double-left`"
        class="arrow"
      />
      <div class="date-badge">
        <span class="day-circle">31</span>
        ГРУДЕНЬ 2024
        <Icon
          :icon="`mdi:caret-down`"
          class="arrow"
        />
      </div>
      <Icon
        :icon="`mdi:chevron-double-right`"
        class="arrow"
      />
    </div>
  </header>
</template>

<script setup>
  import { Icon } from '@iconify/vue'
</script>

<style scoped>
  /* Header Section */
  .header {
    position: sticky;
    top: 0px;
    z-index: 100;
    background-color: #f6f3f6;
    padding: 20px;
    border-bottom-left-radius: 20px;
    border-bottom-right-radius: 20px;
    text-align: center;
  }

  .top-bar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 25px;
    color: #444;
  }

  .top-bar i {
    font-size: 28px;
    cursor: pointer;
  }

  .balance-info .subtitle {
    font-size: 13px;
    color: #666;
    font-weight: 500;
    margin-bottom: 4px;
  }

  .balance-info .amount {
    font-size: 22px;
    font-weight: 500;
    color: #333;
  }

  .date-selector {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 10px;
  }

  .icon {
    font-size: 24px;
  }

  .date-selector .arrow {
    color: #a44955;
    font-size: 24px;
    cursor: pointer;
  }

  .date-badge {
    background-color: #fcebea;
    color: #a44955;
    padding: 10px 20px;
    border-radius: 25px;
    font-size: 14px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .date-badge .day-circle {
    border: 1px solid #a44955;
    border-radius: 50%;
    width: 22px;
    height: 22px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 12px;
  }
</style>

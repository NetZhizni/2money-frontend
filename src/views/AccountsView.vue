<template>
  <div class="content-scroll">
    <div class="section-header">
      <div class="sec-title">Рахунки</div>
      <div class="sec-total text-red">−19 020,35 ₴</div>
    </div>

    <div class="account-item">
      <div class="acc-icon-wrapper">
        <div class="acc-icon bg-brown"><i class="ph ph-wallet"></i></div>
        <div class="star-badge"><i class="ph-fill ph-star"></i></div>
      </div>
      <div class="acc-details">
        <div class="acc-title">Готівка</div>
        <div class="acc-balance text-green">3 690 ₴</div>
      </div>
    </div>

    <div class="account-item">
      <div class="acc-icon-wrapper">
        <div class="acc-icon bg-red"><i class="ph ph-infinity"></i></div>
      </div>
      <div class="acc-details">
        <div class="acc-title">Пумб</div>
        <div class="acc-balance text-red">−3 298,50 ₴</div>
      </div>
    </div>

    <div class="account-item">
      <div class="acc-icon-wrapper">
        <div class="acc-icon bg-dark"><i class="ph ph-infinity"></i></div>
      </div>
      <div class="acc-details">
        <div class="acc-title">Mono</div>
        <div class="acc-balance text-red">−2 021,15 ₴</div>
      </div>
    </div>

    <div class="account-item">
      <div class="acc-icon-wrapper">
        <div class="acc-icon bg-dark"><i class="ph ph-credit-card"></i></div>
      </div>
      <div class="acc-details">
        <div class="acc-title">ПУМБ кредит</div>
        <div class="acc-balance text-red">−17 390,70 ₴</div>
      </div>
      <div class="acc-right-info">
        <div class="acc-sub-balance text-green">32 609 ₴</div>
      </div>
    </div>

    <div class="section-header">
      <div class="sec-title">Заощадження</div>
      <div class="sec-total text-green">1 811 539,12 ₴</div>
    </div>

    <div class="account-item">
      <div class="acc-icon-wrapper">
        <div class="acc-icon bg-l-orange"><i class="ph ph-safe"></i></div>
      </div>
      <div class="acc-details">
        <div class="acc-title">Заначка €</div>
        <div class="acc-balance text-green">300 €</div>
      </div>
    </div>

    <div class="account-item">
      <div class="acc-icon-wrapper">
        <div class="acc-icon bg-l-yellow"><i class="ph ph-refrigerator"></i></div>
      </div>
      <div class="acc-details">
        <div class="acc-title">$ Готівка</div>
        <div class="acc-balance text-green">100 USD</div>
      </div>
    </div>

    <div class="account-item">
      <div class="acc-icon-wrapper">
        <div class="acc-icon bg-l-green"><i class="ph ph-briefcase"></i></div>
      </div>
      <div class="acc-details">
        <div class="acc-title">Депо пумб Заначка $</div>
        <div class="acc-balance text-green">7 000 USD</div>
      </div>
      <div class="acc-right-info">
        <div class="acc-sub-balance text-gray">13 000 USD</div>
        <div class="progress-ring">
          <span>35</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>

</script>

<style scoped>
  /* Header Area (with slightly gray background) */
  .header-area {
    background-color: #f4f3f6;
    padding-bottom: 15px;
  }

  /* Status Bar (Dummy) */
  .status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 25px 5px 25px;
    font-size: 15px;
    font-weight: 600;
    color: #000;
  }
  .status-icons {
    display: flex;
    gap: 5px;
    font-size: 16px;
  }

  /* Top Bar Section */
  .top-bar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 10px 20px 20px 20px;
    color: #444;
  }

  .top-bar > i {
    font-size: 28px;
    cursor: pointer;
    color: #555;
  }

  .balance-info {
    text-align: center;
  }

  .balance-info .subtitle {
    font-size: 13px;
    color: #666;
    font-weight: 500;
    margin-bottom: 4px;
  }

  .balance-info .amount {
    font-size: 20px;
    font-weight: 400;
    color: #333;
  }

  /* Tabs Section */
  .tabs-container {
    display: flex;
    gap: 10px;
    padding: 0 20px;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    color: #888;
    background-color: transparent;
    cursor: pointer;
    white-space: nowrap;
  }

  .tab.active {
    background-color: #dfe8fd;
    color: #3a4c6b;
  }

  .tab i {
    font-size: 18px;
  }

  /* Main Content List */
  .content-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    background-color: #ffffff;
  }

  /* Section Header */
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    margin-top: 5px;
  }

  .section-header:not(:first-child) {
    margin-top: 25px;
  }

  .sec-title {
    font-size: 16px;
    color: #27699f;
    font-weight: 500;
  }

  .sec-total {
    font-size: 15px;
    font-weight: 500;
  }

  /* Colors for text */
  .text-red {
    color: #cf5a75;
  }
  .text-green {
    color: #30a68a;
  }
  .text-gray {
    color: #999;
  }

  /* Account Item */
  .account-item {
    display: flex;
    align-items: center;
    margin-bottom: 20px;
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

  .acc-title {
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

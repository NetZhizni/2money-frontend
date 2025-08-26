<template>
  <div class="content__login">
    <div class="login__action">
      <div class="action__welcome">
        <div>Ласкаво просимо</div>
        <div class="welcome__system"></div>
      </div>
      <q-btn
        noCaps
        class="action__google"
        @click.stop.passive="userStore.signInWithPopup()"
      >
        <UIMyIcon class="google__icon" icon="mdi:google" />Увійдіть з Google
      </q-btn>
    </div>
  </div>
</template>

<script setup>
  import { useUserStore } from '@/store/user'

  const userStore = useUserStore()
</script>

<style scoped lang="scss">
  .content__login {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 100%;
    justify-items: center;
    align-items: center;
    height: 100%;
    padding: 0px 100px;
  }

  .login__action {
    padding: 25px 16px;
  }

  .action__welcome {
    font-size: 32px;
    line-height: 100%;
    font-weight: 600;
    margin-bottom: 30px;
    @include tablet() {
      font-size: 24px;
      line-height: 31px;
    }

    .welcome__system {
      font-size: 36px;
      line-height: 100%;
      font-weight: 700;
      @include tablet() {
        font-size: 24px;
        line-height: 31px;
      }
    }

    span {
      color: var(--q-primary);
    }
  }

  .action__google {
    margin: 15px 0px;
    width: 100%;
    min-height: 56px;
    border: 1px solid;
    font-size: 16px;
    line-height: 21px;
    @include tablet() {
      font-size: 16px;
      line-height: 21px;
    }
  }
  .google__icon {
    margin-right: 8px;
  }

  .action__text {
    font-size: 14px;
    line-height: 18px;
    font-weight: 500;
    color: var(--color-text-main);
  }

  .action__text > a {
    text-decoration: underline;
    cursor: pointer;
    color: var(--q-primary);
  }

  .login__images {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    justify-items: center;
    align-items: center;
  }

  .login__img {
    width: 100%;
    // height: 100%;
    object-fit: cover;
    padding: 16px;
  }

  @include laptop() {
    .content__login {
      grid-template-columns: 1fr;
      padding: 0px 20px;
    }
    .action__welcome {
      text-align: center;
    }
    .login__img {
      display: none;
    }
  }
</style>

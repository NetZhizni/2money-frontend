<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="props.modelValue"
        class="wrapper__background"
      ></div>
    </Transition>
    <Transition name="vue__animate">
      <div
        v-if="props.modelValue"
        class="wrapper__popup"
      >
        <div
          class="popup__dialog"
          :class="`popup__${props.popupType}`"
        >
          <button
            class="dialog__close"
            @click.stop.passive="closePopup"
          >
            <Icon :icon="`mdi:close`" />
          </button>
          <div class="dialog__title">{{ props.title }}</div>
          <div
            v-if="props.subtitle"
            class="dialog__subtitle"
          >
            {{ props.subtitle }}
          </div>
          <div
            v-if="$slots.topRow"
            class="dialog__top-row"
          >
            <slot name="topRow"></slot>
          </div>
          <div
            v-if="$slots.default && props.modelValue"
            class="dialog__body"
          >
            <slot></slot>
          </div>
          <div
            v-if="$slots.bottomRow"
            class="dialog__bottom-row"
          >
            <slot name="bottomRow"></slot>
          </div>
          <div class="dialog__footer">
            <q-btn
              v-if="props.btnCancelLabel"
              outline
              color="secondary"
              class="footer__cancel"
              :label="props.btnCancelLabel"
              :disable="
                props.btnConfirmLoading || props.btnCancelLoading || props.btnCancelDisabled
              "
              :loading="props.btnCancelLoading"
              noCaps
              @click.stop.passive="cancelPopup"
            />
            <q-btn
              v-if="props.btnConfirmLabel"
              color="primary"
              class="footer__corfirm"
              :label="props.btnConfirmLabel"
              :disable="
                props.btnConfirmLoading || props.btnCancelLoading || props.btnConfirmDisabled
              "
              :loading="props.btnConfirmLoading"
              noCaps
              @click.stop.passive="confirmPopup"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
  import { defineProps, defineEmits } from 'vue'
  import { Icon } from '@iconify/vue'

  const props = defineProps({
    modelValue: { type: Boolean, required: true, default: false },
    popupType: {
      type: String,
      required: false,
      default: 'small',
      validator: (value) => ['small', 'medium', 'big', 'max'].includes(value),
    },
    persistent: { type: Boolean, required: false, default: true },
    title: { type: String, required: false, default: '' },
    subtitle: { type: String, required: false, default: null },
    // Cancel
    btnCancelLabel: { type: String, required: false, default: '' },
    btnCancelDisabled: { type: Boolean, required: false, default: false },
    btnCancelLoading: { type: Boolean, required: false, default: false },
    // Confirm
    btnConfirmLabel: { type: String, required: false, default: '' },
    btnConfirmDisabled: { type: Boolean, required: false, default: false },
    btnConfirmLoading: { type: Boolean, required: false, default: false },
  })
  const emit = defineEmits({
    'update:modelValue': (value) => typeof value === 'boolean',
    confirm: () => true,
    cancel: () => true,
    close: () => true,
  })

  const closePopup = () => {
    emit('close')
    emit('update:modelValue', false)
  }

  const confirmPopup = () => {
    emit('confirm')
  }

  const cancelPopup = () => {
    emit('cancel')
  }
</script>

<style lang="scss" scoped>
  /* Scale in/out */
  .vue__animate-item {
    position: absolute;
  }
  .vue__animate-enter-active,
  .vue__animate-leave-active {
    @include transition();
  }
  .vue__animate-enter-from {
    transform: scale(0);
    opacity: 0;
  }
  .vue__animate-enter-to {
    transform: scale(1);
    opacity: 1;
  }
  .vue__animate-leave-from {
    transform: scale(1);
    opacity: 1;
  }
  .vue__animate-leave-to {
    transform: scale(0);
    opacity: 0;
  }

  @include tablet {
    .vue__animate-enter-from {
      transform: translateY(100%);
    }
    .vue__animate-enter-to {
      transform: translateY(0);
    }
    .vue__animate-leave-from {
      transform: translateY(0);
    }
    .vue__animate-leave-to {
      transform: translateY(100%);
    }
  }

  .wrapper__background {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    backdrop-filter: blur(1px);
    z-index: 100;
    @include transition();
  }

  .wrapper__popup {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 100;
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
    justify-items: center;
    align-items: center;
    justify-content: center;
    align-content: center;
    overflow: hidden;
    @include transition();
    @include tablet {
      justify-items: auto;
      align-items: flex-end;
      justify-content: stretch;
      align-content: stretch;
    }
  }

  .popup__dialog {
    padding: 40px 32px;
    position: relative;
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto 1fr auto auto;
    max-height: calc(100dvh - 20px);
    max-width: calc(100dvw - 20px);
    margin: 20px;
    border-radius: 16px;
    background-color: white;
    box-shadow: 0px 4px 16px #000000;
    @include overflow(none);
    @include tablet {
      padding: 40px 16px 20px 16px;
      margin: 0px;
      border-radius: 16px 16px 0px 0px;
      max-width: 100vw;
    }
  }

  .popup__dialog > * {
    margin: 8px;
  }

  .dialog__close {
    position: absolute;
    display: flex;
    justify-content: center;
    align-items: center;
    top: 0px;
    right: 0px;
    background-color: white;
    width: 44px;
    height: 44px;
    border: 0px;
    border-radius: 50%;
    cursor: pointer;
    @include transition();
  }

  .dialog__close:hover {
    background-color: #d3d3d3;
    // transform: translateY(-2px) scale(1.05); /* Кнопка злегка "підстрибує" вгору */
    box-shadow: 0 6px 14px #0000000f; /* Тінь збільшується при наведенні */
  }

  .dialog__close:active {
    transform: translateY(1px) scale(0.95);
    box-shadow: 0 2px 5px #0000004d;
  }

  .popup__small {
    width: 486px;
    @include tablet {
      width: 100%;
    }
  }

  .popup__medium {
    width: 580px;
    @include tablet {
      width: 100%;
    }
  }

  .popup__big {
    width: 800px;
    height: 100%;
    @include tablet {
      width: 100%;
    }
  }

  .popup__max {
    width: 100%;
    height: 100%;
  }

  .dialog__title {
    grid-row: 1;
    // color: var(--color-text-main);
    font-size: 28px;
    font-weight: 500;
    text-align: center;
    // @include largeWords();
    @include lineClamp(3);
    @include tablet {
      font-size: 24px;
      font-weight: 700;
      line-height: 32px;
    }
  }

  .dialog__subtitle {
    grid-row: 2;
    // color: var(--color-text-quaternary);
    text-align: center;
    font-weight: 400;
    font-size: 14px;
    line-height: 18px;
    // @include largeWords();
    @include lineClamp(3);
  }

  .dialog__top-row {
    grid-row: 3;
  }

  .dialog__body {
    grid-row: 4;
    width: calc(100% - 8px);
    @include overflow();
  }

  .dialog__bottom-row {
    grid-row: 5;
  }

  .dialog__footer {
    grid-row: 6;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, auto));
    grid-gap: 8px;
  }

  .footer__corfirm {
    // color: var(--color-text-tertiary);
    // background-color: var(--q-primary);
    width: 100%;
    // height: 56px;
  }

  .footer__cancel {
    color: var(--color-text-main);
    background-color: var(--color-divider);
    width: 100%;
    // height: 56px;
  }
</style>

<template>
  <div class="icon__editor">
    <UIColorIcon
      :color="props.color"
      :icon="props.icon"
      size="80px"
      style="cursor: pointer"
      @click="isOpenIconEditor = true"
    />
    <div>Редагувати</div>
    <UIMyPopup
      popupType="big"
      btnCancelLabel="Відмінити"
      btnConfirmLabel="Обрати"
      v-model:modelValue="isOpenIconEditor"
      title="Редагування"
      @confirm="confirmCreate"
      @cancel="closeCreate"
      @close="closeCreate"
    >
      <div class="popup__content">
        <div class="popup__icon">
          <UIColorIcon
            :color="color"
            :icon="icon"
            size="80px"
          />
        </div>
        <q-tabs
          v-model="tab"
          class="text-grey"
          active-color="primary"
          indicator-color="primary"
          align="justify"
          narrow-indicator
        >
          <q-tab
            name="icon"
            label="Іконки"
          />
          <q-tab
            name="color"
            label="Колльори"
          />
        </q-tabs>
        <q-separator />
        <q-tab-panels
          v-model="tab"
          animated
          class="tab__panels"
        >
          <q-tab-panel
            name="color"
            class="tab__panel"
          >
            <IconEditorColorPicker v-model:select="color" />
          </q-tab-panel>
          <q-tab-panel
            name="icon"
            class="tab__panel"
          >
            <IconEditorIconPicker v-model:select="icon" />
          </q-tab-panel>
        </q-tab-panels>
      </div>
    </UIMyPopup>
  </div>
</template>

<script setup>
  import { ref, watch } from 'vue'

  const props = defineProps({
    color: { type: String, required: false, default: '' },
    icon: { type: String, required: false, default: '' },
  })
  const emit = defineEmits({
    'update:icon': (value) => typeof value === 'string',
    'update:color': (value) => typeof value === 'string',
  })

  const isOpenIconEditor = ref(false)
  const tab = ref('icon')
  const color = ref(null)
  const icon = ref(null)

  const closeCreate = () => {
    isOpenIconEditor.value = false
  }

  const confirmCreate = () => {
    emit('update:color', color.value)
    emit('update:icon', icon.value)
    closeCreate()
  }

  watch(
    () => isOpenIconEditor.value,
    (value) => {
      if (value) {
        color.value = props.color
        icon.value = props.icon
      } else {
        color.value = null
        icon.value = null
      }
    },
  )
</script>

<style lang="scss" scoped>
  .icon__editor {
    display: grid;
    grid-template-columns: 1fr;
    align-items: center;
    justify-items: center;
    gap: 8px;
  }

  .popup__content {
    display: grid;
    grid-template-rows: 1fr;
    grid-template-columns: 1fr;
    align-items: start;
    align-content: start;
    width: 100%;
    max-height: 100%;
    @include overflow(none);
  }

  .popup__icon {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
  }

  .tab__panels {
    display: grid;
    grid-template-rows: 1fr;
    grid-template-columns: 1fr;
    align-items: start;
    align-content: start;
    max-height: 100%;
    @include overflow(none);
  }

  .tab__panel {
    width: 100%;
    @include overflow(none);
  }
</style>

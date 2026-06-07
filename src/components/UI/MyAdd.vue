<template>
  <button class="add-btn">
    <Icon :icon="`mdi:plus`" />
  </button>
</template>

<script setup>
  import { Icon } from '@iconify/vue'
</script>

<style scoped>
  .add-btn {
    /* --- НОВІ ВЛАСТИВОСТІ ДЛЯ ПОЗИЦІОНУВАННЯ --- */
    position: fixed; /* Фіксує кнопку відносно вікна браузера */
    bottom: 90px; /* Відступ від нижнього краю екрана */
    right: 30px; /* Відступ від правого краю екрана */
    z-index: 100; /* Гарантує, що кнопка буде поверх тексту та списків */
    /* ------------------------------------------- */

    /* Розміри та форма (з попереднього кроку) */
    width: 60px;
    height: 60px;
    border-radius: 50%;

    /* Вирівнювання іконки по центру */
    display: flex;
    justify-content: center;
    align-items: center;

    /* Дизайн */
    background-color: #efefef;
    color: #000000;
    border: none;
    font-size: 24px;
    box-shadow: 0 4px 10px #0000004d; /* Зробив тінь трохи більшою для плаваючого ефекту */

    /* Взаємодія */
    cursor: pointer;
    transition:
      background-color 0.2s ease,
      transform 0.1s ease,
      box-shadow 0.2s ease;
  }

  /* Ефект при наведенні курсору */
  .add-btn:hover {
    background-color: #d3d3d3;
    transform: translateY(-2px) scale(1.05); /* Кнопка злегка "підстрибує" вгору */
    box-shadow: 0 6px 14px #00000066; /* Тінь збільшується при наведенні */
  }

  /* Ефект при кліку */
  .add-btn:active {
    transform: translateY(1px) scale(0.95);
    box-shadow: 0 2px 5px #0000004d;
  }
</style>

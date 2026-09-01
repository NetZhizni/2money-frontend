<script setup lang="ts">
  import { onMounted, ref } from 'vue'
  import { useAdminStore } from '../stores/admin'
  import { useAuthStore } from '../stores/auth'

  const admin = useAdminStore()
  const authStore = useAuthStore()

  onMounted(() => admin.load())

  const newEmail = ref('')
  const adding = ref(false)

  async function handleAdd() {
    const email = newEmail.value.trim()
    if (!email) return
    adding.value = true
    try {
      await admin.addUser(email)
      newEmail.value = ''
    } catch {
      // admin.error already holds the message, shown below
    } finally {
      adding.value = false
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    if (id === authStore.uid && !isActive) {
      if (!confirm('Це вимкне ваш власний доступ. Продовжити?')) return
    }
    await admin.setActive(id, !isActive).catch(() => {})
  }

  async function toggleRole(id: string, role: 'owner' | 'member') {
    const next = role === 'owner' ? 'member' : 'owner'
    await admin.setRole(id, next).catch(() => {})
  }
</script>

<template>
  <div class="view">
    <div>
      <h1 class="page-title">Учасники родини</h1>
    </div>
    <div class="view-scroll">
      <div class="view-scroll-content">
        <p class="hint">
          Тут ви заводите email члена родини заздалегідь — при першому вході через цю Google-адресу
          він автоматично отримає доступ під тим профілем, що ви тут створили.
        </p>

        <div class="add-row">
          <input
            v-model="newEmail"
            type="email"
            placeholder="ім'я@gmail.com"
            @keyup.enter="handleAdd"
          />
          <button
            class="btn btn-primary"
            :disabled="adding"
            @click="handleAdd"
          >
            Додати
          </button>
        </div>
        <p
          v-if="admin.error"
          class="field-error"
        >
          {{ admin.error }}
        </p>

        <ul
          v-if="admin.users.length"
          class="user-list"
        >
          <li
            v-for="u in admin.users"
            :key="u.id"
            class="user-row"
            :class="{ inactive: !u.isActive }"
          >
            <img
              v-if="u.photoUrl"
              :src="u.photoUrl"
              class="avatar"
              alt=""
            />
            <div
              v-else
              class="avatar avatar-fallback"
              :style="{ background: u.color }"
            >
              {{ (u.displayName || u.email).slice(0, 1).toUpperCase() }}
            </div>
            <div class="user-text">
              <span class="user-name">
                {{ u.displayName }}
                <span
                  v-if="u.id === authStore.uid"
                  class="you-badge"
                  >ви</span
                >
              </span>
              <span class="user-email">{{ u.email }}</span>
            </div>
            <button
              class="chip"
              :class="{ owner: u.role === 'owner' }"
              @click="toggleRole(u.id, u.role)"
            >
              {{ u.role === 'owner' ? 'Власник' : 'Учасник' }}
            </button>
            <button
              class="chip"
              :class="{ active: u.isActive }"
              @click="toggleActive(u.id, u.isActive)"
            >
              {{ u.isActive ? 'Активний' : 'Вимкнено' }}
            </button>
          </li>
        </ul>
        <p
          v-else-if="!admin.loading"
          class="hint"
        >
          Ще немає жодного учасника, окрім вас.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .page-title {
    font-size: 20px;
    margin: 8px 0 4px;
  }
  .hint {
    font-size: 13px;
    color: var(--text-muted);
    margin: 0 0 16px;
  }
  .add-row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }
  .add-row input {
    flex: 1;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    font-size: 14px;
    color: var(--text-primary);
  }
  .field-error {
    color: var(--expense);
    font-size: 12px;
    margin: 0 0 12px;
  }
  .user-list {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .user-row {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--surface);
    border-radius: var(--radius-md);
    padding: 10px 12px;
    box-shadow: var(--shadow-sm);
  }
  .user-row.inactive {
    opacity: 0.55;
  }
  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }
  .avatar-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 700;
    font-size: 14px;
  }
  .user-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .user-name {
    font-size: 14px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .you-badge {
    font-size: 10px;
    font-weight: 600;
    color: var(--accent);
    border: 1px solid var(--accent);
    border-radius: var(--radius-pill);
    padding: 1px 6px;
    margin-left: 6px;
  }
  .user-email {
    font-size: 12px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip {
    border: none;
    border-radius: var(--radius-pill);
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 600;
    background: var(--surface-2);
    color: var(--text-secondary);
    cursor: pointer;
    flex-shrink: 0;
  }
  .chip.owner {
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent);
  }
  .chip.active {
    background: color-mix(in srgb, var(--income) 16%, transparent);
    color: var(--income);
  }
</style>

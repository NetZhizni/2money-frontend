import { defineStore } from 'pinia'
import { ref } from 'vue'
import http from '../api/http'
import { t } from '../i18n'
import type { UserRole } from '../types/models'

export interface AdminUserRow {
  id: string
  email: string
  displayName: string
  photoUrl: string | null
  color: string
  role: UserRole
  isActive: boolean
  createdAt: number
}

/**
 * Owner-only family member management (GET/POST/PATCH /api/admin/users).
 * Deliberately network-only, no Dexie/outbox — this isn't data the app needs
 * to read or edit offline, and every mutation needs the server's immediate
 * validation (duplicate email, "can't demote the last owner", etc).
 */
export const useAdminStore = defineStore('admin', () => {
  const users = ref<AdminUserRow[]>([])
  const loading = ref(false)
  const error = ref('')

  async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const { data } = await http.get<AdminUserRow[]>('/admin/users')
      users.value = data
    } catch (e) {
      error.value = extractMessage(e)
    } finally {
      loading.value = false
    }
  }

  async function addUser(email: string): Promise<void> {
    error.value = ''
    try {
      await http.post('/admin/users', { email })
      await load()
    } catch (e) {
      error.value = extractMessage(e)
      throw e
    }
  }

  async function setActive(id: string, isActive: boolean): Promise<void> {
    error.value = ''
    try {
      await http.patch(`/admin/users/${id}`, { isActive })
      await load()
    } catch (e) {
      error.value = extractMessage(e)
      throw e
    }
  }

  async function setRole(id: string, role: UserRole): Promise<void> {
    error.value = ''
    try {
      await http.patch(`/admin/users/${id}`, { role })
      await load()
    } catch (e) {
      error.value = extractMessage(e)
      throw e
    }
  }

  return { users, loading, error, load, addUser, setActive, setRole }
})

function extractMessage(error: unknown): string {
  const data = (error as { response?: { data?: { message?: string } } })?.response?.data
  return data?.message ?? (error as Error)?.message ?? t('errors.generic')
}

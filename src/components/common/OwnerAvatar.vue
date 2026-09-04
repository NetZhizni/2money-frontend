<script setup lang="ts">
import type { Profile } from '../../types/models'

/**
 * Small round "whose is this" badge — an account/transaction's owner, shown
 * only in "view as all" (see stores/viewAs.ts) where rows from every family
 * member are mixed together and would otherwise be unattributable. Meant to
 * overlay the corner of an IconCircle, the same way the sync "pending" badge
 * does.
 */
const props = withDefaults(defineProps<{ profile: Profile; size?: number }>(), { size: 18 })
</script>

<template>
  <img
    v-if="profile.photoURL"
    :src="profile.photoURL"
    class="owner-avatar"
    :style="{ width: `${props.size}px`, height: `${props.size}px` }"
    :alt="profile.displayName"
    :title="profile.displayName"
  />
  <span
    v-else
    class="owner-avatar owner-avatar-fallback"
    :style="{ width: `${props.size}px`, height: `${props.size}px`, background: profile.color, fontSize: `${Math.round(props.size * 0.5)}px` }"
    :title="profile.displayName"
  >{{ profile.displayName.slice(0, 1) }}</span>
</template>

<style scoped>
.owner-avatar {
  display: block;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  border: 2px solid var(--surface);
  box-sizing: border-box;
}

.owner-avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
}
</style>

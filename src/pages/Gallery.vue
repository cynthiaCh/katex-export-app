
<template>
  <div class="grid">
    <article v-for="(it, idx) in items" :key="idx" class="card">
      <h3>{{ it.title }}</h3>
      <div class="katex" :id="'k-'+idx"></div>

      <p class="meta">
        <span v-if="it.plot?.type==='ln'">ln / 导数 1/x</span>
        <span v-else-if="it.plot?.type==='sin'">正弦族（可调 A, ω, φ）</span>
        <span v-else-if="it.plot?.type==='cos'">余弦族（可调 A, ω, φ）</span>
      </p>

      <router-link class="btn" :to="{ name:'detail', params:{ id: idx } }">
        查看详情 →
      </router-link>
    </article>
  </div>
</template>

<script setup lang="ts">
import { onMounted, nextTick } from 'vue'
import katex from 'katex'
import items from '../assets/derivative_formulas.json'

onMounted(async () => {
  await nextTick()
  items.forEach((it, idx) => {
    const el = document.getElementById('k-'+idx)
    if (el) katex.render(it.latex, el, { throwOnError:false, displayMode:true })
  })
})
</script>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}
.card {
  border: 1px solid #e5e7eb; border-radius: 10px; background: #fff;
  padding: 12px; display: flex; flex-direction: column; gap: 8px;
}
.katex { font-size: 22px; min-height: 48px; display: flex; align-items: center; }
.meta { color: #64748b; font-size: 12px; }
.btn {
  margin-top: 6px; align-self: flex-start;
  border: 1px solid #cbd5e1; border-radius: 8px; padding: 6px 10px;
  color: #0f172a; text-decoration: none; background: #fff;
}
.btn:hover { background: #f8fafc; }
</style>

<template>
  <header class="topbar">
    <div class="wrap">
      <router-link to="/" class="brand">函数库</router-link>
    </div>
  </header>
  <main class="wrap">
    <router-view />
  </main>
</template>

<style>
.wrap { max-width: 980px; margin: 0 auto; padding: 12px; }
.topbar { border-bottom: 1px solid #eee; background: #fff; }
.brand { text-decoration: none; color: #111; font-weight: 600; }
</style>

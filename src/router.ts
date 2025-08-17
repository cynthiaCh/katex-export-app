import { createRouter, createWebHistory } from 'vue-router'

// 路由级懒加载（减少首屏体积）
const Gallery = () => import('./pages/Gallery.vue')
const Detail  = () => import('./pages/Detail.vue')

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL), // 自动读取 vite base
  routes: [
    { path: '/', name: 'home', component: Gallery },
    // 用下标 id 定位到 formulas.json 的某一条
    { path: '/f/:id(\\d+)', name: 'detail', component: Detail, props: true },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ],
  scrollBehavior() { return { top: 0 } }
})

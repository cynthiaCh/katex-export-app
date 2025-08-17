import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import 'katex/dist/katex.min.css'   // KaTeX 样式
createApp(App).use(router).mount('#app')

<template>
  <div v-if="item" class="detail">
    <router-link to=".." class="back">← 返回</router-link>

    <h2>{{ item.title }}</h2>

    <!-- 公式 -->
    <div class="formula" id="formula"></div>

    <!-- 参数滑块（sin/cos 才显示） -->
    <div v-if="isTrig" class="param-panel">
      <div class="param-row">
        <label>A (Amplitude)</label>
        <input type="range" min="0" max="5" step="0.01" v-model.number="p.A" @input="onParamChange" />
        <input type="number" step="0.01" v-model.number="p.A" @change="onParamChange" />
      </div>
      <div class="param-row">
        <label>ω (Frequency)</label>
        <input type="range" min="0" max="5" step="0.01" v-model.number="p.w" @input="onParamChange" />
        <input type="number" step="0.01" v-model.number="p.w" @change="onParamChange" />
      </div>
      <div class="param-row">
        <label>φ (Phase)</label>
        <input type="range" :min="-Math.PI" :max="Math.PI" step="0.01" v-model.number="p.phi" @input="onParamChange" />
        <input type="number" :min="-Math.PI" :max="Math.PI" step="0.01" v-model.number="p.phi" @change="onParamChange" />
      </div>
      <div class="param-actions">
        <button @click="resetParams">Reset</button>
      </div>
    </div>

    <!-- 绘图 -->
    <div v-if="item.plot" class="plot-wrap">
      <canvas id="plot" class="plot-canvas" width="500" height="300"></canvas>
      <div class="plot-caption">
        <span>Function & Derivative</span>
        <span v-if="type==='ln'"> (y = ln x, y' = 1/x)</span>
        <span v-else-if="type==='sin'"> (y = A*sin(ωx+φ), y' = Aω*cos(ωx+φ))</span>
        <span v-else-if="type==='cos'"> (y = A*cos(ωx+φ), y' = -Aω*sin(ωx+φ))</span>
        <button class="btn-link" @click="resetView" title="Restore full view">View Full</button>
      </div>
    </div>

    <!-- 计算 -->
    <div class="calc">
      <div class="calc-row">
        <label>Input x₀:</label>
        <input
          type="number"
          v-model.number="x0"
          :step="type==='ln' ? '0.01' : '0.1'"
          :min="type==='ln' ? '0.0001' : undefined"
          placeholder="e.g., 1 / 10 / 999"
        />
        <button @click="doCompute">Compute</button>
      </div>
      <div class="calc-result" v-if="result">
        <div>f(x₀) = {{ result.fx }}</div>
        <div>f′(x₀) = {{ result.dx }}</div>
        <div class="warn" v-if="result.warn">{{ result.warn }}</div>
      </div>
    </div>

    <p class="note">{{ item.note }}</p>

    <div class="btns">
      <button @click="exportFormula">Export Formula PNG</button>
      <button v-if="item.plot" @click="exportPlot">Export Plot PNG</button>
      <button v-if="item.plot" @click="exportCard">Export Card PNG</button>
      <button class="btn-link" @click="copyShareUrl">复制当前参数链接</button>
    </div>
  </div>

  <div v-else>
    <router-link to="/">返回</router-link>
    <p>条目不存在。</p>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import katex from 'katex'
import html2canvas from 'html2canvas'
import formulas from '../assets/derivative_formulas.json'

// Chart.js v4
import {
  Chart, LineController, LineElement, PointElement, LinearScale, Title, Tooltip, Legend
} from 'chart.js'
Chart.register(LineController, LineElement, PointElement, LinearScale, Title, Tooltip, Legend)
Chart.defaults.devicePixelRatio = 1

// -------------- 路由与数据 --------------
const route = useRoute()
const router = useRouter()
const id = computed(() => Number(route.params.id))
const item = computed(() => formulas[id.value])
const type = computed(() => item.value?.plot?.type)
const isTrig = computed(() => type.value === 'sin' || type.value === 'cos')

// -------------- 状态（单条） --------------
const p = ref({ A: 1, w: 1, phi: 0 })     // sin/cos 参数
const x0 = ref(null)                       // 输入点
const result = ref(null)                   // 计算结果

// -------------- 图表 & 区间缓存 --------------
let chart = null
let full = { xMin: -6, xMax: 6 }

// -------------- 工具函数（与你原文件一致） --------------
const COLOR_FUNC = '#007bff'
const COLOR_DER  = '#dc3545'
const COLOR_TAN  = '#6c757d'
const COLOR_GUIDE= '#999999'

function getFuncs(type, params) {
  const { A=1, w=1, phi=0 } = params || {}
  switch (type) {
    case 'ln':
      return { f: x => Math.log(x), d: x => 1/x, names: { f: 'ln x', d: '1/x' } }
    case 'sin':
      return { f: x => A*Math.sin(w*x+phi), d: x => A*w*Math.cos(w*x+phi),
               names: { f:'A*sin(ωx+φ)', d:'Aω*cos(ωx+φ)' } }
    case 'cos':
      return { f: x => A*Math.cos(w*x+phi), d: x => -A*w*Math.sin(w*x+phi),
               names: { f:'A*cos(ωx+φ)', d:'-Aω*sin(ωx+φ)' } }
    default:
      return { f: x => x, d: x => 1, names: { f:'f(x)', d:"f'(x)" } }
  }
}
function buildData(type, xMin, xMax, params, N=600) {
  const { f, d } = getFuncs(type, params)
  const xs = Array.from({ length: N }, (_, i) => xMin + (xMax - xMin) * (i/(N-1)))
  const dataF=[], dataD=[]
  for (const x of xs) {
    if (type==='ln' && x<=0) { dataF.push({x, y:null}); dataD.push({x, y:null}) }
    else { dataF.push({x, y:f(x)}); dataD.push({x, y:d(x)}) }
  }
  return { xs, dataF, dataD }
}
function getVisibleYRange(chart, xMin, xMax) {
  const ys=[]
  chart.data.datasets.forEach(ds => (ds.data||[]).forEach(p=>{
    if (!p) return; const {x,y}=p; if (Number.isFinite(x)&&Number.isFinite(y)&&x>=xMin&&x<=xMax) ys.push(y)
  }))
  if (!ys.length) return [-3,3]
  let min=Math.min(...ys), max=Math.max(...ys)
  if (!(max>min)) { min-=1; max+=1 } ; return [min,max]
}
function setYRange(chart, yMin, yMax) {
  const pad = Math.max((yMax - yMin) * 0.12, 0.5)
  chart.options.scales.y.min = yMin - pad
  chart.options.scales.y.max = yMax + pad
}
function formatNum(v){ if(!Number.isFinite(v)) return String(v)
  const a=Math.abs(v); if(a!==0&&(a<1e-4||a>1e6)) return v.toExponential(4)
  return v.toFixed(6).replace(/\.?0+$/,'')
}

// -------------- 渲染逻辑 --------------
async function renderPage() {
  await nextTick()
  // KaTeX
  const el = document.getElementById('formula')
  if (el && item.value) katex.render(item.value.latex, el, { throwOnError:false, displayMode:true })

  // Plot
  if (item.value?.plot) {
    const xMin = item.value.plot.xMin ?? -6
    const xMax = item.value.plot.xMax ??  6
    full = { xMin, xMax }
    makePlot(xMin, xMax)
  }
}
function makePlot(xMin, xMax) {
  const cvs = document.getElementById('plot'); if (!cvs) return
  if (chart) { chart.destroy(); chart=null }
  const { xs, dataF, dataD } = buildData(type.value, xMin, xMax, p.value)
  const { names } = getFuncs(type.value, p.value)

  // 切线（仅 ln 可选）
  const tangentDatasets=[]
  const tangentAt = item.value.plot?.tangentAt ?? []
  if (type.value==='ln' && Array.isArray(tangentAt)) {
    for (const x0 of tangentAt) if (x0>0) {
      const y0=Math.log(x0), slope=1/x0
      tangentDatasets.push({
        label:`Tangent @ x=${x0} (slope=${slope.toFixed(3)})`,
        data: xs.map(x=>({x, y:y0+slope*(x-x0)})),
        borderWidth:1, borderDash:[6,4], pointRadius:0, borderColor:COLOR_TAN
      })
    }
  }

  chart = new Chart(cvs.getContext('2d'), {
    type:'line',
    data:{ datasets:[
      { label:names.f, data:dataF, borderWidth:2, pointRadius:0, borderColor:COLOR_FUNC },
      { label:names.d, data:dataD, borderWidth:2, pointRadius:0, borderColor:COLOR_DER  },
      ...tangentDatasets
    ]},
    options:{
      responsive:false, maintainAspectRatio:false, parsing:false, animation:false,
      scales:{ x:{ type:'linear', title:{display:true,text:'x'}, min:xMin, max:xMax, ticks:{maxTicksLimit:10} },
              y:{ type:'linear', title:{display:true,text:'y'} } },
      plugins:{ title:{ display:true, text:item.value.title },
                legend:{ display:true },
                tooltip:{ callbacks:{ label:(ctx)=>{
                  const l=ctx.dataset.label||''; const x=ctx.parsed.x; const y=ctx.parsed.y
                  return `${l}: (${x.toFixed(3)}, ${y?.toFixed(3)})`
                }}} },
      elements:{ line:{ tension:0 } }
    }
  })

  const [yMin,yMax]=getVisibleYRange(chart,xMin,xMax)
  setYRange(chart,yMin,yMax)
  chart.update()
}

// -------------- 交互 --------------
function onParamChange(){
  if (p.value.w<0) p.value.w=0
  if (!chart || !item.value?.plot) return
  const { dataF, dataD } = buildData(type.value, full.xMin, full.xMax, p.value)
  const { names } = getFuncs(type.value, p.value)
  chart.data.datasets[0].data = dataF
  chart.data.datasets[1].data = dataD
  chart.data.datasets[0].label = names.f
  chart.data.datasets[1].label = names.d

  const xMin = chart.options.scales.x.min ?? full.xMin
  const xMax = chart.options.scales.x.max ?? full.xMax
  const [yMin,yMax]=getVisibleYRange(chart,xMin,xMax)
  setYRange(chart,yMin,yMax)
  chart.update()
  syncQuery() // 把 A,w,phi 写入 URL，方便分享
}
function resetParams(){ p.value={A:1,w:1,phi:0}; onParamChange() }

function doCompute(){
  if (!item.value) return
  const t = type.value
  const { f,d } = getFuncs(t, p.value)
  const val = Number(x0.value)
  if (Number.isNaN(val)) { result.value={ fx:'-', dx:'-', warn:'请输入有效数字' }; return }
  if (t==='ln' && !(val>0)) { result.value={ fx:'-', dx:'-', warn:'ln(x) 需 x>0' }; return }
  const fx=f(val), dx=d(val)
  result.value={ fx:formatNum(fx), dx:formatNum(dx), warn:'' }

  // 局部缩放
  if (!chart) return
  let wantMin, wantMax
  if (t==='ln') {
    const eps=1e-6
    wantMin = Math.max(val/2, eps)
    wantMax = Math.max(2*val, wantMin+eps)
  } else {
    const w=Math.max(p.value.w??1, 0.01)
    const W=Math.PI/w
    wantMin=val-W; wantMax=val+W
  }
  // 扩展或重绘
  if (wantMin<full.xMin || wantMax>full.xMax) {
    full.xMin=Math.min(wantMin, full.xMin)
    full.xMax=Math.max(wantMax, full.xMax)
    makePlot(full.xMin, full.xMax)
  }
  // 应用窗口
  chart.options.scales.x.min = Math.max(wantMin, full.xMin)
  chart.options.scales.x.max = Math.min(wantMax, full.xMax)
  const [yMin,yMax]=getVisibleYRange(chart, chart.options.scales.x.min, chart.options.scales.x.max)
  setYRange(chart, yMin, yMax)
  addOrUpdateProbe(val, fx, dx)
  chart.update()
  syncQuery()
}
function addOrUpdateProbe(x, fx, dx){
  if (!chart) return
  const labels=['probe-guide','probe-f-point','probe-d-point']
  const ensure=(label, cfg)=>{
    let ds=chart.data.datasets.find(d=>d.label===label)
    if(!ds){ ds={label, ...cfg}; chart.data.datasets.push(ds) }
    return ds
  }
  const sy=chart.options.scales.y||{}; let yMin=Number.isFinite(sy.min)?sy.min:-3; let yMax=Number.isFinite(sy.max)?sy.max:3
  const guide=ensure(labels[0], { data:[], borderColor:COLOR_GUIDE, borderWidth:1, pointRadius:0 })
  guide.data=[{x, y:yMin},{x, y:yMax}]
  const fpt=ensure(labels[1], { data:[], borderColor:COLOR_FUNC, backgroundColor:COLOR_FUNC, showLine:false, pointRadius:4, pointHoverRadius:5 })
  fpt.data=[{x, y:fx}]
  const dpt=ensure(labels[2], { data:[], borderColor:COLOR_DER,  backgroundColor:COLOR_DER,  showLine:false, pointRadius:4, pointHoverRadius:5 })
  dpt.data=[{x, y:dx}]
}
function resetView(){
  if (!chart) return
  chart.options.scales.x.min = full.xMin
  chart.options.scales.x.max = full.xMax
  const [yMin,yMax]=getVisibleYRange(chart, full.xMin, full.xMax)
  setYRange(chart,yMin,yMax)
  // 清探针
  chart.data.datasets = chart.data.datasets.filter(ds => !['probe-guide','probe-f-point','probe-d-point'].includes(ds.label))
  chart.update()
}

// -------------- 导出 & 分享 --------------
async function exportFormula(){
  const el=document.getElementById('formula'); if(!el) return
  const canvas=await html2canvas(el,{ backgroundColor:'#fff', scale:1 })
  downloadCanvas(canvas, `${(item.value?.title||'formula')}.png`)
}
async function exportPlot(){
  const wrap=document.getElementById('plot')?.parentElement; if(!wrap) return
  const canvas=await html2canvas(wrap,{ backgroundColor:'#fff', scale:1 })
  downloadCanvas(canvas, `${(item.value?.title||'plot')}.png`)
}
async function exportCard(){
  const el=document.querySelector('.detail'); if(!el) return
  const canvas=await html2canvas(el,{ backgroundColor:'#fff', scale:1 })
  downloadCanvas(canvas, `${(item.value?.title||'card')}.png`)
}
function downloadCanvas(canvas, filename){
  const a=document.createElement('a'); a.download=filename; a.href=canvas.toDataURL('image/png'); a.click()
}
async function copyShareUrl(){
  const url=new URL(location.href)
  if (isTrig.value) { url.searchParams.set('A', String(p.value.A)); url.searchParams.set('w', String(p.value.w)); url.searchParams.set('phi', String(p.value.phi)) }
  if (x0.value!=null) url.searchParams.set('x0', String(x0.value))
  await navigator.clipboard.writeText(url.toString())
  alert('已复制链接（包含当前参数）')
}
function syncQuery(){
  // 同步当前参数到地址栏（可分享，可刷新保持）
  const q = new URLSearchParams()
  if (isTrig.value) { q.set('A', String(p.value.A)); q.set('w', String(p.value.w)); q.set('phi', String(p.value.phi)) }
  if (x0.value!=null && x0.value!=='') q.set('x0', String(x0.value))
  router.replace({ query: Object.fromEntries(q.entries()) })
}
function restoreFromQuery(){
  const q=route.query
  if (q.A)  p.value.A  = Number(q.A)
  if (q.w)  p.value.w  = Number(q.w)
  if (q.phi) p.value.phi = Number(q.phi)
  if (q.x0) x0.value = Number(q.x0)
}

// -------------- 生命周期 --------------
onMounted(async () => {
  restoreFromQuery()
  await renderPage()
})
watch(() => route.params.id, async () => {
  // 切换条目时重置
  p.value={A:1,w:1,phi:0}; x0.value=null; result.value=null
  if (chart) { chart.destroy(); chart=null }
  await renderPage()
})
onBeforeUnmount(() => { if (chart) chart.destroy() })
</script>

<style scoped>
.detail { padding: 12px; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; }
.back { text-decoration: none; color: #2563eb; }
.formula { font-size: 28px; margin: 8px 0 6px 0; }
.param-panel { margin: 8px 0 6px 0; background: #fbfcfe; border: 1px solid #e6eef6; border-radius: 8px; padding: 10px; }
.param-row { display: grid; grid-template-columns: 120px 1fr 100px; gap: 8px; align-items: center; margin-bottom: 8px; }
.param-row input[type="number"] { width: 100%; padding: 6px 8px; border: 1px solid #c9d6e2; border-radius: 6px; }
.param-actions { display: flex; justify-content: flex-end; }
.param-actions button { padding: 6px 10px; border-radius: 6px; border: 1px solid #bbb; background: #fff; cursor: pointer; }
.plot-wrap { margin-top: 8px; border: 1px dashed #ddd; border-radius: 8px; padding: 8px; background: #fafafa; display: inline-block; }
.plot-canvas { width: 500px; height: 300px; display: block; }
.plot-caption { margin-top: 6px; font-size: 12px; color: #666; display: flex; gap: 10px; align-items: center; }
.btn-link { margin-left: auto; font-size: 12px; color: #2563eb; background: transparent; border: none; cursor: pointer; text-decoration: underline; }
.calc { margin-top: 10px; background: #f7f9fb; border: 1px solid #e6eef6; border-radius: 8px; padding: 8px; }
.calc-row { display: flex; align-items: center; gap: 8px; }
.calc-row input { width: 160px; padding: 6px 8px; border: 1px solid #c9d6e2; border-radius: 6px; }
.calc-result { margin-top: 8px; font-size: 14px; color: #333; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; }
.calc-result .warn { grid-column: 1 / -1; color: #c0392b; font-size: 12px; }
.note { color: #666; font-size: 0.9em; margin-top: 8px; }
.btns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
button { padding: 6px 10px; border-radius: 6px; border: 1px solid #bbb; background: #fff; cursor: pointer; }
button:hover { background: #f2f2f2; }
</style>

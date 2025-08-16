<template>
  <div v-for="(item, index) in formulas" :key="index" class="formula-block" :id="'card-' + index">
    <h4>{{ item.title }}</h4>

    <!-- 公式 -->
    <div class="formula" :id="'formula-' + index"></div>

    <!-- 固定尺寸图表 -->
    <div v-if="item.plot" class="plot-wrap">
      <canvas
        :id="'plot-' + index"
        class="plot-canvas"
        width="500"
        height="300"
      ></canvas>
      <div class="plot-caption">
        <span>Function & Derivative</span>
        <span v-if="item.plot.type==='ln'"> (y = ln x, y' = 1/x)</span>
        <span v-else-if="item.plot.type==='sin'"> (y = sin x, y' = cos x)</span>
        <span v-else-if="item.plot.type==='cos'"> (y = cos x, y' = -sin x)</span>
        <button class="btn-link" @click="resetView(index)" title="恢复到全局范围">查看全局</button>
      </div>
    </div>

    <!-- 计算函数值 -->
    <div class="calc">
      <div class="calc-row">
        <label>输入 x₀：</label>
        <input
          type="number"
          v-model.number="probeInputs[index]"
          :step="item.plot?.type==='ln' ? '0.01' : '0.1'"
          :min="item.plot?.type==='ln' ? '0.0001' : undefined"
          placeholder="例如 1 / 10 / 999"
        />
        <button @click="doCompute(index)">计算</button>
      </div>
      <div class="calc-result" v-if="results[index]">
        <div>f(x₀) = {{ results[index].fx }}</div>
        <div>f′(x₀) = {{ results[index].dx }}</div>
        <div class="warn" v-if="results[index].warn">{{ results[index].warn }}</div>
      </div>
    </div>

    <p class="note">{{ item.note }}</p>

    <div class="btns">
      <button @click="exportFormula(index)">导出公式 PNG</button>
      <button v-if="item.plot" @click="exportPlot(index)">导出图像 PNG</button>
      <button v-if="item.plot" @click="exportCard(index)">导出整卡 PNG</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, onBeforeUnmount } from 'vue'
import katex from 'katex'
import html2canvas from 'html2canvas'
import formulas from './assets/derivative_formulas.json'

// Chart.js v4
import {
  Chart,
  LineController, LineElement, PointElement,
  LinearScale, Title, Tooltip, Legend
} from 'chart.js'

Chart.register(LineController, LineElement, PointElement, LinearScale, Title, Tooltip, Legend)

// 固定 DPR，防止“越画越大”
Chart.defaults.devicePixelRatio = 1

// 颜色
const COLOR_FUNC = '#007bff'   // 函数：蓝
const COLOR_DER  = '#dc3545'   // 导数：红
const COLOR_TAN  = '#6c757d'   // 切线：灰
const COLOR_GUIDE= '#999999'   // 辅助线：灰

// 图表实例 & 当前“全局范围”缓存（会被动态扩展）
const charts = new Map()
const fullRanges = new Map() // index -> {xMin, xMax}

// 计算输入与结果
const probeInputs = ref(formulas.map(() => null))
const results = ref(formulas.map(() => null))

const renderAll = async () => {
  await nextTick()

  // KaTeX
  formulas.forEach((item, index) => {
    const el = document.getElementById(`formula-${index}`)
    if (el) {
      katex.render(item.latex, el, { throwOnError: false, displayMode: true })
    }
  })

  // 初次绘图（按 JSON 初始范围）
  formulas.forEach((item, index) => {
    if (item.plot) makePlot(item, index, item.plot.xMin ?? -6, item.plot.xMax ?? 6)
  })
}

onMounted(() => {
  renderAll()
})

onBeforeUnmount(() => {
  charts.forEach(ch => ch.destroy())
  charts.clear()
  fullRanges.clear()
})

/** 返回函数与导数 */
function getFuncs(type) {
  switch (type) {
    case 'ln':
      return {
        f: x => Math.log(x),
        d: x => 1 / x,
        names: { f: 'ln x', d: '1/x' }
      }
    case 'sin':
      return {
        f: x => Math.sin(x),
        d: x => Math.cos(x),
        names: { f: 'sin x', d: 'cos x' }
      }
    case 'cos':
      return {
        f: x => Math.cos(x),
        d: x => -Math.sin(x),
        names: { f: 'cos x', d: '-sin x' }
      }
    default:
      return {
        f: x => x,
        d: x => 1,
        names: { f: 'f(x)', d: "f'(x)" }
      }
  }
}

/** 采样数据（给定范围） */
function buildData(type, xMin, xMax, N = 500) {
  const { f, d } = getFuncs(type)
  const xs = Array.from({ length: N }, (_, i) => xMin + (xMax - xMin) * (i / (N - 1)))
  const dataF = []
  const dataD = []
  for (const x of xs) {
    if (type === 'ln' && x <= 0) {
      dataF.push({ x, y: null })
      dataD.push({ x, y: null })
    } else {
      dataF.push({ x, y: f(x) })
      dataD.push({ x, y: d(x) })
    }
  }
  return { xs, dataF, dataD }
}

/** 创建/重建图表（覆盖当前全局范围） */
function makePlot(item, index, xMin, xMax) {
  const cvs = document.getElementById(`plot-${index}`)
  if (!cvs) return

  // 固定 CSS 尺寸
  cvs.style.width = '500px'
  cvs.style.height = '300px'

  // 清理旧图
  if (charts.has(index)) {
    charts.get(index).destroy()
    charts.delete(index)
  }

  // 采样
  const type = item.plot?.type
  const { xs, dataF, dataD } = buildData(type, xMin, xMax)
  const { names } = getFuncs(type)

  // 切线（仅 ln）
  const tangentDatasets = []
  const tangentAt = item.plot?.tangentAt ?? []
  if (type === 'ln' && Array.isArray(tangentAt)) {
    for (const x0 of tangentAt) {
      if (!(x0 > 0)) continue
      const y0 = Math.log(x0)
      const slope = 1 / x0
      const line = xs.map(x => ({ x, y: y0 + slope * (x - x0) }))
      tangentDatasets.push({
        label: `Tangent @ x=${x0} (slope=${slope.toFixed(3)})`,
        data: line,
        borderWidth: 1,
        borderDash: [6, 4],
        pointRadius: 0,
        borderColor: COLOR_TAN
      })
    }
  }

  const ctx = cvs.getContext('2d')
  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        { label: names.f, data: dataF, borderWidth: 2, pointRadius: 0, borderColor: COLOR_FUNC },
        { label: names.d, data: dataD, borderWidth: 2, pointRadius: 0, borderColor: COLOR_DER },
        ...tangentDatasets
      ]
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      parsing: false,
      animation: false,
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'x' },
          min: xMin,
          max: xMax,
          ticks: { maxTicksLimit: 10 }
        },
        y: { type: 'linear', title: { display: true, text: 'y' } }
      },
      plugins: {
        title: { display: true, text: 'Function vs Derivative' },
        legend: { display: true },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const dsLabel = ctx.dataset.label || ''
              const x = ctx.parsed.x
              const y = ctx.parsed.y
              return `${dsLabel}: (${x.toFixed(3)}, ${y?.toFixed(3)})`
            }
          }
        }
      },
      elements: { line: { tension: 0 } }
    }
  })

  charts.set(index, chart)
  fullRanges.set(index, { xMin, xMax })

  // 初始化全局 y
  const [yMin, yMax] = getVisibleYRange(chart, xMin, xMax)
  setYRange(chart, yMin, yMax)
  chart.update()
}

/** 根据窗口内可见数据获取 y 范围 */
function getVisibleYRange(chart, xMin, xMax) {
  const ys = []
  chart.data.datasets.forEach(ds => {
    (ds.data || []).forEach(p => {
      if (!p) return
      const { x, y } = p
      if (Number.isFinite(x) && Number.isFinite(y) && x >= xMin && x <= xMax) ys.push(y)
    })
  })
  if (ys.length === 0) return [-3, 3]
  let minY = Math.min(...ys)
  let maxY = Math.max(...ys)
  if (!(maxY > minY)) { minY -= 1; maxY += 1 }
  return [minY, maxY]
}

/** 设置 y 轴并加边距 */
function setYRange(chart, yMin, yMax) {
  const pad = Math.max((yMax - yMin) * 0.12, 0.5)
  chart.options.scales.y.min = yMin - pad
  chart.options.scales.y.max = yMax + pad
}

/** 确保数据覆盖目标窗口；若不覆盖则重采样并扩展全局 */
function ensureCoverage(index, item, wantMin, wantMax) {
  const range = fullRanges.get(index)
  if (!range) return
  let { xMin, xMax } = range
  let needExpand = false
  if (wantMin < xMin) { xMin = wantMin; needExpand = true }
  if (wantMax > xMax) { xMax = wantMax; needExpand = true }
  if (needExpand) {
    // 重新构建整张图的数据（不会影响尺寸/导出）
    makePlot(item, index, xMin, xMax)
  }
}

/** 计算 & 局部放大 */
function doCompute(index) {
  const item = formulas[index]
  const x0 = Number(probeInputs.value[index])

  if (Number.isNaN(x0)) {
    results.value[index] = { fx: '-', dx: '-', warn: '请输入一个有效的数字 x₀' }
    return
  }

  const type = item.plot?.type
  const { f, d } = getFuncs(type)
  let fx, dx, warn = ''

  if (type === 'ln') {
    if (!(x0 > 0)) {
      results.value[index] = { fx: '-', dx: '-', warn: 'ln(x) 需 x>0' }
      clearProbe(index)
      return
    }
  }

  fx = f(x0)
  dx = d(x0)
  results.value[index] = { fx: formatNum(fx), dx: formatNum(dx), warn }

  // —— 目标局部窗口（先计算想要的） —— //
  const full = fullRanges.get(index)
  if (!full) return
  let wantMin, wantMax
  if (type === 'ln') {
    const eps = 1e-6
    wantMin = Math.max(x0 / 2, eps)
    wantMax = Math.max(2 * x0, wantMin + eps)
  } else {
    const W = Math.PI
    wantMin = x0 - W
    wantMax = x0 + W
  }

  // —— 确保有数据覆盖该窗口：如需则动态扩展并重采样 —— //
  ensureCoverage(index, item, wantMin, wantMax)

  // 现在开展缩放 & 探针绘制
  zoomToNeighborhood(index, item, x0, fx, dx, wantMin, wantMax)
}

/** 缩放到局部，并让 y 轴围绕可见数据+探针值联动 */
function zoomToNeighborhood(index, item, x0, fx, dx, wantMin, wantMax) {
  const chart = charts.get(index)
  const full = fullRanges.get(index)
  if (!chart || !full) return

  // 实际应用的窗口：夹到最新全局
  let xMin = Math.max(wantMin, full.xMin)
  let xMax = Math.min(wantMax, full.xMax)

  // 兜底：防止 xMin >= xMax
  if (!(xMax > xMin)) {
    // 使用全局最后 10% 作为窗口
    const span = full.xMax - full.xMin
    xMin = full.xMax - Math.max(0.1 * span, 1e-3)
    xMax = full.xMax
  }

  chart.options.scales.x.min = xMin
  chart.options.scales.x.max = xMax

  // y 范围：可见数据 + {fx,dx} 兜底
  let [yMin, yMax] = getVisibleYRange(chart, xMin, xMax)
  const extra = [fx, dx].filter(Number.isFinite)
  if (extra.length) {
    yMin = Math.min(yMin, ...extra)
    yMax = Math.max(yMax, ...extra)
  }
  if (!(yMax > yMin)) { yMin -= 1; yMax += 1 }
  setYRange(chart, yMin, yMax)

  // 探针：垂直线 + 两点
  addOrUpdateProbe(index, x0, fx, dx)
  chart.update()
}

/** 探针：垂直线 + f 点 + f' 点 */
function addOrUpdateProbe(index, x0, fx, dx) {
  const chart = charts.get(index)
  if (!chart) return

  const KEY_GUIDE = 'probe-guide'
  const KEY_FPT   = 'probe-f-point'
  const KEY_DPT   = 'probe-d-point'

  const ensureDs = (label, config) => {
    let ds = chart.data.datasets.find(d => d.label === label)
    if (!ds) { ds = { label, ...config }; chart.data.datasets.push(ds) }
    return ds
  }

  // 用当前 y 轴范围绘制垂直线高度
  const sy = chart.options.scales.y || {}
  let yMin = Number.isFinite(sy.min) ? sy.min : -3
  let yMax = Number.isFinite(sy.max) ? sy.max : 3
  if (!(yMax > yMin)) { yMin -= 1; yMax += 1 }

  const guide = ensureDs(KEY_GUIDE, {
    data: [],
    borderColor: COLOR_GUIDE,
    borderWidth: 1,
    pointRadius: 0
  })
  guide.data = [{ x: x0, y: yMin }, { x: x0, y: yMax }]

  const fpt = ensureDs(KEY_FPT, {
    data: [],
    borderColor: COLOR_FUNC,
    backgroundColor: COLOR_FUNC,
    showLine: false,
    pointRadius: 4,
    pointHoverRadius: 5
  })
  fpt.data = [{ x: x0, y: fx }]

  const dpt = ensureDs(KEY_DPT, {
    data: [],
    borderColor: COLOR_DER,
    backgroundColor: COLOR_DER,
    showLine: false,
    pointRadius: 4,
    pointHoverRadius: 5
  })
  dpt.data = [{ x: x0, y: dx }]
}

function clearProbe(index) {
  const chart = charts.get(index)
  if (!chart) return
  chart.data.datasets = chart.data.datasets.filter(ds =>
    !['probe-guide', 'probe-f-point', 'probe-d-point'].includes(ds.label)
  )
  chart.update()
}

/** 恢复全局视图 */
function resetView(index) {
  const chart = charts.get(index)
  const full = fullRanges.get(index)
  if (!chart || !full) return
  chart.options.scales.x.min = full.xMin
  chart.options.scales.x.max = full.xMax
  const [yMin, yMax] = getVisibleYRange(chart, full.xMin, full.xMax)
  setYRange(chart, yMin, yMax)
  clearProbe(index)
  chart.update()
}

/** 数字格式化 */
function formatNum(v) {
  if (!Number.isFinite(v)) return String(v)
  const abs = Math.abs(v)
  if (abs !== 0 && (abs < 1e-4 || abs > 1e6)) return v.toExponential(4)
  return v.toFixed(6).replace(/\.?0+$/, '')
}

/** 导出 */
const exportFormula = async (index) => {
  const el = document.getElementById(`formula-${index}`)
  if (!el) return
  const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 1 })
  downloadCanvas(canvas, `formula-${index + 1}.png`)
}
const exportPlot = async (index) => {
  const wrap = document.getElementById(`plot-${index}`)?.parentElement
  if (!wrap) return
  const canvas = await html2canvas(wrap, { backgroundColor: '#ffffff', scale: 1 })
  downloadCanvas(canvas, `plot-${index + 1}.png`)
}
const exportCard = async (index) => {
  const el = document.getElementById(`card-${index}`)
  if (!el) return
  const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 1 })
  downloadCanvas(canvas, `card-${index + 1}.png`)
}
function downloadCanvas(canvas, filename) {
  const link = document.createElement('a')
  link.download = filename
  link.href = canvas.toDataURL('image/png')
  link.click()
}
</script>

<style scoped>
.formula-block {
  padding: 12px;
  margin-bottom: 16px;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 10px;
}
.formula { font-size: 28px; margin: 8px 0 6px 0; }
.plot-wrap {
  margin-top: 8px;
  border: 1px dashed #ddd;
  border-radius: 8px;
  padding: 8px;
  background: #fafafa;
  display: inline-block;
}
.plot-canvas { width: 500px; height: 300px; display: block; }
.plot-caption {
  margin-top: 6px;
  font-size: 12px; color: #666;
  display: flex; gap: 10px; align-items: center;
}
.btn-link {
  margin-left: auto; font-size: 12px;
  color: #2563eb; background: transparent; border: none; cursor: pointer;
  text-decoration: underline;
}
.btn-link:hover { color: #1d4ed8; }

.calc {
  margin-top: 10px; background: #f7f9fb;
  border: 1px solid #e6eef6; border-radius: 8px; padding: 8px;
}
.calc-row { display: flex; align-items: center; gap: 8px; }
.calc-row input {
  width: 160px; padding: 6px 8px;
  border: 1px solid #c9d6e2; border-radius: 6px;
}
.calc-row button {
  padding: 6px 10px; border-radius: 6px;
  border: 1px solid #bbb; background: #fff; cursor: pointer;
}
.calc-row button:hover { background: #f2f2f2; }
.calc-result {
  margin-top: 8px; font-size: 14px; color: #333;
  display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px;
}
.calc-result .warn { grid-column: 1 / -1; color: #c0392b; font-size: 12px; }
.note { color: #666; font-size: 0.9em; margin-top: 8px; }
.btns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
button {
  padding: 6px 10px; border-radius: 6px;
  border: 1px solid #bbb; background: #fff; cursor: pointer;
}
button:hover { background: #f2f2f2; }
</style>

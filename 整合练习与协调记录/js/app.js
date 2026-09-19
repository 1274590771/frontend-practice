// 数据与交互模块
// 一份 data/weather.json 同时驱动首页概览、城市明细、图表（charts.js）与三维地球（globe.js）。
// 下游视图一律只读 state，不在各自文件里重新取数，否则同一屏上的数字很容易对不上。

// 时段只做不跨年的连续区间，避免「冬季跨年」把月份顺序打乱后图表横轴含义不清
const PERIODS = [
  { id: 'all', label: '全年（1-12月）', months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { id: 'h1', label: '上半年（1-6月）', months: [0, 1, 2, 3, 4, 5] },
  { id: 'h2', label: '下半年（7-12月）', months: [6, 7, 8, 9, 10, 11] }
];

const state = { data: null, city: 'all', period: 'all' };

// 订阅式联动：charts.js 加载后注册自己的渲染函数，app.js 不关心有几个下游视图
const stateListeners = [];
const onStateChange = (fn) => stateListeners.push(fn);
const emitState = () => stateListeners.forEach((fn) => fn(state));

const $ = (sel) => document.querySelector(sel);

const currentPeriod = () => PERIODS.find((p) => p.id === state.period);
const allCities = () => state.data.metrics.rainfall.series.map((s) => s.category);
const visibleCities = () =>
  state.city === 'all' ? allCities() : allCities().filter((c) => c === state.city);

// 取某城市在某指标下、按当前时段截取的数值数组
const sliceMetric = (metricKey, city) => {
  const row = state.data.metrics[metricKey].series.find((s) => s.category === city);
  if (!row) return [];
  return currentPeriod().months.map((i) => row.counts[i]);
};

const sumOf = (metricKey, city) => sliceMetric(metricKey, city).reduce((a, b) => a + b, 0);
const avgOf = (metricKey, city) => {
  const values = sliceMetric(metricKey, city);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
};
const round1 = (n) => Math.round(n * 10) / 10;

// ── 首页概览：四张卡片随筛选实时变化 ──
const renderSummary = () => {
  const cities = visibleCities();
  const box = $('#summary-cards');
  if (cities.length === 0) {
    box.innerHTML = '';
    return;
  }
  const rainTotal = cities.reduce((sum, c) => sum + sumOf('rainfall', c), 0);
  const tempAvg = cities.reduce((sum, c) => sum + avgOf('temperature', c), 0) / cities.length;
  const wettest = cities.reduce(
    (best, c) => (sumOf('rainfall', c) > sumOf('rainfall', best) ? c : best),
    cities[0]
  );
  const warmest = cities.reduce(
    (best, c) => (avgOf('temperature', c) > avgOf('temperature', best) ? c : best),
    cities[0]
  );
  const cards = [
    { label: '纳入城市', value: cities.length, note: currentPeriod().label },
    { label: '降水合计', value: rainTotal, unit: 'mm', note: '筛选范围内累计' },
    { label: '平均气温', value: round1(tempAvg), unit: '℃', note: '筛选范围内平均' },
    { label: '降水最多', value: wettest, note: sumOf('rainfall', wettest) + ' mm' },
    { label: '气温最高', value: warmest, note: round1(avgOf('temperature', warmest)) + ' ℃' }
  ];
  box.innerHTML = cards
    .map(
      (c) => `
      <div class="col-6 col-lg">
        <div class="card summary-card h-100">
          <div class="card-body">
            <h3 class="card-title h6 mb-2">${c.label}</h3>
            <p class="card-value">${c.value}${c.unit ? `<span class="fs-6 fw-normal text-muted ms-1">${c.unit}</span>` : ''}</p>
            <p class="card-text small text-muted mb-0">${c.note}</p>
          </div>
        </div>
      </div>`
    )
    .join('');
};

// ── 城市明细卡片 ──
const renderCityList = () => {
  const cities = visibleCities();
  const box = $('#city-list');
  if (cities.length === 0) {
    box.innerHTML = '<div class="col-12"><p class="text-muted mb-0">没有符合当前筛选条件的城市</p></div>';
    return;
  }
  box.innerHTML = cities
    .map((city) => {
      const coord = state.data.cities.find((c) => c.name === city) || {};
      return `
      <div class="col-12 col-sm-6 col-lg-3">
        <div class="card city-card h-100" data-city="${city}">
          <div class="card-body">
            <h3 class="card-title h6 mb-1">${city}</h3>
            <p class="card-text small text-muted mb-2">${coord.lat}°N / ${coord.lon}°E</p>
            <p class="card-text mb-1">
              <span class="fs-5 fw-semibold">${sumOf('rainfall', city)}</span>
              <span class="text-muted small"> mm 时段降水合计</span>
            </p>
            <p class="card-text mb-0">
              <span class="fs-5 fw-semibold">${round1(avgOf('temperature', city))}</span>
              <span class="text-muted small"> ℃ 时段平均气温</span>
            </p>
          </div>
        </div>
      </div>`;
    })
    .join('');
};

// ── 查询条件：城市按钮组（课堂五的筛选模式）+ 时段下拉 ──
const renderCityFilter = () => {
  const options = ['all'].concat(allCities());
  $('#city-filter').innerHTML = options
    .map(
      (c) => `<button type="button" class="btn btn-sm btn-outline-primary ${
        c === state.city ? 'active' : ''
      }" data-city="${c}">${c === 'all' ? '全部城市' : c}</button>`
    )
    .join('');
};

const renderPeriodFilter = () => {
  $('#period-filter').innerHTML = PERIODS.map(
    (p) => `<option value="${p.id}">${p.label}</option>`
  ).join('');
};

// 三维页是独立页面，筛选状态靠 URL 带过去，避免两个页面各存一份状态
const syncGlobeLink = () => {
  $('#globe-link').href = `three-d/globe.html?city=${encodeURIComponent(
    state.city
  )}&period=${state.period}`;
};

const renderAll = () => {
  renderSummary();
  renderCityList();
  syncGlobeLink();
  emitState();
};

const bindEvents = () => {
  $('#city-filter').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-city]');
    if (!btn) return;
    state.city = btn.dataset.city;
    renderCityFilter();
    renderAll();
  });
  $('#period-filter').addEventListener('change', (e) => {
    state.period = e.target.value;
    renderAll();
  });
};

// ── 加载：加载中 / 空数据 / HTTP 非 2xx / 网络异常 四条分支 ──
const loadData = async () => {
  const demo = new URLSearchParams(location.search).get('demo');
  const statusEl = $('#status');
  statusEl.textContent = '加载中...';
  statusEl.style.display = 'block';
  try {
    // 演示开关：?demo=error 模拟服务端 500，?demo=slow 延迟 3 秒，?demo=empty 模拟空数据集
    if (demo === 'error') {
      throw new Error('HTTP 500');
    }
    if (demo === 'slow') {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    const response = await fetch('data/weather.json');
    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }
    const data = await response.json();
    if (demo === 'empty') {
      data.cities = [];
      data.metrics.rainfall.series = [];
      data.metrics.temperature.series = [];
    }
    if (data.metrics.rainfall.series.length === 0) {
      statusEl.textContent = '暂无数据';
      return;
    }
    state.data = data;
    $('#sub-title').textContent = data.title + ' · 数据来源：' + data.source;
    statusEl.style.display = 'none';
    renderCityFilter();
    renderAll();
  } catch (error) {
    statusEl.textContent = '加载失败：' + error.message;
  }
};

renderPeriodFilter();
bindEvents();
loadData();

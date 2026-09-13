// app.js
const state = { data: null, selected: 'all' };
let barChart = null;
let lineChart = null;

const visibleSeries = (metric) => state.selected === 'all'
  ? metric.series
  : metric.series.filter(s => s.category === state.selected);

const loadData = async () => {
  const demo = new URLSearchParams(location.search).get('demo');
  $('#status').text('加载中...').show();
  try {
    // 演示用：?demo=error 模拟服务端 500
    if (demo === 'error') {
      throw new Error('HTTP 500');
    }
    // 演示用：?demo=slow 延迟 3 秒，便于看到「加载中」
    if (demo === 'slow') {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    const response = await fetch('data/weather.json');
    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }
    const data = await response.json();
    // 演示用：?demo=empty 模拟服务端返回空数据
    if (demo === 'empty') {
      data.metrics.rainfall.series = [];
      data.metrics.temperature.series = [];
    }
    if (data.metrics.rainfall.series.length === 0) {
      $('#status').text('暂无数据').show();
      return;
    }
    state.data = data;
    $('#sub-title').text(data.title + ' · 数据来源：' + data.source);
    $('#status').hide();
    renderCards(data);
    renderBarChart(data);
    renderLineChart(data);
    renderCityFilter(data);
  } catch (error) {
    $('#status').text('加载失败：' + error.message).show();
  }
};

const renderCards = (data) => {
  const months = data.months.length;
  const temperature = data.metrics.temperature.series;
  const cards = data.metrics.rainfall.series.map(s => {
    const yearRain = s.counts.reduce((sum, n) => sum + n, 0);
    const city = temperature.find(t => t.category === s.category);
    const avgTemp = (city.counts.reduce((sum, n) => sum + n, 0) / months).toFixed(1);
    return `
      <div class="col-12 col-sm-6 col-lg-3">
        <div class="card city-card h-100" data-city="${s.category}">
          <div class="card-body">
            <h3 class="card-title h6">${s.category}</h3>
            <p class="card-text fs-4 mb-1">${yearRain} mm</p>
            <p class="card-text small text-muted mb-1">年降水量（${months}个月累计）</p>
            <p class="card-text small text-muted mb-0">年平均气温 ${avgTemp} ℃</p>
          </div>
        </div>
      </div>
    `;
  }).join('');
  $('#cards').html(cards);
};

const renderBarChart = (data) => {
  const metric = data.metrics.rainfall;
  if (barChart === null) {
    barChart = echarts.init(document.querySelector('#bar-chart'));
  }
  barChart.setOption({
    title: {
      text: metric.label + '对比（单位：' + metric.unit + '）',
      subtext: '数据来源：' + data.source,
      left: 'center'
    },
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    grid: { top: 70, bottom: 50, left: 60, right: 30 },
    xAxis: { type: 'category', data: data.months },
    yAxis: { type: 'value', name: metric.unit },
    series: visibleSeries(metric).map(s => ({
      name: s.category,
      type: 'bar',
      data: s.counts
    }))
    // 第二参数 true = 不合并旧配置，后续筛选城市时才能替换掉原系列
  }, true);
};

const renderLineChart = (data) => {
  const metric = data.metrics.temperature;
  if (lineChart !== null) {
    lineChart.destroy();
  }
  lineChart = new Chart(document.querySelector('#line-chart'), {
    type: 'line',
    data: {
      labels: data.months,
      datasets: visibleSeries(metric).map(s => ({
        label: s.category,
        data: s.counts,
        borderWidth: 2,
        tension: 0.3
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: metric.label + '趋势（单位：' + metric.unit + '）'
        },
        subtitle: {
          display: true,
          text: '数据来源：' + data.source
        }
      }
    }
  });
};

const renderCityFilter = (data) => {
  const cities = data.metrics.rainfall.series.map(s => s.category);
  const buttons = ['<button type="button" class="btn btn-outline-primary active" data-city="all">全部城市</button>']
    .concat(cities.map(c => '<button type="button" class="btn btn-outline-primary" data-city="' + c + '">' + c + '</button>'))
    .join('');
  $('#city-filter').html(buttons);

  $('#city-filter').on('click', 'button', function () {
    state.selected = $(this).data('city');
    $('#city-filter button').removeClass('active');
    $(this).addClass('active');
    $('#cards .city-card').removeClass('is-active');
    if (state.selected !== 'all') {
      $('#cards .city-card[data-city="' + state.selected + '"]').addClass('is-active');
    }
    renderBarChart(state.data);
    renderLineChart(state.data);
  });
};

window.addEventListener('resize', () => {
  if (barChart) barChart.resize();
});

loadData();

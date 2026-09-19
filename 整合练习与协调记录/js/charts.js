// 可视化模块
// 复用课堂六的两种图表：柱状图（ECharts）比各月降水量，折线图（Chart.js）看气温走势。
// 两张图都订阅 app.js 的 state 变化，切换城市或时段后跟着重画，不自己保存筛选状态。

let barChart = null;
let lineChart = null;

// 图表横轴只显示当前时段包含的月份
const periodMonths = () => currentPeriod().months.map((i) => state.data.months[i]);

const renderBarChart = () => {
  const metric = state.data.metrics.rainfall;
  if (barChart === null) {
    barChart = echarts.init($('#bar-chart'));
  }
  barChart.setOption(
    {
      title: {
        text: metric.label + '对比（单位：' + metric.unit + '）',
        subtext: '当前时段：' + currentPeriod().label + ' · 数据来源：' + state.data.source,
        left: 'center'
      },
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      grid: { top: 90, bottom: 60, left: 60, right: 30 },
      xAxis: { type: 'category', data: periodMonths() },
      yAxis: { type: 'value', name: metric.unit },
      series: visibleCities().map((city) => ({
        name: city,
        type: 'bar',
        data: sliceMetric('rainfall', city)
      }))
    },
    // 第二个参数 true = 不合并旧配置，切换筛选时才能把上一批系列整个换掉
    true
  );
};

const renderLineChart = () => {
  const metric = state.data.metrics.temperature;
  if (lineChart !== null) {
    lineChart.destroy();
  }
  lineChart = new Chart($('#line-chart'), {
    type: 'line',
    data: {
      labels: periodMonths(),
      datasets: visibleCities().map((city) => ({
        label: city,
        data: sliceMetric('temperature', city),
        borderWidth: 2,
        tension: 0.3
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      // 标题与副标题占满整行时会被纵向刻度压住，缩小字号并单独留出内边距
      plugins: {
        title: {
          display: true,
          text: metric.label + '趋势（单位：' + metric.unit + '）',
          font: { size: 13 },
          padding: { top: 2, bottom: 2 }
        },
        subtitle: {
          display: true,
          text: '当前时段：' + currentPeriod().label + ' · 数据来源：' + state.data.source,
          font: { size: 10 },
          padding: { bottom: 10 }
        },
        legend: { position: 'bottom' }
      }
    }
  });
};

// 注册到 app.js 的下游视图，筛选变化时由 app.js 统一触发
onStateChange(() => {
  if (!state.data) return;
  renderBarChart();
  renderLineChart();
});

window.addEventListener('resize', () => {
  if (barChart) barChart.resize();
});

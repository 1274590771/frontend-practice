// app.js
const state = { data: null };

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

loadData();

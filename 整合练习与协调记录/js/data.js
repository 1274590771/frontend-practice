// 共享数据层
// 首页（js/app.js）和三维页（js/globe.js）跑在两个不同的文档里，
// 时段定义和聚合口径（降水求和、气温求平均）必须完全一致，
// 所以集中放在这里，两个页面都引这一份，避免同一天的天气数字在两页对不上。

const PERIODS = [
  { id: 'all', label: '全年（1-12月）', months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { id: 'h1', label: '上半年（1-6月）', months: [0, 1, 2, 3, 4, 5] },
  { id: 'h2', label: '下半年（7-12月）', months: [6, 7, 8, 9, 10, 11] }
];

const periodById = (id) => PERIODS.find((p) => p.id === id) || PERIODS[0];

// 两个页面目录层级不同，路径由调用方传入
const loadWeather = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('HTTP ' + response.status);
  }
  return response.json();
};

const sumRange = (counts, months) => months.reduce((sum, i) => sum + counts[i], 0);
const avgRange = (counts, months) =>
  months.length ? sumRange(counts, months) / months.length : 0;

const round1 = (n) => Math.round(n * 10) / 10;

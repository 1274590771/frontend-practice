// 质量清单自查：三档宽度、断网、空数据、Console，外加模块间数据一致性核对
// 运行（本机已缓存 chromium-1228，用 PW_CHROME 指定可执行文件避免重复下载）：
//   python -m http.server 8900 --bind 127.0.0.1
//   PW_CHROME=<chrome.exe> NODE_PATH=<playwright> node docs/self-check/capture.cjs
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.BASE || 'http://127.0.0.1:8900';
const OUT = __dirname;

const widths = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'tablet-768', width: 768, height: 900 },
  { name: 'mobile-375', width: 375, height: 812 }
];

const report = { console: [], pageErrors: [], failedRequests: [], httpErrors: [], checks: [] };

const watch = (page, tag) => {
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      report.console.push(`[${tag}] ${m.type()}: ${m.text()}`);
    }
  });
  page.on('pageerror', (e) => report.pageErrors.push(`[${tag}] ${e.message}`));
  page.on('requestfailed', (r) =>
    report.failedRequests.push(`[${tag}] ${r.url()} :: ${r.failure() && r.failure().errorText}`)
  );
  page.on('response', (r) => {
    if (r.status() >= 400) report.httpErrors.push(`[${tag}] HTTP ${r.status()} ${r.url()}`);
  });
};

const readSummary = (page) =>
  page.$$eval('#summary-cards .summary-card', (cards) =>
    cards.map((c) => ({
      label: c.querySelector('.card-title').textContent.trim(),
      value: c.querySelector('.card-value').textContent.trim()
    }))
  );

(async () => {
  const browser = await chromium.launch(
    process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}
  );

  // ── 自查一：三档宽度 ──
  for (const w of widths) {
    const context = await browser.newContext({ viewport: { width: w.width, height: w.height } });
    const page = await context.newPage();
    watch(page, w.name);
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, `width-${w.name}.png`), fullPage: true });

    const navDir = await page.evaluate(
      () => getComputedStyle(document.querySelector('.navbar-nav')).flexDirection
    );
    const cardsPerRow = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#summary-cards .summary-card')];
      return new Set(cards.map((c) => Math.round(c.getBoundingClientRect().top))).size;
    });
    report.checks.push(`[宽度] ${w.width}px：导航 flex-direction=${navDir}，概览卡片占 ${cardsPerRow} 行`);
    await context.close();
  }

  // ── 四模块贯通 + 图表 + Console（桌面）──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    watch(page, 'index-1440');
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);

    // 导航四入口
    for (const [text, expect] of [['首页', '#home'], ['城市查询', '#query'], ['数据看板', '#board']]) {
      await page.click(`.navbar-nav a:has-text("${text}")`);
      await page.waitForTimeout(300);
      const hash = await page.evaluate(() => location.hash);
      report.checks.push(`[导航] 「${text}」-> ${hash} ${hash === expect ? 'OK' : 'FAIL'}`);
    }

    const allCards = await readSummary(page);
    report.checks.push(`[首页概览·全部城市·全年] ${JSON.stringify(allCards)}`);

    // 图表三要素
    const bar = await page.evaluate(() => {
      const inst = echarts.getInstanceByDom(document.querySelector('#bar-chart'));
      const o = inst.getOption();
      return { title: o.title[0].text, sub: o.title[0].subtext, yUnit: o.yAxis[0].name, series: o.series.map((s) => s.name) };
    });
    report.checks.push(`[柱状图] 标题=${bar.title}｜纵轴=${bar.yUnit}｜系列=${bar.series.join('/')}`);
    report.checks.push(`[柱状图] 副标题=${bar.sub}`);
    const line = await page.evaluate(() => {
      const c = Chart.getChart(document.querySelector('#line-chart'));
      return { title: c.options.plugins.title.text, sub: c.options.plugins.subtitle.text };
    });
    report.checks.push(`[折线图] 标题=${line.title}｜副标题=${line.sub}`);

    // 筛选联动：广州 + 上半年，三处应当一致
    await page.click('#city-filter button[data-city="广州"]');
    await page.selectOption('#period-filter', 'h1');
    await page.waitForTimeout(600);
    const gzCards = await readSummary(page);
    report.checks.push(`[筛选·广州·上半年] 概览卡片 ${JSON.stringify(gzCards)}`);
    const detail = (await page.textContent('#city-list .city-card')).replace(/\s+/g, ' ').trim();
    report.checks.push(`[筛选·广州·上半年] 明细卡片 ${detail}`);
    const barGz = await page.evaluate(() => {
      const o = echarts.getInstanceByDom(document.querySelector('#bar-chart')).getOption();
      return { x: o.xAxis[0].data, series: o.series.map((s) => s.name), data: o.series[0].data };
    });
    report.checks.push(`[筛选·广州·上半年] 柱状图 ${JSON.stringify(barGz)}`);
    const globeHref = await page.getAttribute('#globe-link', 'href');
    report.checks.push(`[贯通] 三维链接 ${decodeURIComponent(globeHref)}`);
    await page.screenshot({ path: path.join(OUT, 'filter-linked.png'), fullPage: true });

    // 与源数据独立核算（用源 JSON 自算一遍，避免自证）
    const expected = await page.evaluate(async () => {
      const raw = await (await fetch('data/weather.json')).json();
      const months = [0, 1, 2, 3, 4, 5];
      const rain = raw.metrics.rainfall.series.find((s) => s.category === '广州').counts;
      const temp = raw.metrics.temperature.series.find((s) => s.category === '广州').counts;
      const rainSum = months.reduce((a, i) => a + rain[i], 0);
      const tempAvg = months.reduce((a, i) => a + temp[i], 0) / months.length;
      return { rainSum, tempAvg: Math.round(tempAvg * 10) / 10 };
    });
    report.checks.push(`[核对] 源数据自算 广州上半年 = 降水 ${expected.rainSum}mm / 均温 ${expected.tempAvg}℃`);
    await context.close();
  }

  // ── 自查二：断网 ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => report.pageErrors.push(`[offline] ${e.message}`));
    await page.route('**/data/weather.json', (r) => r.abort('internetdisconnected'));
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
    const text = (await page.textContent('#status')).trim();
    report.checks.push(`[断网] #status 可见=${await page.isVisible('#status')}｜文案=${text}`);
    await page.screenshot({ path: path.join(OUT, 'offline.png'), fullPage: true });
    await context.close();
  }

  // ── 自查三：空数据 ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    watch(page, 'empty');
    await page.goto(`${BASE}/index.html?demo=empty`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);
    const text = (await page.textContent('#status')).trim();
    const cards = (await page.$$('#summary-cards .summary-card')).length;
    report.checks.push(`[空数据] #status 可见=${await page.isVisible('#status')}｜文案=${text}｜概览卡片数=${cards}`);
    await page.screenshot({ path: path.join(OUT, 'empty.png'), fullPage: true });
    await context.close();
  }

  // ── 自查四：三维页（Console + 两档宽度 + 数据衔接）──
  for (const w of [widths[0], widths[2]]) {
    const context = await browser.newContext({ viewport: { width: w.width, height: w.height } });
    const page = await context.newPage();
    watch(page, `globe-${w.width}`);
    await page.goto(`${BASE}/three-d/globe.html?city=${encodeURIComponent('广州')}&period=h1`, {
      waitUntil: 'networkidle'
    });
    await page.waitForTimeout(2600);
    const hud = (await page.textContent('#globe-period')).trim();
    const canvas = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return c ? `${c.width}x${c.height}` : '未渲染';
    });
    // 柱高排序应与同期降水排序一致（期望值从源数据现算，不写死）
    const { bars, expected } = await page.evaluate(async () => {
      const heights = [];
      globeGroup.children.forEach((o) => {
        if (o.geometry && o.geometry.type === 'CylinderGeometry') {
          heights.push(Math.round(o.geometry.parameters.height * 1000) / 1000);
        }
      });
      const raw = await (await fetch('../data/weather.json')).json();
      const months = periodById(new URLSearchParams(location.search).get('period') || 'all').months;
      const ranked = raw.metrics.rainfall.series
        .map((s) => ({ city: s.category, rain: months.reduce((a, i) => a + s.counts[i], 0) }))
        .sort((a, b) => b.rain - a.rain);
      return {
        bars: heights.sort((a, b) => b - a),
        expected: ranked.map((r) => `${r.city}${r.rain}`).join(' > ')
      };
    });
    report.checks.push(`[三维·${w.width}px] HUD=${hud}｜canvas=${canvas}`);
    if (w.width === 1440) {
      report.checks.push(`[三维] 柱高排序(降序)=${bars.join(' > ')}`);
      report.checks.push(`[核对] 源数据同期降水排序=${expected}`);
    }
    await page.screenshot({ path: path.join(OUT, `globe-${w.name}.png`) });
    await context.close();
  }

  // ── 三维页空数据 ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    watch(page, 'globe-empty');
    await page.goto(`${BASE}/three-d/globe.html?demo=empty`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    const text = (await page.textContent('#globe-status')).trim();
    const canvas = await page.evaluate(() => !!document.querySelector('canvas'));
    report.checks.push(`[三维·空数据] #globe-status=${text}｜球体仍渲染=${canvas}`);
    await context.close();
  }

  await browser.close();

  report.summary = {
    consoleErrors: report.console.filter((l) => l.includes('error')).length,
    consoleWarnings: report.console.filter((l) => l.includes('warning')).length,
    pageErrors: report.pageErrors.length,
    failedRequests: report.failedRequests.length,
    httpErrors: report.httpErrors.length
  };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})();

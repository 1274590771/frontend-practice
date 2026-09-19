// 自查脚本：三档宽度截图、导航跳转、筛选与图表校验、断网提示、Console 收集
// 运行（本机已缓存 chromium-1228，用 PW_CHROME 指定可执行文件避免重复下载）：
//   PW_CHROME=<chrome.exe> NODE_PATH=<playwright> node docs/self-check/capture.cjs
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const OUT = __dirname;

const widths = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'tablet-768', width: 768, height: 900 },
  { name: 'mobile-375', width: 375, height: 812 }
];

const report = { console: [], pageErrors: [], failedRequests: [], httpErrors: [], checks: [] };

(async () => {
  // 本机已缓存 chromium-1228，直接指定可执行文件，避免重复下载
  const browser = await chromium.launch(
    process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}
  );

  // ── 自查 1~3：三档宽度截图 + 导航折叠 ──
  for (const w of widths) {
    const context = await browser.newContext({ viewport: { width: w.width, height: w.height } });
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') {
        report.console.push(`[${w.name}] ${m.type()}: ${m.text()}`);
      }
    });
    page.on('pageerror', (e) => report.pageErrors.push(`[${w.name}] ${e.message}`));
    page.on('requestfailed', (r) => report.failedRequests.push(`[${w.name}] ${r.url()} :: ${r.failure() && r.failure().errorText}`));
    page.on('response', (r) => {
      if (r.status() >= 400) report.httpErrors.push(`[${w.name}] HTTP ${r.status()} ${r.url()}`);
    });

    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, `width-${w.name}.png`), fullPage: true });

    const dir = await page.evaluate(() => getComputedStyle(document.querySelector('.navbar-nav')).flexDirection);
    report.checks.push(`[宽度] ${w.width}px：.navbar-nav flex-direction = ${dir}`);
    await context.close();
  }

  // ── 导航四入口 + 筛选 + 图表 + Console ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') {
        report.console.push(`[desktop-1440] ${m.type()}: ${m.text()}`);
      }
    });
    page.on('pageerror', (e) => report.pageErrors.push(`[desktop-1440] ${e.message}`));
    page.on('requestfailed', (r) => report.failedRequests.push(`[desktop-1440] ${r.url()} :: ${r.failure() && r.failure().errorText}`));

    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    for (const [text, expect] of [['首页', '#home'], ['自习室', '#rooms'], ['使用统计', '#stats']]) {
      await page.click(`.navbar-nav a:has-text("${text}")`);
      await page.waitForTimeout(350);
      const hash = await page.evaluate(() => location.hash);
      report.checks.push(`[导航] 「${text}」-> ${hash} (期望 ${expect}) ${hash === expect ? 'OK' : 'FAIL'}`);
    }
    const res = await page.request.get(`${BASE}/three-d/scene.html`);
    report.checks.push(`[导航] 「校园三维」-> three-d/scene.html 状态码 ${res.status()}`);

    // 首页概览卡片
    const cards = await page.$$eval('#summary-cards .card-title', (els) => els.map((e) => e.textContent.trim()));
    report.checks.push(`[首页卡片] 标题 = ${JSON.stringify(cards)}`);

    // 筛选：即时生效，逐档核对条数
    const countRooms = () => page.$$eval('#room-list li', (els) => els.length);
    const setFilter = async (sel, val) => {
      await page.selectOption(sel, val);
      await page.waitForTimeout(150);
      return countRooms();
    };

    const all = await countRooms();
    report.checks.push(`[筛选] 全部 = ${all} 条 (期望 12)`);
    for (const f of ['1', '2', '3', '4']) {
      const n = await setFilter('#floor-filter', f);
      report.checks.push(`[筛选] 楼层=${f} -> ${n} 条`);
    }
    await setFilter('#floor-filter', 'all');
    for (const s of ['开放', '闭馆', '维修']) {
      const n = await setFilter('#status-filter', s);
      report.checks.push(`[筛选] 状态=${s} -> ${n} 条`);
    }
    const combo = await (async () => {
      await page.selectOption('#floor-filter', '1');
      await page.selectOption('#status-filter', '开放');
      await page.waitForTimeout(150);
      return countRooms();
    })();
    report.checks.push(`[筛选] 楼层=1 + 状态=开放 -> ${combo} 条`);
    await page.screenshot({ path: path.join(OUT, 'filter-1f-open.png'), fullPage: true });

    // 空结果分支
    await page.selectOption('#floor-filter', '4');
    await page.selectOption('#status-filter', '维修');
    await page.waitForTimeout(150);
    const emptyText = await page.textContent('#room-list li');
    report.checks.push(`[筛选] 楼层=4 + 状态=维修 -> 空态文案「${emptyText.trim()}」`);
    await page.selectOption('#floor-filter', 'all');
    await page.selectOption('#status-filter', 'all');

    // 图表三要素：标题、单位、数据来源
    const chartInfo = await page.evaluate(() => {
      const inst = echarts.getInstanceByDom(document.querySelector('#usage-chart'));
      if (!inst) return null;
      const o = inst.getOption();
      return {
        title: o.title[0].text,
        yUnit: o.yAxis[0].name,
        seriesName: o.series[0].name,
        points: o.series[0].data.length
      };
    });
    report.checks.push(`[图表] 标题 = ${chartInfo && chartInfo.title}`);
    report.checks.push(`[图表] 纵轴单位 = ${chartInfo && chartInfo.yUnit}`);
    report.checks.push(`[图表] 系列名 = ${chartInfo && chartInfo.seriesName}，柱数 = ${chartInfo && chartInfo.points} (期望 12)`);

    const src = await page.evaluate(async () => (await (await fetch('data/data.json')).json()).source);
    report.checks.push(`[图表] 数据来源（data.json source）= ${src}`);
    report.checks.push(`[图表] 页脚来源声明确认 = ${(await page.textContent('footer')).includes('数据来源')}`);

    await context.close();
  }

  // ── 自查 4：断网（拦截 data.json）──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.route('**/data/data.json', (r) => r.abort('internetdisconnected'));
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);

    const status = await page.textContent('#status');
    const visible = await page.isVisible('#status');
    report.checks.push(`[断网] #status 可见 = ${visible}，文案 = ${status.trim()}`);
    await page.screenshot({ path: path.join(OUT, 'offline.png'), fullPage: true });
    await context.close();
  }

  // ── 第三方检查点：三维场景 ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') report.console.push(`[scene] ${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => report.pageErrors.push(`[scene] ${e.message}`));
    await page.goto(`${BASE}/three-d/scene.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    const canvas = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return c ? { w: c.width, h: c.height } : null;
    });
    report.checks.push(`[三维] canvas 尺寸 = ${canvas ? canvas.w + 'x' + canvas.h : '未渲染'}`);
    await page.screenshot({ path: path.join(OUT, 'scene.png') });
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

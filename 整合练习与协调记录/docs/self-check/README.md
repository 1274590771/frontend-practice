# 质量清单自查证据

复现方式：

```bash
cd 整合练习与协调记录
python -m http.server 8900 --bind 127.0.0.1
PW_CHROME=<chrome.exe 路径> NODE_PATH=<playwright 的 node_modules> \
  node docs/self-check/capture.cjs
```

脚本会重新生成下方全部截图与 `report.json`。`report.json` 分两部分：
`checks` 数组是每项断言的实际取值，`console` / `pageErrors` / `failedRequests` / `httpErrors`
是浏览器侧的原始记录。

## 清单四项

| # | 自查项 | 证据 | 实测结果 |
| --- | --- | --- | --- |
| 1 | 三档宽度 | `width-desktop-1440.png`、`width-tablet-768.png`、`width-mobile-375.png` | 1440px 导航横排、概览卡片 1 行；768px 导航横排、卡片 3 行；375px 导航折叠为纵排、卡片 3 行；两张图表均随宽度自适应，无横向滚动 |
| 2 | 断网 | `offline.png` | 拦截 `data/weather.json` 后 `#status` 显示「加载失败：Failed to fetch」并保持可见，页面其余部分正常 |
| 3 | 空数据 | `empty.png` | `?demo=empty` 时 `#status` 显示「暂无数据」，概览卡片数为 0（不残留上一次的结果），图表容器保持为空白面板 |
| 4 | Console | `report.json` 的 `console` 与 `summary` | 首页与三维页合计 console error = 0、warning = 0、page error = 0、HTTP ≥400 = 0 |

关于断网项：该场景是用 Playwright 主动 abort 请求造出来的，浏览器自身会在
devtools 里记一条 `net::ERR_INTERNET_DISCONNECTED`，这是被拦截的这个请求本身，
不是页面代码抛的错，所以没有计入 `summary`。页面侧的表现以 `offline.png` 为准。

## 模块贯通与数据一致性核对

这部分是「四个模块不是孤立页面」的证据，同样在 `report.json` 的 `checks` 里：

- `[贯通]` 首页选中「广州 + 上半年」后，三维链接为
  `three-d/globe.html?city=广州&period=h1`，跨页传递了同一份筛选状态。
- `[筛选·广州·上半年]` 概览卡片、明细卡片、柱状图三处给出的都是
  降水 865 mm / 均温 21.7 ℃，柱状图数据为 `[40,60,85,170,230,280]`。
- `[核对]` 脚本另外用源 `weather.json` 独立算了一遍（`[0..5]` 月求和与求平均），
  得到 865 mm / 21.7 ℃，与页面显示一致，排除页面自证。
- `[三维]` 同一时段下球面柱高降序为 `1.9 > 1.059 > 0.946 > 0.726`，
  源数据同期降水降序为 `广州865 > 昆明380 > 成都315 > 哈尔滨188`，
  一一对应。柱高按时段降水在四城中的占比归一化到 [0.4, 1.9]。

## 附带证据

- `filter-linked.png`：筛选「广州 + 上半年」后的整页截图，可见三处数字一致。
- `globe-desktop-1440.png`、`globe-mobile-375.png`：三维页在桌面与手机宽度下的渲染，
  含 `canvas` 尺寸断言（1440x900 / 375x812）。
- `[三维·空数据]`：三维页在空数据集下仍正常渲染球体，仅在底部提示「暂无数据」。

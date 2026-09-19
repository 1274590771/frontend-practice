# 质量自查证据（第四部分清单五项）

复现命令（需要本机已装 playwright 与 chromium；`PW_CHROME` 指向已缓存的浏览器可执行文件，
避免重复下载）：

```bash
cd integration
python -m http.server 8899 --bind 127.0.0.1
PW_CHROME=<chrome.exe 路径> NODE_PATH=<playwright 的 node_modules> \
  node docs/self-check/capture.cjs
```

脚本会重新生成下方全部截图与 `report.json`（脚本内断言结果）和 `console` 段（Console 采集结果）。

| # | 自查项 | 证据文件 | 结果 |
|---|--------|----------|------|
| 1 | 桌面宽度 1440px | `width-desktop-1440.png` | 导航横排，`.navbar-nav` flex-direction = row |
| 2 | 平板宽度 768px | `width-tablet-768.png` | 断点边界仍横排，卡片两列，图表自适应 |
| 3 | 手机宽度 375px | `width-mobile-375.png` | 导航折叠为纵向堆叠（flex-direction = column），卡片两列 |
| 4 | 断网（拦截 `data/data.json`） | `offline.png` | `#status` 显示「加载失败：Failed to fetch」，不留白 |
| 5 | Console 检查 | `report.json` 的 `console` / `summary` | 首页与三维页 console error = 0、page error = 0、HTTP ≥400 = 0 |

附带证据：

- `filter-1f-open.png`：楼层=1 + 状态=开放 的筛选结果（4 条）。
- `scene.png`：`three-d/scene.html` 三维场景渲染结果，canvas 1440×900。

`report.json` 中的 `checks` 数组逐条记录了四入口跳转、首页卡片、
各档筛选条数（全部 12 / 楼层 1→4、2→4、3→3、4→1 / 状态 开放→10、闭馆→1、维修→1）、
空态文案、图表标题与纵轴单位、数据来源等断言的实际取值。

## 说明：favicon

`index.html` 与 `scene.html` 各有一行 `<link rel="icon" href="data:,">`。
不加这一行时浏览器会自动请求 `/favicon.ico` 并返回 404，在 Console 里留下一条 error，
与「Console 无报错」冲突；空 data URI 让浏览器不再发起该请求，页面渲染结果不受影响。
这是相对参考案例唯一新增的内容。

// script.js
// 场景：消费记账统计
// 解决的问题：从一串消费流水中剔除脏记录，统计总支出、分类占比与最大单笔，并给出超支预警。

// ---------------------------------------------------------------------------
// 数据：消费记录，用「数组 + 对象」组织
// 最后五条是故意混入的非法数据，用来验证清洗逻辑
// ---------------------------------------------------------------------------
const records = [
  { id: 1, date: '2026-09-01', category: '餐饮', amount: 38.5, note: '午餐' },
  { id: 2, date: '2026-09-01', category: '交通', amount: 6,    note: '地铁' },
  { id: 3, date: '2026-09-02', category: '餐饮', amount: 52,   note: '同学聚餐' },
  { id: 4, date: '2026-09-03', category: '购物', amount: 299,  note: '跑鞋' },
  { id: 5, date: '2026-09-05', category: '餐饮', amount: 21,   note: '早餐' },
  { id: 6, date: '2026-09-07', category: '交通', amount: 15,   note: '打车' },
  { id: 7, date: '2026-09-09', category: '购物', amount: 88,   note: 'T恤' },
  { id: 8, date: '2026-09-10', category: '娱乐', amount: 45,   note: '看电影' },
  // ---- 以下为非法数据 ----
  { id: 9,  date: '2026-09-11', category: '餐饮', amount: -20,   note: '金额写成负数' },
  { id: 10, date: '2026-09-12', category: '交通', amount: 'abc', note: '金额不是数字' },
  { id: 11, date: '2026-9-13',  category: '购物', amount: 66,    note: '日期格式不规范' },
  { id: 12, date: '2026-09-14', category: '',     amount: 30,    note: '类别为空' },
  { id: 13, date: '2026-09-15', category: '娱乐', amount: 0,     note: '金额为零' },
];

// 本月预算，用于超支判断
const MONTHLY_BUDGET = 500;

// ---------------------------------------------------------------------------
// 校验单条记录
// 合法返回 null；不合法返回原因文字，便于同时用于「清洗」和「提示」
// ---------------------------------------------------------------------------
const validateRecord = (record) => {
  if (!record || typeof record !== 'object') return '记录不是对象';
  if (typeof record.category !== 'string' || record.category.trim() === '') {
    return '类别缺失或为空';
  }
  if (typeof record.amount !== 'number' || !Number.isFinite(record.amount)) {
    return `金额不是有效数字（当前 ${record.amount}）`;
  }
  if (record.amount <= 0) {
    return `金额必须大于 0（当前 ${record.amount}）`;
  }
  if (typeof record.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) {
    return `日期格式应为 YYYY-MM-DD（当前 ${record.date}）`;
  }
  return null;
};

// ---------------------------------------------------------------------------
// 清洗：把原始记录分流成「合法」与「非法（附原因）」两组
// ---------------------------------------------------------------------------
const splitRecords = (list) =>
  list.reduce(
    (acc, record) => {
      const reason = validateRecord(record);
      if (reason) {
        acc.rejected.push({ record, reason });
      } else {
        acc.valid.push(record);
      }
      return acc;
    },
    { valid: [], rejected: [] }
  );

// ---------------------------------------------------------------------------
// 总支出：所有合法记录的金额求和
// ---------------------------------------------------------------------------
const totalAmount = (list) => list.reduce((sum, r) => sum + r.amount, 0);

// ---------------------------------------------------------------------------
// 按类别汇总金额，返回 { 类别: 金额 } 结构
// ---------------------------------------------------------------------------
const sumByCategory = (list) =>
  list.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + r.amount;
    return acc;
  }, {});

// ---------------------------------------------------------------------------
// 最大单笔支出；空数组返回 null，交给调用方决定怎么展示
// ---------------------------------------------------------------------------
const largestExpense = (list) =>
  list.length === 0
    ? null
    : list.reduce((max, r) => (r.amount > max.amount ? r : max), list[0]);

// ---------------------------------------------------------------------------
// 筛选出某个类别的记录，用于统计该类别有几笔
// ---------------------------------------------------------------------------
const recordsOfCategory = (list, category) =>
  list.filter((r) => r.category === category);

// ---------------------------------------------------------------------------
// 把类别汇总对象转成条目数组并补上占比，按金额从高到低排序
// ---------------------------------------------------------------------------
const toCategoryEntries = (categoryTotals, total) =>
  Object.entries(categoryTotals)
    .map(([category, amount]) => ({
      category,
      amount,
      percent: total === 0 ? 0 : (amount / total) * 100,
    }))
    .sort((a, b) => b.amount - a.amount);

// 金额格式化，统一保留两位小数
const yuan = (n) => n.toFixed(2) + ' 元';

// ---------------------------------------------------------------------------
// 预算差额：正数表示超支，负数表示还有结余
// ---------------------------------------------------------------------------
const budgetGap = (total, budget) => total - budget;

// ---------------------------------------------------------------------------
// 生成主报告，只负责把各部分结果拼成可读文字
// ---------------------------------------------------------------------------
const buildReport = (valid, rejected, budget) => {
  if (valid.length === 0) return '没有有效的消费记录，无法统计。';

  const total = totalAmount(valid);
  const entries = toCategoryEntries(sumByCategory(valid), total);
  const top = largestExpense(valid);
  const gap = budgetGap(total, budget);

  const lines = [];
  lines.push('有效记录 ' + valid.length + ' 条，非法记录 ' + rejected.length + ' 条');
  lines.push('总支出：' + yuan(total) + '（预算 ' + yuan(budget) + '）');
  lines.push(
    gap > 0 ? '超支预警：已超出预算 ' + yuan(gap) : '预算内，剩余 ' + yuan(-gap)
  );
  lines.push('分类占比：');
  entries.forEach((e) => {
    const count = recordsOfCategory(valid, e.category).length;
    lines.push(
      '  ' + e.category + '  ' + count + ' 笔  ' + yuan(e.amount) +
      '  占 ' + e.percent.toFixed(1) + '%'
    );
  });
  lines.push('最大单笔：' + yuan(top.amount) + '（' + top.category + ' · ' + top.note + '）');
  return lines.join('\n');
};

// ---------------------------------------------------------------------------
// 生成非法记录提示，逐条说明被丢弃的原因
// 记录可能压根不是对象，id 取不到时用 ? 兜底，避免再抛异常
// ---------------------------------------------------------------------------
const buildRejectReport = (rejected) => {
  if (rejected.length === 0) return '没有非法记录。';
  return rejected
    .map((item) => {
      const id = item.record && item.record.id !== undefined ? item.record.id : '?';
      return '  第 ' + id + ' 条：' + item.reason;
    })
    .join('\n');
};

// ---------------------------------------------------------------------------
// 入口：清洗一次，分别产出统计报告与非法记录提示
// 用 try 兜底，保证异常时程序不崩溃、仍能给出可读信息
// ---------------------------------------------------------------------------
try {
  const { valid, rejected } = splitRecords(records);
  console.log('===== 消费记账统计 =====');
  console.log(buildReport(valid, rejected, MONTHLY_BUDGET));
  console.log('');
  console.log('----- 已丢弃的非法记录 -----');
  console.log(buildRejectReport(rejected));
} catch (err) {
  console.error('统计失败：' + err.message);
}

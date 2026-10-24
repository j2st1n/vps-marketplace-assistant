/**
 * Isvoro 二手交易市场插件 — 全量自动化回归测试套件 (v1.0.0)
 * 
 * 验证维度：
 * 1. 模块导出与环境容错性 (Module Exports & Environment Resilience)
 * 2. IP 状态探测流水线、异常判定与防误杀清洗矩阵 (IP Status Detection & Defensive Sanitation)
 * 3. 周期续费价格、计费周期与货币符号解析 (Renewal Price & Billing Cycle Parsing)
 * 4. 到期绝对时间高精度解析与格式兼容 (Expiry Date Parsing)
 * 5. 挂牌售价与网络流量存量解析 (Sale Price & Traffic Stock Calculation)
 * 6. 科学剩余价值估值模型与折溢价评估矩阵 (Scientific Valuation & Premium/Bonus Matrix)
 * 7. 6 维科学排序算法稳定性与 1 亿权重被阻断 IP 绝对沉底机制 (6D Sorting & 100M Penalty Sink)
 * 8. 智能多维组合筛选器逻辑 (Smart Filter Predicates)
 * 9. DOM 仿真提取与卡片指标装配端到端验证 (DOM Simulation & Extraction from mock-marketplace.html)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('════════════════════════════════════════════════════════════════');
console.log('🧪 开始执行 Isvoro 二手交易市场插件 (v1.0.0) 全量自动化回归测试');
console.log('════════════════════════════════════════════════════════════════\n');

// 引入被测模块源码
const isvoro = require('./isvoro-value.user.js');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}`);
    console.error(`     原因: ${err.message}`);
    failedTests++;
    throw err;
  }
}

function suite(name, fn) {
  console.log(`\n📌 测试套件: ${name}`);
  console.log('────────────────────────────────────────────────────────────────');
  fn();
}

// ────────────────────────────────────────────────────────────────
// 1. 模块导出与基础契约验证
// ────────────────────────────────────────────────────────────────
suite('1. 模块导出与基础契约验证', () => {
  it('正确导出了核心数据结构与状态机 STATE', () => {
    assert(isvoro.STATE, 'STATE 必须存在');
    assert.strictEqual(typeof isvoro.STATE.sortMode, 'string');
    assert.strictEqual(typeof isvoro.STATE.hideBlocked, 'boolean');
    assert.strictEqual(typeof isvoro.STATE.onlyBonus, 'boolean');
    assert.strictEqual(typeof isvoro.STATE.cycleFilter, 'string');
  });

  it('导出了全部必备的纯计算与判定函数', () => {
    const requiredFns = [
      'sanitizeIpStatusText',
      'isIpBlockedUnified',
      'isZh',
      'isMarketplaceRoute',
      'currencySymbol',
      'parseRenewalPrice',
      'parseExpiry',
      'parseSalePrice',
      'parseTrafficAmount',
      'calcTrafficStock',
      'calcValuation',
      'computeCardScore',
      'extractCardData',
      'decorateCard',
      'applySortingAndFilters',
    ];
    for (const fn of requiredFns) {
      assert.strictEqual(typeof isvoro[fn], 'function', `函数 ${fn} 必须导出`);
    }
  });
});

// ────────────────────────────────────────────────────────────────
// 2. IP 状态探测流水线、异常判定与防误杀清洗矩阵
// ────────────────────────────────────────────────────────────────
suite('2. IP 状态探测流水线与清洗防御测试', () => {
  it('准确识别常见正常 IP 状态标记', () => {
    assert.strictEqual(isvoro.isIpBlockedUnified('[IP正常]'), false);
    assert.strictEqual(isvoro.isIpBlockedUnified('IP正常'), false);
    assert.strictEqual(isvoro.isIpBlockedUnified('IP: OK'), false);
    assert.strictEqual(isvoro.isIpBlockedUnified('normal'), false);
    assert.strictEqual(isvoro.isIpBlockedUnified('healthy'), false);
    assert.strictEqual(isvoro.isIpBlockedUnified('良好'), false);
  });

  it('准确命中所有形式的 IP 阻断与污染（正向测试）', () => {
    assert.strictEqual(isvoro.isIpBlockedUnified('[IP被墙]'), true);
    assert.strictEqual(isvoro.isIpBlockedUnified('IP被封'), true);
    assert.strictEqual(isvoro.isIpBlockedUnified('IP阻断'), true);
    assert.strictEqual(isvoro.isIpBlockedUnified('端口封锁'), true);
    assert.strictEqual(isvoro.isIpBlockedUnified('被锁'), true);
    assert.strictEqual(isvoro.isIpBlockedUnified('连接不可达'), true);
    assert.strictEqual(isvoro.isIpBlockedUnified('节点失联'), true);
    assert.strictEqual(isvoro.isIpBlockedUnified('DNS污染'), true);
    assert.strictEqual(isvoro.isIpBlockedUnified('GFW'), true);
    assert.strictEqual(isvoro.isIpBlockedUnified('IP blocked'), true);
    assert.strictEqual(isvoro.isIpBlockedUnified('banned'), true);
    assert.strictEqual(isvoro.isIpBlockedUnified('unreachable'), true);
  });

  it('准确将无数据或检测异常归入风险阻断态沉底', () => {
    assert.strictEqual(isvoro.isIpBlockedUnified('no data'), true);
    assert.strictEqual(isvoro.isIpBlockedUnified('暂无数据'), true);
    assert.strictEqual(isvoro.isIpBlockedUnified('检测失败'), true);
    assert.strictEqual(isvoro.isIpBlockedUnified('检测超时'), true);
    assert.strictEqual(isvoro.isIpBlockedUnified('timeout'), true);
    assert.strictEqual(isvoro.isIpBlockedUnified('服务异常'), true);
  });

  it('防御误杀清洗：严禁将含“防火墙/锁价/锁单/不阻断/未阻断”误判为被墙', () => {
    assert.strictEqual(isvoro.isIpBlockedUnified('包含防火墙规则'), false);
    assert.strictEqual(isvoro.isIpBlockedUnified('原生防火墙保护'), false);
    assert.strictEqual(isvoro.isIpBlockedUnified('续费锁价'), false);
    assert.strictEqual(isvoro.isIpBlockedUnified('锁价机型'), false);
    assert.strictEqual(isvoro.isIpBlockedUnified('锁单中'), false);
    assert.strictEqual(isvoro.isIpBlockedUnified('不锁配置'), false);
    assert.strictEqual(isvoro.isIpBlockedUnified('未锁单'), false);
    assert.strictEqual(isvoro.isIpBlockedUnified('未阻断，直连顺畅'), false);
    assert.strictEqual(isvoro.isIpBlockedUnified('不阻断任何端口'), false);
    assert.strictEqual(isvoro.isIpBlockedUnified('无阻断记录'), false);
  });

  it('边缘与空值安全防御', () => {
    assert.strictEqual(isvoro.isIpBlockedUnified(''), false);
    assert.strictEqual(isvoro.isIpBlockedUnified(null), false);
    assert.strictEqual(isvoro.isIpBlockedUnified(undefined), false);
    assert.strictEqual(isvoro.isIpBlockedUnified('   '), false);
  });
});

// ────────────────────────────────────────────────────────────────
// 3. 周期续费价格、计费周期与货币符号解析
// ────────────────────────────────────────────────────────────────
suite('3. 续费价格与周期解析测试', () => {
  it('正确解析月付续费规格 (1个月 / 30天)', () => {
    const r1 = isvoro.parseRenewalPrice('¥45.00/月');
    assert.strictEqual(r1.price, 45);
    assert.strictEqual(r1.cycle, 'month');
    assert.strictEqual(r1.cycleDays, 30);
    assert.strictEqual(r1.period, 1);
    assert.strictEqual(r1.monthlyRenewalCost, 45);
    assert.strictEqual(r1.currency, '¥');

    const r2 = isvoro.parseRenewalPrice('45.5/mo');
    assert.strictEqual(r2.price, 45.5);
    assert.strictEqual(r2.cycle, 'month');
    assert.strictEqual(r2.cycleDays, 30);
  });

  it('正确解析季付续费规格 (3个月 / 90天)', () => {
    const r = isvoro.parseRenewalPrice('¥135.00/季');
    assert.strictEqual(r.price, 135);
    assert.strictEqual(r.cycle, 'quarter');
    assert.strictEqual(r.cycleDays, 90);
    assert.strictEqual(r.period, 3);
    assert.strictEqual(r.monthlyRenewalCost, 45); // 135 / 3

    const r2 = isvoro.parseRenewalPrice('150 / quarter');
    assert.strictEqual(r2.cycle, 'quarter');
    assert.strictEqual(r2.monthlyRenewalCost, 50);
  });

  it('正确解析半年付续费规格 (6个月 / 180天)', () => {
    const r = isvoro.parseRenewalPrice('¥210.00/半年');
    assert.strictEqual(r.price, 210);
    assert.strictEqual(r.cycle, 'halfYear');
    assert.strictEqual(r.cycleDays, 180);
    assert.strictEqual(r.period, 6);
    assert.strictEqual(r.monthlyRenewalCost, 35); // 210 / 6
  });

  it('正确解析年付续费规格 (12个月 / 365天)', () => {
    const r = isvoro.parseRenewalPrice('¥480.00/年');
    assert.strictEqual(r.price, 480);
    assert.strictEqual(r.cycle, 'year');
    assert.strictEqual(r.cycleDays, 365);
    assert.strictEqual(r.period, 12);
    assert.strictEqual(r.monthlyRenewalCost, 40); // 480 / 12

    const r2 = isvoro.parseRenewalPrice('600 / year');
    assert.strictEqual(r2.cycle, 'year');
    assert.strictEqual(r2.monthlyRenewalCost, 50);
  });

  it('正确解析周付与日付规格', () => {
    const rw = isvoro.parseRenewalPrice('¥14.00/周');
    assert.strictEqual(rw.price, 14);
    assert.strictEqual(rw.cycle, 'week');
    assert.strictEqual(rw.cycleDays, 7);
    assert.strictEqual(rw.monthlyRenewalCost, 60); // (14 / 7) * 30

    const rd = isvoro.parseRenewalPrice('¥1.50/天');
    assert.strictEqual(rd.price, 1.5);
    assert.strictEqual(rd.cycle, 'day');
    assert.strictEqual(rd.cycleDays, 1);
    assert.strictEqual(rd.monthlyRenewalCost, 45); // 1.5 * 30
  });

  it('多币种识别：支持 CNY (¥), USD ($), EUR (€), GBP (£)', () => {
    assert.strictEqual(isvoro.currencySymbol('¥45.00'), '¥');
    assert.strictEqual(isvoro.currencySymbol('CN¥ 45.00'), '¥');
    assert.strictEqual(isvoro.currencySymbol('$20.00'), '$');
    assert.strictEqual(isvoro.currencySymbol('€15.00'), '€');
    assert.strictEqual(isvoro.currencySymbol('£12.00'), '£');
    assert.strictEqual(isvoro.currencySymbol('45.00'), '¥');
  });

  it('异常输入容错', () => {
    assert.strictEqual(isvoro.parseRenewalPrice(''), null);
    assert.strictEqual(isvoro.parseRenewalPrice(null), null);
    assert.strictEqual(isvoro.parseRenewalPrice('abc'), null);
  });
});

// ────────────────────────────────────────────────────────────────
// 4. 到期时间高精度解析与格式兼容
// ────────────────────────────────────────────────────────────────
suite('4. 到期时间解析测试', () => {
  it('标准格式：YYYY-MM-DD HH:mm', () => {
    const d = isvoro.parseExpiry('2026-11-20 18:00');
    assert(d instanceof Date);
    assert.strictEqual(d.getFullYear(), 2026);
    assert.strictEqual(d.getMonth(), 10); // 0-based: 10 is November
    assert.strictEqual(d.getDate(), 20);
    assert.strictEqual(d.getHours(), 18);
    assert.strictEqual(d.getMinutes(), 0);
  });

  it('带秒格式：YYYY-MM-DD HH:mm:ss', () => {
    const d = isvoro.parseExpiry('2027-09-15 12:30:45');
    assert(d instanceof Date);
    assert.strictEqual(d.getFullYear(), 2027);
    assert.strictEqual(d.getMonth(), 8); // September
    assert.strictEqual(d.getDate(), 15);
    assert.strictEqual(d.getHours(), 12);
    assert.strictEqual(d.getMinutes(), 30);
    assert.strictEqual(d.getSeconds(), 45);
  });

  it('斜杠分隔与中文格式：YYYY/MM/DD 与 YYYY年MM月DD日', () => {
    const d1 = isvoro.parseExpiry('2026/12/25 23:59');
    assert.strictEqual(d1.getFullYear(), 2026);
    assert.strictEqual(d1.getMonth(), 11); // December
    assert.strictEqual(d1.getDate(), 25);

    const d2 = isvoro.parseExpiry('2027年03月31日 15:00');
    assert.strictEqual(d2.getFullYear(), 2027);
    assert.strictEqual(d2.getMonth(), 2); // March
    assert.strictEqual(d2.getDate(), 31);
  });

  it('ISO 8601 标准字符串：2026-11-20T18:00:00Z', () => {
    const d = isvoro.parseExpiry('2026-11-20T18:00:00Z');
    assert(d instanceof Date);
    assert(!Number.isNaN(d.getTime()));
  });

  it('纯日期格式（无时分秒自动置为 00:00:00）', () => {
    const d = isvoro.parseExpiry('2026-11-20');
    assert(d instanceof Date);
    assert.strictEqual(d.getFullYear(), 2026);
    assert.strictEqual(d.getMonth(), 10);
    assert.strictEqual(d.getDate(), 20);
    assert.strictEqual(d.getHours(), 0);
  });

  it('非法时间安全返回 null', () => {
    assert.strictEqual(isvoro.parseExpiry(''), null);
    assert.strictEqual(isvoro.parseExpiry('invalid-date'), null);
    assert.strictEqual(isvoro.parseExpiry(null), null);
  });
});

// ────────────────────────────────────────────────────────────────
// 5. 售价与流量存量解析
// ────────────────────────────────────────────────────────────────
suite('5. 售价与流量存量解析测试', () => {
  it('售价准确提取（过滤货币符号与千分位）', () => {
    assert.strictEqual(isvoro.parseSalePrice('¥25.00'), 25);
    assert.strictEqual(isvoro.parseSalePrice('$15.00'), 15);
    assert.strictEqual(isvoro.parseSalePrice('¥1,280.00'), 1280);
    assert.strictEqual(isvoro.parseSalePrice('99'), 99);
    assert.strictEqual(isvoro.parseSalePrice(''), null);
  });

  it('流量字节数多单位解析 (B, KB, MB, GB, TB)', () => {
    assert.strictEqual(isvoro.parseTrafficAmount('1024 B'), 1024);
    assert.strictEqual(isvoro.parseTrafficAmount('1 KB'), 1024);
    assert.strictEqual(isvoro.parseTrafficAmount('500 MB'), 500 * 1024 * 1024);
    assert.strictEqual(isvoro.parseTrafficAmount('1000 GB'), 1000 * 1024 * 1024 * 1024);
    assert.strictEqual(isvoro.parseTrafficAmount('1.2 TB'), 1.2 * 1024 * 1024 * 1024 * 1024);
  });

  it('流量剩余比例计算：150 GB / 1000 GB (剩余 85.0%)', () => {
    const stock = isvoro.calcTrafficStock('带宽 500M 流量 150 GB / 1000 GB');
    assert(stock, 'stock 必须存在');
    assert.strictEqual(stock.isUnlimited, false);
    assert.strictEqual(stock.remainingPct, '85.0');
    assert.strictEqual(stock.remainingRatio, 0.85);
  });

  it('流量剩余比例计算：大盘鸡 1.2 TB / 5120 GB (1.2 TB / 5 TB = 76.0% 剩余)', () => {
    const stock = isvoro.calcTrafficStock('带宽 2500M 流量 1.2 TB / 5120 GB');
    assert(stock);
    const expectedRatio = (5120 * 1024 * 1024 * 1024 - 1.2 * 1024 * 1024 * 1024 * 1024) / (5120 * 1024 * 1024 * 1024);
    assert.strictEqual(stock.remainingPct, (expectedRatio * 100).toFixed(1));
  });

  it('不限流量场景准确识别', () => {
    const stock = isvoro.calcTrafficStock('带宽 1000M 流量 不限流量');
    assert(stock);
    assert.strictEqual(stock.isUnlimited, true);
    assert.strictEqual(stock.remainingRatio, 1.0);
    assert.strictEqual(stock.remainingPct, '100.0');
  });

  it('流量异常容错（已用大于总量防护）', () => {
    const stock = isvoro.calcTrafficStock('流量 1200 GB / 1000 GB');
    assert(stock);
    assert.strictEqual(stock.remainingRatio, 0);
    assert.strictEqual(stock.remainingPct, '0.0');
  });
});

// ────────────────────────────────────────────────────────────────
// 6. 科学剩余价值估值模型与折溢价评估矩阵
// ────────────────────────────────────────────────────────────────
suite('6. 科学剩余价值估值模型测试', () => {
  // 模拟基准测试时间戳：2026-10-24 18:00:00 UTC+8
  const baseTime = new Date('2026-10-24T18:00:00+08:00').getTime();

  it('大额倒贴捡漏机器评估 (HK 1001: 续费45/月, 剩27天, 售价25)', () => {
    // 劫持 Date.now 提供确定性测试时间
    const originalNow = Date.now;
    Date.now = () => baseTime;

    try {
      // 到期时间 2026-11-20 18:00，距 10-24 18:00 恰好 27 天整 (27.0 days)
      const val = isvoro.calcValuation('¥45.00/月', '2026-11-20 18:00', 25.0);
      assert(val);
      assert.strictEqual(val.isExpired, false);
      assert.strictEqual(val.remainingDays, 27);
      // V_rem = 45 * (27 / 30) = 40.50
      assert.strictEqual(val.remainingValue, 40.5);
      assert.strictEqual(val.salePrice, 25.0);
      // deltaP = 25 - 40.50 = -15.50
      assert.strictEqual(val.deltaP, -15.5);
      assert.strictEqual(val.bonus, 15.5);
      assert.strictEqual(val.premium, 0);
      // discountRate = 25 / 40.5 = ~0.617 (-38% / 6.2折)
      assert.strictEqual(val.foldText, '6.2折');
      assert.strictEqual(val.pctText, '-38%');
      // dailyCost = 25 / 27 = 0.93
      assert.strictEqual(val.dailyCost, 0.93);
      assert.strictEqual(val.monthlyRenewalCost, 45);
      // 大额倒贴触发 super 徽章
      assert.strictEqual(val.badge.type, 'super');
      assert(val.badge.text.includes('倒贴') || val.badge.text.includes('Bonus'), '徽章文本应包含倒贴或 Bonus');
    } finally {
      Date.now = originalNow;
    }
  });

  it('严重高溢价机器评估 (SIN 1004: 续费60/月, 剩17天, 售价299)', () => {
    const originalNow = Date.now;
    Date.now = () => baseTime;

    try {
      // 到期时间 2026-11-10 18:00，距 10-24 18:00 恰好 17 天
      const val = isvoro.calcValuation('¥60.00/月', '2026-11-10 18:00', 299.0);
      assert(val);
      // V_rem = 60 * (17 / 30) = 34.00
      assert.strictEqual(val.remainingValue, 34.0);
      assert.strictEqual(val.salePrice, 299.0);
      // deltaP = 299 - 34 = +265.00
      assert.strictEqual(val.deltaP, 265.0);
      assert.strictEqual(val.premium, 265.0);
      assert.strictEqual(val.bonus, 0);
      // 溢价超过 15 元触发 high 徽章
      assert.strictEqual(val.badge.type, 'high');
      assert(val.badge.text.includes('溢价') || val.badge.text.includes('Premium'), '徽章文本应包含溢价或 Premium');
    } finally {
      Date.now = originalNow;
    }
  });

  it('平价流转机器评估 (售价等于剩余价值)', () => {
    const originalNow = Date.now;
    Date.now = () => baseTime;

    try {
      // 剩 20 天，续费 30/月 -> 剩余价值 20.00，售价 20.00
      const val = isvoro.calcValuation('¥30.00/月', '2026-11-13 18:00', 20.0);
      assert(val);
      assert.strictEqual(val.remainingValue, 20.0);
      assert.strictEqual(val.deltaP, 0);
      assert.strictEqual(val.bonus, 0);
      assert.strictEqual(val.premium, 0);
      assert.strictEqual(val.badge.type, 'fair');
      assert(val.badge.text.includes('平价') || val.badge.text.includes('Fair'), '徽章文本应包含平价或 Fair');
    } finally {
      Date.now = originalNow;
    }
  });

  it('已过期机器评估 (到期时间在过去)', () => {
    const originalNow = Date.now;
    Date.now = () => baseTime;

    try {
      // 到期日 2026-10-15 早于 10-24
      const val = isvoro.calcValuation('¥30.00/月', '2026-10-15 00:00', 10.0);
      assert(val);
      assert.strictEqual(val.isExpired, true);
      assert.strictEqual(val.remainingValue, 0);
      assert.strictEqual(val.badge.type, 'expired');
    } finally {
      Date.now = originalNow;
    }
  });

  it('外币结算机型正确流转货币符号 ($)', () => {
    const originalNow = Date.now;
    Date.now = () => baseTime;

    try {
      const val = isvoro.calcValuation('$20.00/月', '2026-11-18 12:00', 15.0);
      assert(val);
      assert.strictEqual(val.currency, '$');
    } finally {
      Date.now = originalNow;
    }
  });
});

// ────────────────────────────────────────────────────────────────
// 7. 6 维科学排序矩阵与 1 亿权重被阻断 IP 绝对沉底机制
// ────────────────────────────────────────────────────────────────
suite('7. 6 维科学排序与 1 亿权重沉底机制测试', () => {
  const baseTime = new Date('2026-10-24T18:00:00+08:00').getTime();

  // 构造典型代表样本卡片
  // Card A: 正常 IP，大额倒贴 (bonus: 15.5, deltaP: -15.5, discountRate: 0.617)
  const cardNormalDeal = {
    cardData: { isBlocked: false, trafficStock: { remainingRatio: 0.85 } },
    valuation: {
      deltaP: -15.5,
      bonus: 15.5,
      discountRate: 0.617,
      monthlyRenewalCost: 45.0,
      dailyCost: 0.93,
    },
  };

  // Card B: 正常 IP，高溢价神机 (premium: 265.0, deltaP: +265.0, discountRate: 8.79)
  const cardNormalPremium = {
    cardData: { isBlocked: false, trafficStock: { remainingRatio: 0.90 } },
    valuation: {
      deltaP: 265.0,
      bonus: 0,
      discountRate: 8.79,
      monthlyRenewalCost: 60.0,
      dailyCost: 17.59,
    },
  };

  // Card C: 被墙 IP，即使倒贴 1000 元让利 (极端倒贴)
  const cardBlockedExtremeBonus = {
    cardData: { isBlocked: true, trafficStock: { remainingRatio: 1.0 } },
    valuation: {
      deltaP: -1000.0,
      bonus: 1000.0,
      discountRate: 0.01,
      monthlyRenewalCost: 10.0,
      dailyCost: 0.05,
    },
  };

  // Card D: 被墙 IP，普通挂牌
  const cardBlockedNormal = {
    cardData: { isBlocked: true, trafficStock: { remainingRatio: 0.5 } },
    valuation: {
      deltaP: 10.0,
      bonus: 0,
      discountRate: 1.2,
      monthlyRenewalCost: 20.0,
      dailyCost: 1.0,
    },
  };

  const sortModes = ['bonus', 'discount', 'renew', 'daily', 'traffic', 'default'];

  sortModes.forEach((mode) => {
    it(`排序模式 [${mode}]: 被墙机器得分必须至少比所有正常机器大 9000 万分，绝对沉底`, () => {
      const scoreNormalDeal = isvoro.computeCardScore(cardNormalDeal.cardData, cardNormalDeal.valuation, 0, mode);
      const scoreNormalPremium = isvoro.computeCardScore(cardNormalPremium.cardData, cardNormalPremium.valuation, 1, mode);
      const scoreBlockedExtreme = isvoro.computeCardScore(cardBlockedExtremeBonus.cardData, cardBlockedExtremeBonus.valuation, 2, mode);
      const scoreBlockedNormal = isvoro.computeCardScore(cardBlockedNormal.cardData, cardBlockedNormal.valuation, 3, mode);

      const maxNormalScore = Math.max(scoreNormalDeal, scoreNormalPremium);
      const minBlockedScore = Math.min(scoreBlockedExtreme, scoreBlockedNormal);

      // 核心安全定理：minBlockedScore - maxNormalScore >= 90,000,000
      const margin = minBlockedScore - maxNormalScore;
      assert(
        margin >= 90000000,
        `模式 ${mode} 下被墙机器沉底失败！被墙最低分: ${minBlockedScore}, 正常最高分: ${maxNormalScore}, 差距: ${margin}`
      );
    });
  });

  it('正常机器在 [bonus] 模式下：倒贴最多的机器严格排在前面 (score 越小排越前)', () => {
    const scoreDeal = isvoro.computeCardScore(cardNormalDeal.cardData, cardNormalDeal.valuation, 0, 'bonus');
    const scorePremium = isvoro.computeCardScore(cardNormalPremium.cardData, cardNormalPremium.valuation, 1, 'bonus');
    assert(scoreDeal < scorePremium, `倒贴机得分 (${scoreDeal}) 必须低于溢价机得分 (${scorePremium})`);
  });

  it('正常机器在 [discount] 模式下：打折力度最大的机器严格排在前面', () => {
    const scoreDeal = isvoro.computeCardScore(cardNormalDeal.cardData, cardNormalDeal.valuation, 0, 'discount');
    const scorePremium = isvoro.computeCardScore(cardNormalPremium.cardData, cardNormalPremium.valuation, 1, 'discount');
    assert(scoreDeal < scorePremium, `折数小（6.2折）得分必须低于高溢价机`);
  });

  it('正常机器在 [renew] 模式下：月均续费最低的机器严格排在前面', () => {
    const scoreDeal = isvoro.computeCardScore(cardNormalDeal.cardData, cardNormalDeal.valuation, 0, 'renew');
    const scorePremium = isvoro.computeCardScore(cardNormalPremium.cardData, cardNormalPremium.valuation, 1, 'renew');
    assert(scoreDeal < scorePremium, `续费 45/月 得分必须低于续费 60/月`);
  });

  it('正常机器在 [traffic] 模式下：剩余流量比例最高的机器严格排在前面', () => {
    const scoreDeal = isvoro.computeCardScore(cardNormalDeal.cardData, cardNormalDeal.valuation, 0, 'traffic');
    const scorePremium = isvoro.computeCardScore(cardNormalPremium.cardData, cardNormalPremium.valuation, 1, 'traffic');
    assert(scorePremium < scoreDeal, `流量剩余 90% 的机器得分必须低于剩余 85% 的机器`);
  });
});

// ────────────────────────────────────────────────────────────────
// 8. 智能多维筛选器逻辑
// ────────────────────────────────────────────────────────────────
suite('8. 智能多维筛选器逻辑测试', () => {
  it('hideBlocked: 仅隐藏被阻断 IP 机器，保留全部正常 IP 机器', () => {
    const cards = [
      { style: {}, classList: { add: (c) => cards[0].hidden = (c === 'isvoro-xrv-hidden'), remove: () => cards[0].hidden = false } },
      { style: {}, classList: { add: (c) => cards[1].hidden = (c === 'isvoro-xrv-hidden'), remove: () => cards[1].hidden = false } },
    ];
    const metas = [
      { cardData: { isBlocked: false }, valuation: { deltaP: 10, cycle: 'month', period: 1 } },
      { cardData: { isBlocked: true }, valuation: { deltaP: -5, cycle: 'month', period: 1 } },
    ];

    isvoro.STATE.hideBlocked = true;
    isvoro.STATE.onlyBonus = false;
    isvoro.STATE.cycleFilter = 'all';

    isvoro.applySortingAndFilters(cards, metas);

    assert.strictEqual(cards[0].hidden, false, '正常机器不应隐藏');
    assert.strictEqual(cards[1].hidden, true, '被墙机器必须被隐藏');
  });

  it('onlyBonus: 仅保留倒贴机器 (deltaP < -0.01)，隐藏溢价与平价机器', () => {
    const cards = [
      { style: {}, classList: { add: (c) => cards[0].hidden = (c === 'isvoro-xrv-hidden'), remove: () => cards[0].hidden = false } },
      { style: {}, classList: { add: (c) => cards[1].hidden = (c === 'isvoro-xrv-hidden'), remove: () => cards[1].hidden = false } },
    ];
    const metas = [
      { cardData: { isBlocked: false }, valuation: { deltaP: -15.5, cycle: 'month', period: 1 } },
      { cardData: { isBlocked: false }, valuation: { deltaP: 5.0, cycle: 'month', period: 1 } },
    ];

    isvoro.STATE.hideBlocked = false;
    isvoro.STATE.onlyBonus = true;
    isvoro.STATE.cycleFilter = 'all';

    isvoro.applySortingAndFilters(cards, metas);

    assert.strictEqual(cards[0].hidden, false, '倒贴机器保留');
    assert.strictEqual(cards[1].hidden, true, '溢价机器必须隐藏');
  });

  it('cycleFilter: 准确按照月付/季付/半年付/年付分类过滤', () => {
    const cards = [
      { style: {}, classList: { add: (c) => cards[0].hidden = (c === 'isvoro-xrv-hidden'), remove: () => cards[0].hidden = false } },
      { style: {}, classList: { add: (c) => cards[1].hidden = (c === 'isvoro-xrv-hidden'), remove: () => cards[1].hidden = false } },
    ];
    const metas = [
      { cardData: { isBlocked: false }, valuation: { deltaP: 0, cycle: 'month', period: 1 } },
      { cardData: { isBlocked: false }, valuation: { deltaP: 0, cycle: 'year', period: 12 } },
    ];

    // 仅看年付
    isvoro.STATE.hideBlocked = false;
    isvoro.STATE.onlyBonus = false;
    isvoro.STATE.cycleFilter = 'year';

    isvoro.applySortingAndFilters(cards, metas);

    assert.strictEqual(cards[0].hidden, true, '月付机器在年付模式下应隐藏');
    assert.strictEqual(cards[1].hidden, false, '年付机器应保留');
  });
});

// ────────────────────────────────────────────────────────────────
// 9. DOM 仿真提取与卡片指标装配端到端验证 (mock-marketplace.html)
// ────────────────────────────────────────────────────────────────
suite('9. mock-marketplace.html 仿真卡片全量解析验证', () => {
  const htmlPath = path.join(__dirname, 'mock-marketplace.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  it('mock-marketplace.html 存在且包含标准 app 容器与卡片网格', () => {
    assert(html.includes('id="app"'));
    assert(html.includes('id="cards-grid"'));
    assert(html.includes('role="tabpanel"'));
  });

  it('从 mock-marketplace.html 中正则提取并验证全量 12 张卡片', () => {
    // 匹配所有 market-card 卡片块
    const cardBlocks = html.match(/<div class="rounded-xl border bg-card text-card-foreground shadow-sm flex flex-col market-card"[\s\S]*?<\/button>\s*<\/div>\s*<\/div>\s*<\/div>/g);
    assert(cardBlocks && cardBlocks.length === 12, `必须包含 12 张卡片，实际找到: ${cardBlocks ? cardBlocks.length : 0}`);

    const extractedCards = [];

    // 针对每个卡片块模拟轻量 DOM 提取
    cardBlocks.forEach((block, idx) => {
      // 提取标题
      const titleMatch = block.match(/<div class="text-lg font-semibold leading-tight">([^<]+)<\/div>/);
      const title = titleMatch ? titleMatch[1].trim() : '';
      assert(title, `第 ${idx + 1} 张卡片标题不能为空`);

      // 提取 IP 状态
      const ipMatch = block.match(/<span class="inline-flex items-center px-2 py-0\.5 rounded text-xs font-medium [^>]+>(\[.*?\])<\/span>/);
      const ipText = ipMatch ? ipMatch[1].trim() : '';
      const isBlocked = isvoro.isIpBlockedUnified(ipText);

      // 提取售价
      const priceMatch = block.match(/<div class="text-2xl font-bold text-primary">([^<]+)<\/div>/);
      const priceText = priceMatch ? priceMatch[1].trim() : '';
      const salePrice = isvoro.parseSalePrice(priceText);
      assert(salePrice !== null && salePrice > 0, `第 ${idx + 1} 张卡片 (${title}) 售价解析异常: ${priceText}`);

      // 提取续费价格
      const renewalMatch = block.match(/<dt class="text-muted-foreground">续费价格<\/dt>\s*<dd class="text-primary font-medium">([^<]+)<\/dd>/);
      const renewalText = renewalMatch ? renewalMatch[1].trim() : '';
      const renewal = isvoro.parseRenewalPrice(renewalText);
      assert(renewal !== null, `第 ${idx + 1} 张卡片 (${title}) 续费价格解析异常: ${renewalText}`);

      // 提取到期时间
      const expiryMatch = block.match(/<dt class="text-muted-foreground">到期时间<\/dt>\s*<dd>([^<]+)<\/dd>/);
      const expiryText = expiryMatch ? expiryMatch[1].trim() : '';
      const expiry = isvoro.parseExpiry(expiryText);
      assert(expiry !== null, `第 ${idx + 1} 张卡片 (${title}) 到期时间解析异常: ${expiryText}`);

      extractedCards.push({
        title,
        ipText,
        isBlocked,
        salePrice,
        renewal,
        expiry,
      });
    });

    // 统计验证
    const blockedCount = extractedCards.filter((c) => c.isBlocked).length;
    const normalCount = extractedCards.filter((c) => !c.isBlocked).length;

    assert.strictEqual(blockedCount, 2, '必须精确检测到 2 台被墙机器 (SJC-1003 与 TPE-1010)');
    assert.strictEqual(normalCount, 10, '必须精确检测到 10 台正常机器');
  });

  it('12 张仿真卡片与 mock-marketplace-data.json 数据契约 100% 对齐', () => {
    const jsonPath = path.join(__dirname, 'mock-marketplace-data.json');
    const mockJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    assert.strictEqual(mockJson.data.length, 12, 'JSON 必须包含 12 条数据');

    mockJson.data.forEach((item) => {
      // 检查 HTML 是否包含该主机名或方案名
      assert(
        html.includes(item.server_info.plan_name) || html.includes(item.server_info.hostname),
        `HTML 必须覆盖测试数据项: ${item.server_info.plan_name}`
      );
    });
  });
});

console.log('\n════════════════════════════════════════════════════════════════');
console.log(`🎉 全部测试执行完毕: 总计 ${totalTests} 项 | 通过 ${passedTests} 项 | 失败 ${failedTests} 项`);
console.log('════════════════════════════════════════════════════════════════\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

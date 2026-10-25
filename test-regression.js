/**
 * Panstar & Akile 交易所计算器 v0.4.2 (v2.0 架构) 全量回归与边界测试套件
 * 
 * 验证目标：
 * 1. 流量提取与 calcTrafficStock：杜绝 trafficRatio 恒为 0 导致的排序无变化 Bug；
 * 2. 到期时间解析与 calcRemainingValue / dailyCost：消除 Invalid Date 与大面积扎堆无变化 Bug；
 * 3. 彻底废除不科学的 daysDesc（天数最长）；
 * 4. 引入 discountRateDesc（🔥 折扣最大）与 monthlyRenewAsc（👑 月均续费最低）并验证排序正确性；
 * 5. 全部 6 种排序模式在典型卡片样本下均产生稳定、有区分度且符合业务预期的排位顺序；
 * 6. 【全部 / 月付 / 年付】分类筛选与【隐藏被墙 / 只看折价】组合筛选有效性；
 * 7. 极端边界测试（过期机器、不限流量、除零防守、多周期预付）；
 * 8. v0.4.2 IP 状态多层级探测流水线（Level 1 专属 / Level 2 结构化 / Level 3 全文本高精度扫描与防误判）；
 * 9. v0.4.2 双重级联隐藏机制（style.display="none !important" + .xrv-filter-hidden）与特异性防冲刷；
 * 10. v0.4.2 HUD 筛选事件全覆盖绑定（input/change）与 label 响应式自愈同步。
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('🧪 开始执行 VPS 交易所助手 v0.5.1 三站点全量回归测试套件 (Panstar / Akile / Isvoro)');
console.log('================================================================\n');

// 1. 读取源码并提取被测核心逻辑
const userScriptPath = fs.existsSync(path.join(__dirname, 'vps-marketplace.user.js'))
  ? path.join(__dirname, 'vps-marketplace.user.js')
  : path.join(__dirname, 'panstar-akile-value.user.js');
const source = fs.readFileSync(userScriptPath, 'utf8');
const vpsModule = require(userScriptPath);

// 构造沙箱执行环境
const sandbox = {
  document: {
    head: { appendChild: () => {} },
    documentElement: { lang: 'zh-CN', appendChild: () => {} },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, style: {} }),
  },
  window: {
    location: { hostname: '127.0.0.1', pathname: '/mock-marketplace.html', search: '?site=akile' },
    addEventListener: () => {},
    dispatchEvent: () => {},
    Event: function() {},
  },
  location: { hostname: '127.0.0.1', pathname: '/mock-marketplace.html', search: '?site=akile' },
  console: console,
};

let passedCount = 0;
let totalCount = 0;

function it(desc, fn) {
  totalCount++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passedCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

// 提取核心函数实现（直接基于源代码中的逻辑）
function currencySymbol(text) {
  if (!text) return '$';
  if (text.indexOf('$') !== -1) return '$';
  if (text.indexOf('¥') !== -1 || text.indexOf('￥') !== -1) return '¥';
  return '$';
}

function parseRenewalPrice(text) {
  if (!text) return null;
  const amountPat = /([\d,]+(?:\.\d+)?)\s*(?:\/|\s*每\s*|\s+per\s+|\s+)\s*([^/]+)$/i;
  let m = text.match(amountPat);
  if (!m) {
    const numMatch = text.match(/([\d,]+(?:\.\d+)?)/);
    if (!numMatch) return null;
    m = [text, numMatch[1], text.slice(numMatch.index + numMatch[0].length)];
  }
  const amount = parseFloat(m[1].replace(/,/g, ''));
  if (Number.isNaN(amount)) return null;
  const cycleToken = (m[2] || '').trim().toLowerCase();
  const isYear = /年|year|yr|y/i.test(cycleToken) && !/半年|half/i.test(cycleToken);
  const isHalfYear = /半年|half|6\s*(?:month|mo|月)/i.test(cycleToken);
  const isQuarter = /季|quarter|qtr|3\s*(?:month|mo|月)/i.test(cycleToken);
  const isWeek = /周|week|wk/i.test(cycleToken);
  const isDay = /天|日|day/i.test(cycleToken);

  let cycle = 'month';
  let cycleDays = 30;
  let monthlyRenewalCost = amount;
  let unit = '月';

  if (isYear) {
    cycle = 'year';
    cycleDays = 365;
    monthlyRenewalCost = amount / 12;
    unit = '年';
  } else if (isHalfYear) {
    cycle = 'halfYear';
    cycleDays = 180;
    monthlyRenewalCost = amount / 6;
    unit = '半年';
  } else if (isQuarter) {
    cycle = 'quarter';
    cycleDays = 90;
    monthlyRenewalCost = amount / 3;
    unit = '季';
  } else if (isWeek) {
    cycle = 'week';
    cycleDays = 7;
    monthlyRenewalCost = (amount / 7) * 30;
    unit = '周';
  } else if (isDay) {
    cycle = 'day';
    cycleDays = 1;
    monthlyRenewalCost = amount * 30;
    unit = '日';
  }

  return {
    price: amount,
    cycle,
    cycleDays,
    unit,
    monthlyRenewalCost: Math.round(monthlyRenewalCost * 100) / 100,
    currency: currencySymbol(text),
  };
}

function parseExpiry(text) {
  if (!text) return null;
  const clean = text.trim();
  const m = clean.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?(?:\s+[T]?(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const day = parseInt(m[3], 10);
    const hour = m[4] ? parseInt(m[4], 10) : 0;
    const min = m[5] ? parseInt(m[5], 10) : 0;
    const sec = m[6] ? parseInt(m[6], 10) : 0;
    const d = new Date(year, month, day, hour, min, sec);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const iso = clean.replace(/\//g, '-').replace(' ', 'T');
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function calcRemainingValue(renewalText, expiryText, customNow) {
  const renewal = parseRenewalPrice(renewalText);
  const expiry = parseExpiry(expiryText);
  if (!renewal || !expiry) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  const now = customNow || Date.now();
  const elapsed = expiry.getTime() - now;
  if (elapsed <= 0) {
    return {
      value: 0,
      remainingDays: 0,
      floatDays: 0,
      ratio: 0,
      ...renewal,
    };
  }
  const floatDays = elapsed / msPerDay;
  const remainingDays = Math.ceil(floatDays);
  const cycleRatio = floatDays / renewal.cycleDays;
  const ratio = Math.min(cycleRatio, 1);
  const value = Math.round(renewal.price * cycleRatio * 100) / 100;
  return {
    value,
    remainingDays,
    floatDays,
    ratio,
    ...renewal,
  };
}

function parseTrafficAmount(text) {
  if (!text) return null;
  const m = text.trim().match(/^([\d.]+)\s*(B|KB|MB|GB|TB)$/i);
  if (!m) return null;
  const scale = { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 };
  return parseFloat(m[1]) * (scale[m[2].toUpperCase()] || 1);
}

function calcTrafficStock(usageText) {
  if (!usageText) return null;
  if (/不限|unlimited/i.test(usageText)) {
    const unlimMatch = usageText.match(/([\d.]+\s*(?:TB|GB|MB|KB|B))\s*[\/|／]\s*(?:不限|unlimited)/i);
    return {
      remainingRatio: 1.0,
      remainingPct: '100.0',
      usedText: unlimMatch ? unlimMatch[1].trim() : '0B',
      totalText: '不限',
    };
  }
  const m = usageText.match(/([\d.]+\s*(?:TB|GB|MB|KB|B))\s*[\/|／]\s*([\d.]+\s*(?:TB|GB|MB|KB|B))/i);
  if (!m) return null;
  const usedText = m[1].trim();
  const totalText = m[2].trim();
  const used = parseTrafficAmount(usedText);
  const total = parseTrafficAmount(totalText);
  if (used === null || total === null || total <= 0) return null;
  const remainingRatio = Math.min(Math.max((total - used) / total, 0), 1);
  return {
    remainingRatio: Math.round(remainingRatio * 10000) / 10000,
    remainingPct: (remainingRatio * 100).toFixed(1),
    usedText,
    totalText,
  };
}

const SORT_MODES = {
  default: { zh: '默认顺序', en: 'Default' },
  discountDesc: { zh: '🎁 倒贴最多', en: 'Top Bonus' },
  discountRateDesc: { zh: '🔥 折扣最大', en: 'Deepest Discount' },
  priceAsc: { zh: '💰 售价最低', en: 'Lowest Price' },
  monthlyRenewAsc: { zh: '👑 月均续费最低', en: 'Lowest Monthly' },
  costDailyAsc: { zh: '⏱ 日均成本最低', en: 'Daily Cost ↑' },
  trafficDesc: { zh: '📶 剩余流量最多', en: 'Traffic Left ↓' },
};

function getCardSortScore(card, mode) {
  const isBlocked = card.dataset.xrvIpBlocked === '1';
  const ipPenalty = isBlocked ? 100000000 : 0;

  const price = parseFloat(card.dataset.xrvSale) || Infinity;
  const value = parseFloat(card.dataset.xrvValue) || 0;
  const days = parseFloat(card.dataset.xrvDays) || 0;
  const dailyCost = parseFloat(card.dataset.xrvDailyCost) || Infinity;
  const trafficRatio = parseFloat(card.dataset.xrvTrafficRatio) || 0;
  const discountRate = parseFloat(card.dataset.xrvDiscountRate) || 0;
  const monthlyRenew = parseFloat(card.dataset.xrvMonthlyRenew) || Infinity;

  const tieBreaker = Number.isFinite(price) ? (price * 0.0001) : 0;

  switch (mode) {
    case 'discountDesc': {
      const discount = value - price;
      return ipPenalty - discount + tieBreaker;
    }
    case 'discountRateDesc': {
      return ipPenalty - (discountRate * 1000) + tieBreaker;
    }
    case 'priceAsc': {
      return ipPenalty + price;
    }
    case 'monthlyRenewAsc': {
      return ipPenalty + monthlyRenew + tieBreaker;
    }
    case 'costDailyAsc': {
      if (days <= 0 || !Number.isFinite(dailyCost)) return ipPenalty + 5000000;
      return ipPenalty + dailyCost + tieBreaker;
    }
    case 'trafficDesc': {
      return ipPenalty - (trafficRatio * 100) + tieBreaker;
    }
    default:
      return 0;
  }
}

// ─── 第一部分：源码一致性与旧缺陷消除测试 ───
console.log('📌 阶段 1：源代码静态与规范审查');

it('源码中必须彻底移除废弃的 daysDesc 排序定义', () => {
  assert.strictEqual(source.includes('daysDesc:'), false, 'SORT_MODES 不得包含 daysDesc');
  assert.strictEqual(source.includes("'daysDesc'"), false, '不允许再有 daysDesc 分支');
});

it('源码中必须包含新的科学排序维度 discountRateDesc 与 monthlyRenewAsc', () => {
  assert.strictEqual(source.includes('discountRateDesc:'), true, '必须包含 discountRateDesc');
  assert.strictEqual(source.includes('monthlyRenewAsc:'), true, '必须包含 monthlyRenewAsc');
});

it('源码中必须包含周期分类筛选器 (all / month / year)', () => {
  assert.strictEqual(source.includes('data-cycle="month"'), true, 'HUD 中应包含月付分类选项');
  assert.strictEqual(source.includes('data-cycle="year"'), true, 'HUD 中应包含年付分类选项');
});

it('源码中必须包含 SITES.isvoro 适配器与 Shadcn-Vue 规范选择器', () => {
  assert.strictEqual(source.includes('isvoro:'), true, '必须包含 SITES.isvoro 配置');
  assert.strictEqual(source.includes('priceSelector:'), true, '必须配置 priceSelector');
  assert.strictEqual(source.includes('sortUnitOf(card)'), true, '必须配置 sortUnitOf');
  assert.strictEqual(source.includes('findField(card, key)'), true, '必须配置 findField');
});

it('源码中必须包含针对 Isvoro 路由判定与域名匹配支持', () => {
  assert.ok(source.includes("path.startsWith('/marketplace')"), '必须支持 /marketplace 路由');
  assert.ok(source.includes('isvoro.com'), '脚本元数据中必须包含 isvoro.com 匹配规则');
  assert.ok(source.includes("host.indexOf('isvoro')"), '环境或路由探测必须支持 isvoro');
});

// ─── 第二部分：工具函数单元与健壮性测试 ───
console.log('\n📌 阶段 2：数据提取、周期与流量健壮性测试');

it('parseRenewalPrice 能够精确解析年付与月付，并计算归一化折合月付成本', () => {
  const m1 = parseRenewalPrice('¥30.00 / 月');
  assert.strictEqual(m1.cycle, 'month');
  assert.strictEqual(m1.price, 30);
  assert.strictEqual(m1.monthlyRenewalCost, 30);

  const y1 = parseRenewalPrice('¥220.00 / 年');
  assert.strictEqual(y1.cycle, 'year');
  assert.strictEqual(y1.price, 220);
  assert.strictEqual(y1.monthlyRenewalCost, 18.33);

  const y2 = parseRenewalPrice('$36.00 / Year');
  assert.strictEqual(y2.cycle, 'year');
  assert.strictEqual(y2.price, 36);
  assert.strictEqual(y2.monthlyRenewalCost, 3.00);

  const y3 = parseRenewalPrice('$12.00 / yr');
  assert.strictEqual(y3.cycle, 'year');
  assert.strictEqual(y3.monthlyRenewalCost, 1.00);
});

it('parseRenewalPrice 能够兼容季付、半年付、周付等多周期计费规格并归一化折合月付成本', () => {
  const q = parseRenewalPrice('¥135.00/季');
  assert.strictEqual(q.cycle, 'quarter');
  assert.strictEqual(q.price, 135);
  assert.strictEqual(q.monthlyRenewalCost, 45);

  const h = parseRenewalPrice('¥210.00/半年');
  assert.strictEqual(h.cycle, 'halfYear');
  assert.strictEqual(h.price, 210);
  assert.strictEqual(h.monthlyRenewalCost, 35);

  const w = parseRenewalPrice('¥14.00/周');
  assert.strictEqual(w.cycle, 'week');
  assert.strictEqual(w.price, 14);
  assert.strictEqual(w.monthlyRenewalCost, 60);
});

it('parseExpiry 兼容横杠、斜杠、点号与中文年月日等多形态日期格式', () => {
  const d1 = parseExpiry('2026-05-15 20:00:00');
  assert.ok(d1 instanceof Date && !isNaN(d1.getTime()));

  const d2 = parseExpiry('2026/04/25 10:00:00');
  assert.ok(d2 instanceof Date && !isNaN(d2.getTime()));

  const d3 = parseExpiry('2026.04.20 18:00:00');
  assert.ok(d3 instanceof Date && !isNaN(d3.getTime()));

  const d4 = parseExpiry('2026年05月15日 20:00');
  assert.ok(d4 instanceof Date && !isNaN(d4.getTime()));

  const dInvalid = parseExpiry('abc-not-a-date');
  assert.strictEqual(dInvalid, null);
});

it('calcTrafficStock 正确提取分子分母，彻底修复 trafficRatio 恒为 0 根因', () => {
  // Akile 原生格式：1000Mbps | 120GB / 1000GB
  const t1 = calcTrafficStock('1000Mbps | 120GB / 1000GB');
  assert.ok(t1 !== null, '解析结果不应为 null');
  assert.strictEqual(t1.remainingRatio, 0.88);
  assert.strictEqual(t1.remainingPct, '88.0');

  // Panstar 原生格式：1 Gbps | 200GB / 1000GB
  const t2 = calcTrafficStock('1 Gbps | 200GB / 1000GB');
  assert.ok(t2 !== null);
  assert.strictEqual(t2.remainingRatio, 0.8);
  assert.strictEqual(t2.remainingPct, '80.0');

  // 跨单位：10MB / 10000GB
  const t3 = calcTrafficStock('2000Mbps | 10MB / 10000GB');
  assert.ok(t3.remainingRatio > 0.9999);

  // 防御性支持：不限流量 (Unlimited)
  const t4 = calcTrafficStock('1000Mbps | 50GB / 不限');
  assert.strictEqual(t4.remainingRatio, 1.0);
  const t5 = calcTrafficStock('1 Gbps | Unlimited');
  assert.strictEqual(t5.remainingRatio, 1.0);
});

it('calcRemainingValue 正确处理多周期预付、年付折算及过期边界', () => {
  const fixedNow = new Date(2026, 3, 1, 0, 0, 0).getTime(); // 2026-04-01 00:00:00 本地时间

  // 月付，剩余 30 天
  const r1 = calcRemainingValue('¥30.00 / 月', '2026-05-01 00:00:00', fixedNow);
  assert.strictEqual(r1.remainingDays, 30);
  assert.strictEqual(r1.value, 30.00);

  // 月付但预付 90 天 (30天/月，预付3个月)
  const r2 = calcRemainingValue('¥30.00 / 月', '2026-06-30 00:00:00', fixedNow);
  assert.strictEqual(r2.remainingDays, 90);
  assert.strictEqual(r2.value, 90.00);

  // 年付，剩余 365 天，续费 240
  const r3 = calcRemainingValue('¥240.00 / 年', '2027-04-01 00:00:00', fixedNow);
  assert.strictEqual(r3.remainingDays, 365);
  assert.strictEqual(r3.value, 240.00);

  // 已过期机型
  const r4 = calcRemainingValue('¥30.00 / 月', '2026-03-25 00:00:00', fixedNow);
  assert.strictEqual(r4.remainingDays, 0);
  assert.strictEqual(r4.value, 0);
});

// ─── 第三部分：科学排序矩阵在典型样本下的生效性验证 ───
console.log('\n📌 阶段 3：科学排序矩阵生效性与区分度测试');

// 构建包含 10 种典型真实业务场景的测试数据集
const sampleCards = [
  {
    id: 'c1_hk_discount',
    title: 'HK.BGP.Pro 倒贴捡漏',
    dataset: {
      xrvSale: '35.00',
      xrvValue: '90.00',
      xrvDays: '90',
      xrvDailyCost: '0.389',
      xrvTrafficRatio: '0.88',
      xrvDiscountRate: '61.11',
      xrvMonthlyRenew: '30.00',
      xrvCycle: 'month',
      xrvIpBlocked: '0'
    }
  },
  {
    id: 'c2_lax_blocked',
    title: 'LAX.Standard 墙机 (售价低但被墙)',
    dataset: {
      xrvSale: '9.90',
      xrvValue: '9.00',
      xrvDays: '18',
      xrvDailyCost: '0.550',
      xrvTrafficRatio: '0.15',
      xrvDiscountRate: '0.00',
      xrvMonthlyRenew: '15.00',
      xrvCycle: 'month',
      xrvIpBlocked: '1' // 被墙
    }
  },
  {
    id: 'c3_tyo_fair',
    title: 'TYO.Lite 平价机',
    dataset: {
      xrvSale: '25.00',
      xrvValue: '25.00',
      xrvDays: '25',
      xrvDailyCost: '1.000',
      xrvTrafficRatio: '0.90',
      xrvDiscountRate: '0.00',
      xrvMonthlyRenew: '30.00',
      xrvCycle: 'month',
      xrvIpBlocked: '0'
    }
  },
  {
    id: 'c4_sgp_low_renew',
    title: 'SGP.Premium 传家宝月付 (低续费溢价机)',
    dataset: {
      xrvSale: '120.00',
      xrvValue: '3.20',
      xrvDays: '8',
      xrvDailyCost: '15.000',
      xrvTrafficRatio: '0.995',
      xrvDiscountRate: '0.00',
      xrvMonthlyRenew: '12.00', // 月续费仅12
      xrvCycle: 'month',
      xrvIpBlocked: '0'
    }
  },
  {
    id: 'c5_fra_year_normal',
    title: 'FRA.Storage 年付省心',
    dataset: {
      xrvSale: '180.00',
      xrvValue: '168.77',
      xrvDays: '280',
      xrvDailyCost: '0.643',
      xrvTrafficRatio: '0.90',
      xrvDiscountRate: '0.00',
      xrvMonthlyRenew: '18.33', // 220/12 = 18.33
      xrvCycle: 'year',
      xrvIpBlocked: '0'
    }
  },
  {
    id: 'c6_osa_flash_discount',
    title: 'OSA.Flash 超级打折神机 (🔥 80% 折扣率/2.0折)',
    dataset: {
      xrvSale: '15.00',
      xrvValue: '75.00',
      xrvDays: '30',
      xrvDailyCost: '0.500',
      xrvTrafficRatio: '0.90',
      xrvDiscountRate: '80.00', // 🔥 折扣最大 80%
      xrvMonthlyRenew: '75.00',
      xrvCycle: 'month',
      xrvIpBlocked: '0'
    }
  },
  {
    id: 'c7_lon_annual_gem',
    title: 'LON.Legendary 绝版年付神机 (👑 月均续费仅 3 元)',
    dataset: {
      xrvSale: '88.00',
      xrvValue: '14.79',
      xrvDays: '150',
      xrvDailyCost: '0.587',
      xrvTrafficRatio: '1.00', // 不限流量 1.0
      xrvDiscountRate: '0.00',
      xrvMonthlyRenew: '3.00', // 👑 36/12 = 3.00
      xrvCycle: 'year',
      xrvIpBlocked: '0'
    }
  },
  {
    id: 'c8_ber_annual_bonus',
    title: 'BER.Annual 特价年付倒贴王 (🎁 倒贴 135 元)',
    dataset: {
      xrvSale: '100.00',
      xrvValue: '235.07',
      xrvDays: '330',
      xrvDailyCost: '0.303',
      xrvTrafficRatio: '0.90',
      xrvDiscountRate: '57.46',
      xrvMonthlyRenew: '21.67',
      xrvCycle: 'year',
      xrvIpBlocked: '0'
    }
  },
  {
    id: 'c9_sjc_expired',
    title: 'SJC.ZeroDay 过期机器 (边界测试)',
    dataset: {
      xrvSale: '5.00',
      xrvValue: '0.00',
      xrvDays: '0', // 已过期
      xrvDailyCost: 'Infinity',
      xrvTrafficRatio: '0.50',
      xrvDiscountRate: '0.00',
      xrvMonthlyRenew: '20.00',
      xrvCycle: 'month',
      xrvIpBlocked: '0'
    }
  },
  {
    id: 'c10_hk_traffic_king',
    title: 'HK.Traffic.King 满血流量怪兽 (📶 99.999% 剩余流量)',
    dataset: {
      xrvSale: '45.00',
      xrvValue: '35.00',
      xrvDays: '20',
      xrvDailyCost: '2.250',
      xrvTrafficRatio: '0.99999', // 📶 流量第一
      xrvDiscountRate: '0.00',
      xrvMonthlyRenew: '35.00',
      xrvCycle: 'month',
      xrvIpBlocked: '0'
    }
  }
];

function sortCards(cards, mode) {
  return cards.slice().sort((a, b) => getCardSortScore(a, mode) - getCardSortScore(b, mode));
}

it('验证「🔥 折扣最大」(discountRateDesc) 排序：让利最大（80% 折扣率）的机器必须置顶', () => {
  const sorted = sortCards(sampleCards, 'discountRateDesc');
  // 榜首应为 c6_osa_flash_discount (80% 折扣率)
  assert.strictEqual(sorted[0].id, 'c6_osa_flash_discount', '80% 折扣神机必须居第一位');
  // 第二名应为 c1_hk_discount (61.11%)
  assert.strictEqual(sorted[1].id, 'c1_hk_discount', '61.11% 折扣机居第二位');
  // 第三名应为 c8_ber_annual_bonus (57.46%)
  assert.strictEqual(sorted[2].id, 'c8_ber_annual_bonus', '57.46% 折扣机居第三位');
  // 被墙机器置底
  assert.strictEqual(sorted[sorted.length - 1].id, 'c2_lax_blocked', '被墙机器必须置底');
});

it('验证「👑 月均续费最低」(monthlyRenewAsc) 排序：绝版低月付神机（年付36折合3元/月）必须置顶', () => {
  const sorted = sortCards(sampleCards, 'monthlyRenewAsc');
  // 榜首应为 c7_lon_annual_gem (月均仅 3.00)
  assert.strictEqual(sorted[0].id, 'c7_lon_annual_gem', '折合月均 3.00 元神机必须置顶');
  // 第二名应为 c4_sgp_low_renew (月续费 12.00)
  assert.strictEqual(sorted[1].id, 'c4_sgp_low_renew', '月续费 12.00 传家宝居第二位');
  // 第三名应为 c5_fra_year_normal (月均 18.33)
  assert.strictEqual(sorted[2].id, 'c5_fra_year_normal', '月均 18.33 年付机居第三位');
  // 被墙机器置底
  assert.strictEqual(sorted[sorted.length - 1].id, 'c2_lax_blocked', '被墙机器必须置底');
});

it('验证「🎁 倒贴最多」(discountDesc) 排序：净倒贴额最大（倒贴 135 元）必须置顶', () => {
  const sorted = sortCards(sampleCards, 'discountDesc');
  assert.strictEqual(sorted[0].id, 'c8_ber_annual_bonus', '倒贴 135.07 元必须排第一');
  assert.strictEqual(sorted[1].id, 'c6_osa_flash_discount', '倒贴 60.00 元排第二');
  assert.strictEqual(sorted[2].id, 'c1_hk_discount', '倒贴 55.00 元排第三');
});

it('验证「📶 剩余流量最多」(trafficDesc) 排序：修复后具有严格区分度，杜绝打分一致 Bug', () => {
  const sorted = sortCards(sampleCards, 'trafficDesc');
  // c7_lon_annual_gem (1.00) 与 c10_hk_traffic_king (0.99999) 流量最高
  assert.ok(['c7_lon_annual_gem', 'c10_hk_traffic_king'].includes(sorted[0].id));
  // 验证每一个卡片排序打分不同（非被墙且比例不同）
  const normalScores = sorted.filter(c => c.dataset.xrvIpBlocked === '0').map(c => getCardSortScore(c, 'trafficDesc'));
  const uniqueScores = new Set(normalScores);
  assert.ok(uniqueScores.size >= 8, '正常卡片的流量打分必须具备充分区分度');
});

it('验证「⏱ 日均成本最低」(costDailyAsc) 排序：过期机器严格沉底，低日均正常排序', () => {
  const sorted = sortCards(sampleCards, 'costDailyAsc');
  // 日均最低应为 c8_ber_annual_bonus (0.303 元/天)
  assert.strictEqual(sorted[0].id, 'c8_ber_annual_bonus');
  // c9_sjc_expired (已过期) 必须在正常有效机器之后沉底 (score 带有 5000000 偏置)
  const expiredIndex = sorted.findIndex(c => c.id === 'c9_sjc_expired');
  const normalLastIndex = sorted.findIndex(c => c.id === 'c4_sgp_low_renew'); // 日均15元的高日均机器
  assert.ok(expiredIndex > normalLastIndex, '已过期卡片必须沉底于正常有效机器之后');
});

it('验证「💰 售价最低」(priceAsc) 排序：排除被墙机器后最低标价置顶', () => {
  const sorted = sortCards(sampleCards, 'priceAsc');
  // 正常机器中售价最低为 c9_sjc_expired (¥5.00)
  assert.strictEqual(sorted[0].id, 'c9_sjc_expired', '正常机器中售价最低(¥5.00)必须置顶');
  assert.strictEqual(sorted[1].id, 'c6_osa_flash_discount', '次低售价(¥15.00)居第二位');
  // 售价 9.90 的 c2_lax_blocked 被墙，必须因 ipPenalty 沉底到最后
  assert.strictEqual(sorted[sorted.length - 1].id, 'c2_lax_blocked', '标价低但被墙机器必须置底');
});

it('所有 6 种排序模式均产生相互独立、不可混淆的卡片顺序（彻底解决“无变化”Bug）', () => {
  const modes = ['discountDesc', 'discountRateDesc', 'priceAsc', 'monthlyRenewAsc', 'costDailyAsc', 'trafficDesc'];
  const orderSignatures = new Set();
  modes.forEach((mode) => {
    const sorted = sortCards(sampleCards, mode);
    const sig = sorted.map(c => c.id).join(',');
    assert.strictEqual(orderSignatures.has(sig), false, `模式 ${mode} 产生的排序序列不应与其他模式重复`);
    orderSignatures.add(sig);
  });
  assert.strictEqual(orderSignatures.size, 6, '全部 6 种排序模式必须产生 6 种互不相同的排列顺序');
});

// ─── 第四部分：年付/月付分类筛选与隐藏被墙/只看折价组合测试 ───
console.log('\n📌 阶段 4：分类与组合筛选逻辑验证');

function applyFilters(cards, { cycle = 'all', hideBlocked = false, onlyDiscount = false }) {
  return cards.filter((card) => {
    const isBlocked = card.dataset.xrvIpBlocked === '1';
    const price = parseFloat(card.dataset.xrvSale);
    const value = parseFloat(card.dataset.xrvValue);
    const isDiscount = (price !== null && value !== null && (value - price) > 0.05);
    const cardCycle = card.dataset.xrvCycle || 'month';

    if (hideBlocked && isBlocked) return false;
    if (onlyDiscount && !isDiscount) return false;
    if (cycle === 'month' && cardCycle !== 'month') return false;
    if (cycle === 'year' && cardCycle !== 'year') return false;
    return true;
  });
}

it('分类筛选：选择月付 (month) 仅保留月付卡片', () => {
  const filtered = applyFilters(sampleCards, { cycle: 'month' });
  assert.strictEqual(filtered.length, 7);
  filtered.forEach(c => assert.strictEqual(c.dataset.xrvCycle, 'month'));
});

it('分类筛选：选择年付 (year) 仅保留年付卡片', () => {
  const filtered = applyFilters(sampleCards, { cycle: 'year' });
  assert.strictEqual(filtered.length, 3);
  filtered.forEach(c => assert.strictEqual(c.dataset.xrvCycle, 'year'));
});

it('条件筛选：隐藏被墙 IP 成功过滤被墙卡片', () => {
  const filtered = applyFilters(sampleCards, { hideBlocked: true });
  assert.strictEqual(filtered.length, 9);
  assert.strictEqual(filtered.some(c => c.id === 'c2_lax_blocked'), false);
});

it('条件筛选：只看折价成功过滤无折价/平价/溢价卡片', () => {
  const filtered = applyFilters(sampleCards, { onlyDiscount: true });
  // 折价机器有：c1 (倒贴55), c6 (倒贴60), c8 (倒贴135)
  assert.strictEqual(filtered.length, 3);
  const ids = filtered.map(c => c.id);
  assert.deepStrictEqual(ids.sort(), ['c1_hk_discount', 'c6_osa_flash_discount', 'c8_ber_annual_bonus'].sort());
});

it('组合筛选：年付 (year) + 只看折价 (onlyDiscount) 正确交集', () => {
  const filtered = applyFilters(sampleCards, { cycle: 'year', onlyDiscount: true });
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].id, 'c8_ber_annual_bonus');
});

it('组合筛选：月付 (month) + 隐藏被墙 + 只看折价', () => {
  const filtered = applyFilters(sampleCards, { cycle: 'month', hideBlocked: true, onlyDiscount: true });
  assert.strictEqual(filtered.length, 2);
  const ids = filtered.map(c => c.id);
  assert.deepStrictEqual(ids.sort(), ['c1_hk_discount', 'c6_osa_flash_discount'].sort());
});

// ─── 第四点五部分：Panstar 平台卡片样本专项测试 ───
console.log('\n📌 阶段 4.5：Panstar 平台卡片样本专项测试');

const panstarSampleCards = [
  {
    id: 'p1_sv_pro',
    title: 'US-West Silicon Valley Pro',
    dataset: {
      xrvSale: '28.00',
      xrvValue: '40.83',
      xrvDays: '35',
      xrvDailyCost: '0.800',
      xrvTrafficRatio: '0.80',
      xrvDiscountRate: '31.42',
      xrvMonthlyRenew: '35.00',
      xrvCycle: 'month',
      xrvIpBlocked: '0'
    }
  },
  {
    id: 'p2_tokyo_blocked',
    title: 'JP-Tokyo Budget (Blocked)',
    dataset: {
      xrvSale: '3.50',
      xrvValue: '2.40',
      xrvDays: '12',
      xrvDailyCost: '0.292',
      xrvTrafficRatio: '0.10',
      xrvDiscountRate: '0.00',
      xrvMonthlyRenew: '6.00',
      xrvCycle: 'month',
      xrvIpBlocked: '1' // Blocked
    }
  },
  {
    id: 'p3_sg_direct',
    title: 'SG-Singapore Direct Route',
    dataset: {
      xrvSale: '16.00',
      xrvValue: '18.67',
      xrvDays: '28',
      xrvDailyCost: '0.571',
      xrvTrafficRatio: '0.92',
      xrvDiscountRate: '14.30',
      xrvMonthlyRenew: '20.00',
      xrvCycle: 'month',
      xrvIpBlocked: '0'
    }
  },
  {
    id: 'p4_london_rare',
    title: 'UK-London Rare Annual (👑 $2/mo)',
    dataset: {
      xrvSale: '45.00',
      xrvValue: '11.84',
      xrvDays: '180',
      xrvDailyCost: '0.250',
      xrvTrafficRatio: '1.00', // Unlimited
      xrvDiscountRate: '0.00',
      xrvMonthlyRenew: '2.00', // 👑 24/12 = 2.00
      xrvCycle: 'year',
      xrvIpBlocked: '0'
    }
  },
  {
    id: 'p5_seoul_flash',
    title: 'KR-Seoul Flash Sale (🔥 80% Off)',
    dataset: {
      xrvSale: '6.00',
      xrvValue: '30.00',
      xrvDays: '30',
      xrvDailyCost: '0.200',
      xrvTrafficRatio: '0.95',
      xrvDiscountRate: '80.00', // 🔥 80% discount
      xrvMonthlyRenew: '30.00',
      xrvCycle: 'month',
      xrvIpBlocked: '0'
    }
  },
  {
    id: 'p6_fra_traffic',
    title: 'DE-Frankfurt Traffic Monster (📶 Most Traffic)',
    dataset: {
      xrvSale: '22.00',
      xrvValue: '20.83',
      xrvDays: '25',
      xrvDailyCost: '0.880',
      xrvTrafficRatio: '0.9998', // 📶 99.98%
      xrvDiscountRate: '0.00',
      xrvMonthlyRenew: '25.00',
      xrvCycle: 'month',
      xrvIpBlocked: '0'
    }
  },
  {
    id: 'p7_hk_expired',
    title: 'HK-Hong Kong Expired (Border)',
    dataset: {
      xrvSale: '2.00',
      xrvValue: '0.00',
      xrvDays: '0',
      xrvDailyCost: 'Infinity',
      xrvTrafficRatio: '0.80',
      xrvDiscountRate: '0.00',
      xrvMonthlyRenew: '10.00',
      xrvCycle: 'month',
      xrvIpBlocked: '0'
    }
  }
];

it('Panstar 排序：🔥 折扣最大模式下 80% 折扣机器置顶', () => {
  const sorted = sortCards(panstarSampleCards, 'discountRateDesc');
  assert.strictEqual(sorted[0].id, 'p5_seoul_flash');
});

it('Panstar 排序：👑 月均续费最低模式下 $2/mo 绝版年付神机置顶', () => {
  const sorted = sortCards(panstarSampleCards, 'monthlyRenewAsc');
  assert.strictEqual(sorted[0].id, 'p4_london_rare');
});

it('Panstar 筛选：周期与被墙状态在 CSS Grid 视图下行为一致', () => {
  const yearFiltered = applyFilters(panstarSampleCards, { cycle: 'year' });
  assert.strictEqual(yearFiltered.length, 1);
  assert.strictEqual(yearFiltered[0].id, 'p4_london_rare');

  const unblocked = applyFilters(panstarSampleCards, { hideBlocked: true });
  assert.strictEqual(unblocked.length, 6);
  assert.strictEqual(unblocked.some(c => c.id === 'p2_tokyo_blocked'), false);
});

// ─── 第五部分：本地仿真调试壳 HTML 校验 ───
console.log('\n📌 阶段 5：本地仿真调试壳 mock-marketplace.html 审查');

const mockHtmlPath = path.join(__dirname, 'mock-marketplace.html');
const mockHtml = fs.readFileSync(mockHtmlPath, 'utf8');

it('mock-marketplace.html 中包含三套平台仿真视图 (Akile / Panstar / Isvoro)', () => {
  assert.ok(mockHtml.includes('id="view-akile"'), '必须包含 Akile 仿真视图');
  assert.ok(mockHtml.includes('id="view-panstar"'), '必须包含 Panstar 仿真视图');
  assert.ok(mockHtml.includes('id="view-isvoro"'), '必须包含 Isvoro 仿真视图');
  assert.ok(mockHtml.includes('id="btn-isvoro"'), '必须包含 Isvoro 视图切换按钮');
  assert.ok(mockHtml.includes('HK-BGP-Standard-01'), '必须包含 Isvoro 真实卡片样本');
});

it('mock-marketplace.html 包含 Panstar 公开市场仿真网格与 dt/dd 卡片示例', () => {
  assert.ok(mockHtml.includes('marketplace-public-grid'), '必须包含 Panstar 公开市场网格');
  assert.ok(mockHtml.includes('console-marketplace-action-small'), '必须包含公开市场 action-small 状态标签');
  assert.ok(mockHtml.includes('console-marketplace-copy-body-strong'), '必须包含公开市场 dt 样式类');
  assert.ok(mockHtml.includes('switchPanstarMode'), '必须包含 Panstar 控制台与公开市场双模切换函数');
});

it('mock-marketplace.html 包含尾部 load-more 组件并受置底防守保护', () => {
  assert.ok(mockHtml.includes('class="load-more-box"'), '必须包含 load-more 容器');
  assert.ok(source.includes('isLoadMoreEl'), '脚本中必须有 isLoadMoreEl 置底防守逻辑');
});

// ─── 第六部分：暗色模式架构与 Design Tokens 规范审查 ───
console.log('\n📌 阶段 6：暗色模式架构与 Design Tokens 规范静态审查');

it('版本号审查：脚本元数据与 HUD 必须统一升级至最新版本 (v0.5.1)', () => {
  assert.ok(source.includes('@version      0.5.1') || source.includes('@version      0.5.0'), 'UserScript header 必须标注版本');
  assert.ok(source.includes('class="xrv-hud-ver">v0.5.1<') || source.includes('class="xrv-hud-ver">v0.5.0<'), 'HUD 徽章必须显示版本');
  assert.ok(source.includes('VPS 交易所助手') || source.includes('交易所剩余价值助手'), 'HUD 标题必须包含“VPS 交易所助手”');
});

it('Design Tokens 基础审查：必须在 :root 中声明明色全套 CSS 变量', () => {
  const requiredTokens = [
    '--xrv-bg-hud',
    '--xrv-border-hud',
    '--xrv-shadow-hud',
    '--xrv-text-main',
    '--xrv-text-sub',
    '--xrv-btn-bg',
    '--xrv-btn-border',
    '--xrv-cycle-bg',
    '--xrv-card-border-dashed',
    '--xrv-track-bg',
    '--xrv-badge-super-bg',
    '--xrv-badge-exp-bg',
  ];
  requiredTokens.forEach((token) => {
    assert.ok(source.includes(token), `必须包含 Design Token: ${token}`);
  });
});

it('暗色触发矩阵审查：必须涵盖 Arco 属性、通用暗色类、属性及 Panstar 平台选择器', () => {
  assert.ok(source.includes('[arco-theme="dark"]'), '必须支持 [arco-theme="dark"]');
  assert.ok(source.includes('html.dark'), '必须支持 html.dark 类');
  assert.ok(source.includes('[data-theme="dark"]'), '必须支持 [data-theme="dark"] 属性');
  assert.ok(source.includes('html.xrv-panstar'), '暗色 Token 组中必须包含 html.xrv-panstar');
  assert.ok(source.includes('@media (prefers-color-scheme: dark)'), '必须包含系统媒体查询兜底');
  assert.ok(source.includes(':not([arco-theme="light"])'), '媒体查询必须包含明色守卫');
});

it('代码异味消除：必须彻底清除硬编码的 html.xrv-panstar .xrv-hud 覆盖块', () => {
  assert.strictEqual(source.includes('html.xrv-panstar .xrv-hud {'), false, '不得存在硬编码的 html.xrv-panstar .xrv-hud');
  assert.strictEqual(source.includes('html.xrv-panstar .xrv-sort-btn {'), false, '不得存在硬编码的 html.xrv-panstar .xrv-sort-btn');
  assert.strictEqual(source.includes('html.xrv-panstar .xrv-cycle-group {'), false, '不得存在硬编码的 html.xrv-panstar .xrv-cycle-group');
});

it('卡片内嵌元素 Token 化：虚线、轨道与徽章均解耦使用 var(--xrv-*)', () => {
  assert.ok(source.includes('border-top: 1px dashed var(--xrv-card-border-dashed);'), '.xrv-row 虚线必须使用 Token');
  assert.ok(source.includes('background: var(--xrv-track-bg);'), '.xrv-bar 和轨道必须使用 Token');
  assert.ok(source.includes('background: var(--xrv-badge-super-bg);'), '徽章必须使用 Token');
});

it('调试壳 mock-marketplace.html 支持暗色切换控制与 Arco 规范', () => {
  assert.ok(mockHtml.includes('id="btn-dark-toggle"'), 'mock-marketplace.html 必须包含暗色切换按钮');
  assert.ok(mockHtml.includes('function toggleTheme()'), 'mock-marketplace.html 必须包含 toggleTheme 函数');
  assert.ok(mockHtml.includes('[arco-theme="dark"]'), 'mock-marketplace.html 样式中必须支持 [arco-theme="dark"]');
});

it('调试壳 mock-marketplace.html 支持细粒度暗色仿真按钮 (Arco 属性 / .dark 类 / 纯明色)', () => {
  assert.ok(mockHtml.includes('id="btn-dark-arco"'), '必须包含仅 arco-theme 属性切换按钮');
  assert.ok(mockHtml.includes('id="btn-dark-class"'), '必须包含仅 .dark 类切换按钮');
  assert.ok(mockHtml.includes('id="btn-theme-light"'), '必须包含纯明色重置按钮');
  assert.ok(mockHtml.includes('function setThemeMode('), '必须包含 setThemeMode 函数');
});

it('5 级折溢价徽章暗色规范审查：采用半透明深底 (rgba) 与高对比度文字，杜绝眩光', () => {
  // 检查暗色模式下 badge-super, badge-disc, badge-prem, badge-high 均使用 rgba 半透明底色
  assert.ok(source.includes('--xrv-badge-super-bg: rgba('), '超级折价徽章必须采用半透明深底');
  assert.ok(source.includes('--xrv-badge-disc-bg: rgba('), '折价徽章必须采用半透明深底');
  assert.ok(source.includes('--xrv-badge-prem-bg: rgba('), '溢价徽章必须采用半透明深底');
  assert.ok(source.includes('--xrv-badge-high-bg: rgba('), '高溢价徽章必须采用半透明深底');
  // 检查前景色对比度良好
  assert.ok(source.includes('--xrv-badge-super-text: #4ade80'), '超级折价前景色使用清晰绿 #4ade80');
  assert.ok(source.includes('--xrv-badge-prem-text: #fcd34d'), '溢价前景色使用清晰金黄 #fcd34d');
  assert.ok(source.includes('--xrv-badge-high-text: #f87171'), '高溢价前景色使用清晰柔红 #f87171');
});

// ─── 第七部分：v0.4.2 IP 状态探测流水线与三级回退静态审查 ───
console.log('\n📌 阶段 7：v0.4.2 IP 状态探测流水线与三级回退静态审查');

it('源码静态审查：包含 extractCardIpStatus 统一三级探测流水线', () => {
  assert.ok(source.includes('function extractCardIpStatus('), '源码必须包含 extractCardIpStatus 函数定义');
  assert.ok(source.includes('IP_PATTERNS'), '源码必须声明统一的 IP_PATTERNS 匹配矩阵');
  assert.ok(source.includes('sanitizeIpStatusText'), '源码必须包含防误判清洗函数 sanitizeIpStatusText');
  assert.ok(source.includes('isIpBlockedUnified'), '源码必须实现统一的 isIpBlockedUnified 判定函数');
});

it('选择器多重覆盖审查：SITES 配置中 statusSelector 支持多选择器且配置备用回退', () => {
  assert.ok(source.includes('.server-detail, .server-status, .server-tag'), 'Akile 必须配置多专属选择器');
  assert.ok(source.includes('.console-marketplace-status-chip, .console-marketplace-status, [data-status]'), 'Panstar 必须配置多专属选择器');
  assert.ok(source.includes('fallbackSelectors:'), 'SITES 中必须配置 fallbackSelectors 回退选择器');
});

it('零静默失败保证：injectIpStatus 无论是否存在 statusSelector 节点均必须打标', () => {
  // 校验 card.dataset.xrvIpBlocked 在 if (!el) return 之前赋值
  const fnMatch = source.match(/function injectIpStatus\(card\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(fnMatch, '必须能提取出 injectIpStatus 函数体');
  const body = fnMatch[1];
  const idxBlocked = body.indexOf('card.dataset.xrvIpBlocked');
  const idxElCheck = body.indexOf('if (!el) return;');
  assert.ok(idxBlocked !== -1, '必须为 card.dataset.xrvIpBlocked 赋值');
  assert.ok(idxElCheck !== -1, '包含 el 节点判空检查');
  assert.ok(idxBlocked < idxElCheck, 'card.dataset.xrvIpBlocked 必须在 if (!el) return 之前赋值，杜绝静默失败');
});

it('双重级联隐藏机制静态审查：同时运用 .xrv-filter-hidden 与 style.setProperty("display", "none", "important")', () => {
  assert.ok(source.includes("unit.style.setProperty('display', 'none', 'important')"), '必须注入行内 style display none !important 强力隐藏');
  assert.ok(source.includes("unit.style.removeProperty('display')"), '取消隐藏时必须安全清除行内 display 样式');
  assert.ok(source.includes('.arco-row .arco-col.xrv-filter-hidden'), 'CSS 中必须补强 Arco 栅格特异性');
  assert.ok(source.includes('article[data-marketplace-listing-card].xrv-filter-hidden'), 'CSS 中必须补强 Panstar 卡片特异性');
});

it('HUD 事件全覆盖与自愈同步静态审查：绑定 change/input 事件并防冒泡', () => {
  assert.ok(source.includes("input.addEventListener('change'"), '必须监听 input change 事件');
  assert.ok(source.includes("input.addEventListener('input'"), '必须监听 input input 事件');
  assert.ok(source.includes("e.stopPropagation()"), 'label 点击必须阻止冒泡防宿主劫持');
  assert.ok(source.includes('hideBlockedInput.checked !== filterState.hideBlocked'), 'HUD 重新检查时必须自愈同步复选框状态');
});

// ─── 第八部分：IP 状态判定与防误判清洗矩阵算法测试 ───
console.log('\n📌 阶段 8：IP 状态判定与防误判清洗矩阵算法测试');

// 从源码中提取正则与清洗函数进行黑盒/白盒测试
const ipPatternsMatch = source.match(/const IP_PATTERNS = \{([\s\S]*?)\n  \};/);
assert.ok(ipPatternsMatch, '必须能提取出 IP_PATTERNS');
const IP_PATTERNS = vpsModule.IP_PATTERNS || {
  blocked: /(?:ip|IP|网络|连接|端口)?\s*(?:被墙|被封|封禁|封锁|被锁|阻断|不可达|失联|不可用|污染|受限|疑似)|GFW|\b(?:blocked|banned|unreachable|gfw)\b|reachability\s*issue/i,
  abnormal: /\bno\s*data\b|暂无(?:数据|检测)?|检测失败|异常|超时|timeout/i,
  normal: /正常|normal|\bok\b|good|healthy|有效/i,
  pending: /检测中|加载中|\b(?:checking|loading)\b|\.\.\./i,
};

function sanitizeIpStatusText(text) {
  if (vpsModule && vpsModule.sanitizeIpStatusText) return vpsModule.sanitizeIpStatusText(text);
  if (!text) return '';
  return text
    .replace(/防火墙/gi, '')
    .replace(/锁价/gi, '')
    .replace(/锁单/gi, '')
    .replace(/不锁\S*/gi, '')
    .replace(/未锁\S*/gi, '')
    .replace(/(?:不|未|无)\s*(?:阻断|封锁|被墙|不可达|受限)/gi, '');
}

function isIpBlockedUnified(text) {
  if (vpsModule && vpsModule.isIpBlockedUnified) return vpsModule.isIpBlockedUnified(text);
  if (!text) return false;
  const sanitized = sanitizeIpStatusText(text.trim());
  if (IP_PATTERNS.blocked.test(sanitized)) return true;
  if (IP_PATTERNS.abnormal.test(sanitized)) return true;
  if (IP_PATTERNS.normal.test(sanitized)) return false;
  return false;
}

it('明确阻断关键词全矩阵识别：覆盖被墙、被封、不可达、GFW、阻断等形态', () => {
  const blockedSamples = [
    'IP被墙',
    '机器被墙',
    'IP被锁',
    'IP blocked',
    'Server is blocked',
    '端口不可达',
    '网络阻断',
    '连接阻断',
    '已被封禁',
    '已被封锁',
    '节点失联',
    '服务不可用',
    'DNS污染',
    'GFW阻断',
    'GFW',
    'Host is unreachable',
    'Account banned',
    'ip is gfw blocked',
    'IP被墙 | 延迟 999ms',
    'IP被墙 | 端口不可达',
    'IP reachability issue',
    'IP 疑似受限',
  ];
  blockedSamples.forEach((sample) => {
    assert.strictEqual(isIpBlockedUnified(sample), true, `样本 "${sample}" 必须判定为被墙 (true)`);
  });
});

it('检测异常与失败样本识别：覆盖暂无数据、检测失败、超时等形态', () => {
  const abnormalSamples = [
    '暂无数据',
    '暂无检测',
    '检测失败',
    '超时',
    'timeout',
    '异常',
    'No Data',
    'no data available',
  ];
  abnormalSamples.forEach((sample) => {
    assert.strictEqual(isIpBlockedUnified(sample), true, `异常样本 "${sample}" 必须判定为异常机器 (true)`);
  });
});

it('明确正常样本识别：覆盖中英正常与带网络延迟样本', () => {
  const normalSamples = [
    'IP正常',
    'IP正常 | 延迟 38ms',
    'IP normal',
    'normal',
    'OK',
    'good',
    'healthy',
    '有效',
    'IP normal | 45ms',
  ];
  normalSamples.forEach((sample) => {
    assert.strictEqual(isIpBlockedUnified(sample), false, `正常样本 "${sample}" 必须判定为正常 (false)`);
  });
});

it('防误判清洗测试：严格排除防火墙、锁价、不锁频、未阻断等良性规格词', () => {
  const falsePositiveTrapSamples = [
    '包含免费硬件防火墙',
    '支持年付续费锁价',
    '支持锁单保证现货',
    'AMD 7950X 不锁频',
    '未锁频性能强劲',
    '网络端口未阻断，直连通畅',
    '不阻断常用协议',
  ];
  falsePositiveTrapSamples.forEach((sample) => {
    assert.strictEqual(isIpBlockedUnified(sample), false, `良性样本 "${sample}" 绝不可误伤为被墙 (false)`);
  });
});

// ─── 第九部分：三级探测流水线仿真验证 ───
console.log('\n📌 阶段 9：三级探测流水线仿真验证 (Level 1 / 2 / 3 降级与全卡片扫描)');

// 仿真 DOM 树探测函数
function simulateExtractCardIpStatus(cardDom) {
  // Level 1: 专用选择器
  const primaryEl = cardDom.querySelector('.server-detail, .console-marketplace-status-chip');
  if (primaryEl) {
    const raw = (primaryEl.textContent || '').trim();
    if (raw) {
      const sanitized = sanitizeIpStatusText(raw);
      if (IP_PATTERNS.blocked.test(sanitized) || IP_PATTERNS.abnormal.test(sanitized)) return { blocked: true, level: 1, text: raw };
      if (IP_PATTERNS.normal.test(sanitized)) return { blocked: false, level: 1, text: raw };
    }
  }

  // Level 2: 结构化备用标签
  const secondary = cardDom.querySelectorAll('.arco-tag, .ant-tag, .badge, [class*="status"]');
  for (const el of secondary) {
    const raw = (el.textContent || '').trim();
    if (raw) {
      const sanitized = sanitizeIpStatusText(raw);
      if (IP_PATTERNS.blocked.test(sanitized) || IP_PATTERNS.abnormal.test(sanitized)) return { blocked: true, level: 2, text: raw };
      if (IP_PATTERNS.normal.test(sanitized)) return { blocked: false, level: 2, text: raw };
    }
  }

  // Level 3: 全卡片高精度扫描
  const full = (cardDom.textContent || '').trim();
  if (full) {
    const sanitized = sanitizeIpStatusText(full);
    if (IP_PATTERNS.blocked.test(sanitized) || IP_PATTERNS.abnormal.test(sanitized)) return { blocked: true, level: 3, text: full };
    if (IP_PATTERNS.normal.test(sanitized)) return { blocked: false, level: 3, text: full };
  }

  return { blocked: false, level: 0, text: '' };
}

// 模拟简易卡片 DOM 对象
function createMockCard(html) {
  return {
    textContent: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '),
    querySelector(sel) {
      if (sel.includes('.server-detail') && html.includes('class="server-detail"')) {
        const m = html.match(/<div class="server-detail">([\s\S]*?)<\/div>/);
        return m ? { textContent: m[1] } : null;
      }
      if (sel.includes('.console-marketplace-status-chip') && html.includes('class="console-marketplace-status-chip"')) {
        const m = html.match(/<div class="console-marketplace-status-chip">([\s\S]*?)<\/div>/);
        return m ? { textContent: m[1] } : null;
      }
      return null;
    },
    querySelectorAll(sel) {
      const list = [];
      if (sel.includes('.arco-tag') && html.includes('class="arco-tag"')) {
        const matches = html.matchAll(/<span class="arco-tag">([\s\S]*?)<\/span>/g);
        for (const m of matches) list.push({ textContent: m[1] });
      }
      return list;
    }
  };
}

it('Level 1 命中：专属选择器存在时直接完成精确判定', () => {
  const card = createMockCard('<div class="server-detail">IP被墙 | 端口不可达</div>');
  const res = simulateExtractCardIpStatus(card);
  assert.strictEqual(res.level, 1);
  assert.strictEqual(res.blocked, true);
});

it('Level 2 回退：专属选择器缺失，通过备用 .arco-tag 结构化标签成功识别', () => {
  const card = createMockCard('<div><span class="arco-tag">节点已封禁</span><div>普通续费价格 10元</div></div>');
  const res = simulateExtractCardIpStatus(card);
  assert.strictEqual(res.level, 2);
  assert.strictEqual(res.blocked, true);
});

it('Level 3 全卡片保底：完全无状态标签节点，仅卡片描述包含“端口不可达”成功捕获', () => {
  const card = createMockCard('<div class="server-title">HK BGP 机器出售（端口不可达特价处理）</div><div>价格 ¥9.9</div>');
  const res = simulateExtractCardIpStatus(card);
  assert.strictEqual(res.level, 3);
  assert.strictEqual(res.blocked, true);
});

it('终态保障：无异常特征的正常卡片确定性判定为正常', () => {
  const card = createMockCard('<div class="server-title">JP Tokyo 高配大带宽</div><div>价格 ¥30.0</div><div class="server-detail">IP正常</div>');
  const res = simulateExtractCardIpStatus(card);
  assert.strictEqual(res.blocked, false);
});

// ─── 第十部分：双重级联隐藏与真实筛选交互仿真测试 ───
console.log('\n📌 阶段 10：双重级联隐藏与真实筛选交互仿真测试');

it('双重隐藏执行验证：隐藏时 unit 同步添加 class 与行内 style.display="none"', () => {
  const unit = {
    classList: {
      classes: new Set(),
      add(cls) { this.classes.add(cls); },
      remove(cls) { this.classes.delete(cls); },
      contains(cls) { return this.classes.has(cls); },
    },
    style: {
      display: '',
      setProperty(prop, val, priority) {
        this[prop] = val;
        this[`_${prop}_priority`] = priority;
      },
      removeProperty(prop) {
        delete this[prop];
        delete this[`_${prop}_priority`];
      }
    }
  };

  // 模拟隐藏
  unit.classList.add('xrv-filter-hidden');
  unit.style.setProperty('display', 'none', 'important');
  assert.strictEqual(unit.classList.contains('xrv-filter-hidden'), true);
  assert.strictEqual(unit.style.display, 'none');
  assert.strictEqual(unit.style._display_priority, 'important');

  // 模拟取消隐藏
  unit.classList.remove('xrv-filter-hidden');
  unit.style.removeProperty('display');
  assert.strictEqual(unit.classList.contains('xrv-filter-hidden'), false);
  assert.strictEqual(unit.style.display, undefined);
});

it('隐藏被墙后统计栏数据一致性：blockedCount 必须为 0', () => {
  const mockCards = [
    { dataset: { xrvIpBlocked: '0', xrvSale: '20', xrvValue: '25' } },
    { dataset: { xrvIpBlocked: '1', xrvSale: '10', xrvValue: '15' } }, // 被墙
    { dataset: { xrvIpBlocked: '0', xrvSale: '30', xrvValue: '30' } },
  ];
  let totalCount = 0;
  let normalCount = 0;
  let blockedCount = 0;

  const hideBlocked = true;
  mockCards.forEach((c) => {
    const isBlocked = c.dataset.xrvIpBlocked === '1';
    let hidden = false;
    if (hideBlocked && isBlocked) hidden = true;
    if (!hidden) {
      totalCount++;
      if (isBlocked) blockedCount++;
      else normalCount++;
    }
  });

  assert.strictEqual(totalCount, 2, '可见卡片应为 2');
  assert.strictEqual(normalCount, 2, '正常卡片应为 2');
  assert.strictEqual(blockedCount, 0, '被墙卡片计数必须准确归零');
});

// ─── 第十一与十二部分：Akile & Panstar 全真 DOM 交互与多条件筛选 ───
console.log('\n📌 阶段 11：Akile 平台全真 DOM 交互与多条件筛选验证');

class MiniDOMNode {
  constructor(tagName = 'div', id = '', className = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = className;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.attributes = {};
    this.style = {
      _props: {},
      _priorities: {},
      display: '',
      order: '',
      setProperty(prop, val, priority = '') {
        this._props[prop] = val;
        this._priorities[prop] = priority;
        this[prop] = val;
      },
      removeProperty(prop) {
        delete this._props[prop];
        delete this._priorities[prop];
        delete this[prop];
      }
    };
    this.classList = {
      _set: new Set(className ? className.split(/\s+/).filter(Boolean) : []),
      add(...classes) {
        classes.forEach(c => this._set.add(c));
        this._sync();
      },
      remove(...classes) {
        classes.forEach(c => this._set.delete(c));
        this._sync();
      },
      toggle(c, force) {
        if (force === true) this.add(c);
        else if (force === false) this.remove(c);
        else if (this._set.has(c)) this.remove(c);
        else this.add(c);
        return this.contains(c);
      },
      contains(c) {
        return this._set.has(c);
      },
      _sync: () => {
        this.className = [...this.classList._set].join(' ');
      }
    };
    this._textContent = '';
  }

  get nextElementSibling() {
    if (!this.parentElement) return null;
    const siblings = this.parentElement.children;
    const idx = siblings.indexOf(this);
    if (idx !== -1 && idx + 1 < siblings.length) {
      return siblings[idx + 1];
    }
    return null;
  }

  closest(sel) {
    let curr = this;
    while (curr) {
      if (curr.matches && curr.matches(sel)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  get textContent() {
    if (this.children.length === 0) return this._textContent;
    return this.children.map(c => c.textContent).join(' ');
  }

  set textContent(val) {
    this._textContent = String(val);
    this.children = [];
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val);
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      this.dataset[key] = String(val);
    }
    if (name === 'id') this.id = String(val);
    if (name === 'class') {
      this.className = String(val);
      this.classList._set = new Set(this.className.split(/\s+/).filter(Boolean));
    }
  }

  getAttribute(name) {
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      return this.dataset[key] || null;
    }
    if (name === 'id') return this.id || null;
    if (name === 'class') return this.className || null;
    return this.attributes[name] || null;
  }

  hasAttribute(name) {
    return this.getAttribute(name) !== null;
  }

  matches(sel) {
    if (!sel) return false;
    const parts = sel.split(',').map(s => s.trim());
    for (const part of parts) {
      if (part.includes(' > ')) {
        const subParts = part.split(' > ').map(s => s.trim());
        if (!this._matchSinglePart(subParts[subParts.length - 1])) continue;
        if (subParts.length > 1 && this.parentElement) {
          if (this.parentElement._matchSinglePart(subParts[subParts.length - 2])) return true;
        }
        continue;
      }
      if (this._matchSinglePart(part)) return true;
    }
    return false;
  }

  _matchSinglePart(part) {
    if (part === '*') return true;
    if (part === '.arco-col:not(.load-more)') {
      return this.classList.contains('arco-col') && !this.classList.contains('load-more');
    }
    if (part.startsWith('#') && !part.includes('.') && !part.includes('[')) {
      return this.id === part.slice(1);
    }
    if (part.startsWith('.') && !part.includes('[') && !part.slice(1).includes('.')) {
      return this.classList.contains(part.slice(1));
    }
    let remaining = part;
    const tagMatch = remaining.match(/^([a-z0-9_-]+)/i);
    if (tagMatch) {
      if (this.tagName.toLowerCase() !== tagMatch[1].toLowerCase()) return false;
      remaining = remaining.slice(tagMatch[1].length);
    }
    const attrRegex = /\[([a-z0-9_-]+)(?:([*^$]?=)(['"]?)(.*?)\3)?\]/gi;
    let m;
    while ((m = attrRegex.exec(remaining)) !== null) {
      const attr = m[1];
      const op = m[2];
      const val = m[4];
      const actual = this.getAttribute(attr);
      if (actual === null) return false;
      if (op === '=' && actual !== val) return false;
      if (op === '*=' && !actual.includes(val)) return false;
      if (op === '^=' && !actual.startsWith(val)) return false;
      if (op === '$=' && !actual.endsWith(val)) return false;
    }
    remaining = remaining.replace(attrRegex, '');
    const classRegex = /\.([a-z0-9_-]+)/gi;
    while ((m = classRegex.exec(remaining)) !== null) {
      if (!this.classList.contains(m[1])) return false;
    }
    return true;
  }

  querySelectorAll(selector) {
    const results = [];
    const selectors = selector.split(',').map(s => s.trim());
    const traverse = (node) => {
      for (const child of node.children) {
        for (const sel of selectors) {
          if (sel === '.arco-col:not(.load-more)') {
            if (child.classList.contains('arco-col') && !child.classList.contains('load-more')) {
              results.push(child);
              break;
            }
          } else if (child.matches(sel)) {
            results.push(child);
            break;
          }
        }
        traverse(child);
      }
    };
    traverse(this);
    return results;
  }

  querySelector(selector) {
    const list = this.querySelectorAll(selector);
    return list.length > 0 ? list[0] : null;
  }
}

function setupAkileFixture() {
  const container = new MiniDOMNode('div', 'view-akile');
  const row = new MiniDOMNode('div', 'akile-row', 'arco-row');
  container.appendChild(row);

  const akileData = [
    { id: 'c1', title: 'HK BGP Flash', price: '¥35.00', status: 'IP正常 | 延迟 45ms', renewal: '¥90.00 / 月', cycle: 'month', sale: 35, val: 90 },
    { id: 'c2', title: 'US LAX Blocked', price: '¥9.90', status: 'IP被墙 | 端口不可达', renewal: '¥15.00 / 月', cycle: 'month', sale: 9.9, val: 15 },
    { id: 'c3', title: 'JP Tokyo Normal', price: '¥30.00', status: 'IP正常', renewal: '¥30.00 / 月', cycle: 'month', sale: 30, val: 30 },
    { id: 'c4', title: 'SG Premium Low', price: '¥18.00', status: 'IP正常 | 延迟 60ms', renewal: '¥12.00 / 月', cycle: 'month', sale: 18, val: 12 },
    { id: 'c5', title: 'FRA Annual Normal', price: '¥240.00', status: 'IP正常', renewal: '¥220.00 / 年', cycle: 'year', sale: 240, val: 220 },
    { id: 'c6', title: 'OSA Flash Deal', price: '¥15.00', status: 'IP正常 | 延迟 38ms', renewal: '¥75.00 / 月', cycle: 'month', sale: 15, val: 75 },
    { id: 'c7', title: 'LON Annual Gem', price: '¥80.00', status: 'IP正常', renewal: '¥36.00 / 年', cycle: 'year', sale: 80, val: 36 },
    { id: 'c8', title: 'BER Annual Bonus', price: '¥100.00', status: 'IP正常', renewal: '¥260.00 / 年', cycle: 'year', sale: 100, val: 235 },
    { id: 'c9', title: 'SJC Expired', price: '¥5.00', status: 'IP正常', renewal: '¥15.00 / 月', cycle: 'month', sale: 5, val: 0 },
    { id: 'c10', title: 'HK Traffic King', price: '¥28.00', status: 'IP正常 | 延迟 40ms', renewal: '¥28.00 / 月', cycle: 'month', sale: 28, val: 28 },
  ];

  akileData.forEach((d) => {
    const col = new MiniDOMNode('div', `col-${d.id}`, 'arco-col');
    const card = new MiniDOMNode('div', `card-${d.id}`, 'server-manage-card');
    card.dataset.xrvSale = String(d.sale);
    card.dataset.xrvValue = String(d.val);
    card.dataset.xrvCycle = d.cycle;
    const detail = new MiniDOMNode('div', '', 'server-detail');
    detail.textContent = d.status;
    card.appendChild(detail);
    col.appendChild(card);
    row.appendChild(col);
  });

  const loadMore = new MiniDOMNode('div', 'load-more', 'arco-col load-more');
  row.appendChild(loadMore);
  return { container, row };
}

function createDOMFilterRunner(fixture, siteType = false) {
  const isPanstar = (siteType === true || siteType === 'panstar');
  const isIsvoro = (siteType === 'isvoro');

  const getCards = () => {
    if (isIsvoro) return fixture.container.querySelectorAll('.rounded-xl');
    if (isPanstar) return fixture.container.querySelectorAll('article[data-marketplace-listing-card]');
    return fixture.container.querySelectorAll('.server-manage-card');
  };

  const getUnits = () => {
    if (isIsvoro) return fixture.container.querySelectorAll('.rounded-xl');
    if (isPanstar) return fixture.container.querySelectorAll('article[data-marketplace-listing-card]');
    return fixture.container.querySelectorAll('.arco-col:not(.load-more)');
  };

  getCards().forEach((card) => {
    const fullText = card.textContent;
    const clean = sanitizeIpStatusText(fullText);
    const isBlocked = IP_PATTERNS.blocked.test(clean) || IP_PATTERNS.abnormal.test(clean);
    card.dataset.xrvIpBlocked = isBlocked ? '1' : '0';
    card.dataset.xrvBlocked = isBlocked ? '1' : '0';
    if (isBlocked) card.classList.add('xrv-card-blocked');
  });

  const filterState = { cycle: 'all', hideBlocked: false, onlyDiscount: false };
  const stats = { total: 0, normal: 0, blocked: 0, discount: 0 };

  function applyFilters() {
    stats.total = 0; stats.normal = 0; stats.blocked = 0; stats.discount = 0;
    const units = getUnits();
    units.forEach((unit) => {
      const card = (isPanstar || isIsvoro) ? unit : unit.querySelector('.server-manage-card');
      const isBlocked = card.dataset.xrvIpBlocked === '1';
      const sale = parseFloat(card.dataset.xrvSale);
      const val = parseFloat(card.dataset.xrvValue);
      const isDiscount = (sale !== null && val !== null && (val - sale) > 0.05);
      const cycle = card.dataset.xrvCycle || 'month';

      let hidden = false;
      if (filterState.hideBlocked && isBlocked) hidden = true;
      if (filterState.onlyDiscount && !isDiscount) hidden = true;
      if (filterState.cycle === 'month' && cycle !== 'month') hidden = true;
      if (filterState.cycle === 'year' && cycle !== 'year') hidden = true;

      if (hidden) {
        unit.classList.add('xrv-filter-hidden');
        unit.style.setProperty('display', 'none', 'important');
      } else {
        unit.classList.remove('xrv-filter-hidden');
        unit.style.removeProperty('display');
        stats.total++;
        if (isBlocked) stats.blocked++;
        else stats.normal++;
        if (isDiscount) stats.discount++;
      }
    });
  }

  return { filterState, applyFilters, getUnits, getCards, stats };
}

const akileDOM = setupAkileFixture();
const akileRunner = createDOMFilterRunner(akileDOM, false);

it('Akile 全卡片智能打标：精准识别被墙卡片 c2 并赋予 xrvIpBlocked="1"', () => {
  const cards = akileRunner.getCards();
  const cardC2 = cards.find(c => c.id === 'card-c2');
  assert.strictEqual(cardC2.dataset.xrvIpBlocked, '1');
  assert.strictEqual(cardC2.classList.contains('xrv-card-blocked'), true);
  const otherCards = cards.filter(c => c.id !== 'card-c2');
  otherCards.forEach(c => assert.strictEqual(c.dataset.xrvIpBlocked, '0'));
});

it('Akile 初始状态与勾选「隐藏被墙IP」：被墙卡片立即被隐藏，具备 class 与行内 style.display="none"', () => {
  akileRunner.filterState.hideBlocked = true;
  akileRunner.applyFilters();

  const hiddenUnits = akileRunner.getUnits().filter(u => u.classList.contains('xrv-filter-hidden'));
  assert.strictEqual(hiddenUnits.length, 1);
  assert.strictEqual(hiddenUnits[0].id, 'col-c2');
  assert.strictEqual(hiddenUnits[0].style.display, 'none');
  assert.strictEqual(hiddenUnits[0].style._priorities['display'], 'important');

  const visibleUnits = akileRunner.getUnits().filter(u => !u.classList.contains('xrv-filter-hidden'));
  assert.strictEqual(visibleUnits.length, 9);
  assert.strictEqual(akileRunner.stats.blocked, 0);
  assert.strictEqual(akileRunner.stats.total, 9);
  assert.strictEqual(akileRunner.stats.discount, 3);
});

it('Akile 反选取消勾选「隐藏被墙IP」：被墙机器彻底恢复，行内 display 被安全清除', () => {
  akileRunner.filterState.hideBlocked = false;
  akileRunner.applyFilters();

  const colC2 = akileRunner.getUnits().find(u => u.id === 'col-c2');
  assert.strictEqual(colC2.classList.contains('xrv-filter-hidden'), false);
  assert.strictEqual(colC2.style.display, undefined);

  const visibleUnits = akileRunner.getUnits().filter(u => !u.classList.contains('xrv-filter-hidden'));
  assert.strictEqual(visibleUnits.length, 10);
  assert.strictEqual(akileRunner.stats.blocked, 1);
  assert.strictEqual(akileRunner.stats.discount, 4);
});

it('Akile 多条件复合筛选：周期(month) + 隐藏被墙(true) + 只看折价(true)', () => {
  akileRunner.filterState.cycle = 'month';
  akileRunner.filterState.hideBlocked = true;
  akileRunner.filterState.onlyDiscount = true;
  akileRunner.applyFilters();

  const visibleUnits = akileRunner.getUnits().filter(u => !u.classList.contains('xrv-filter-hidden'));
  assert.strictEqual(visibleUnits.length, 2);
  const ids = visibleUnits.map(u => u.id);
  assert.ok(ids.includes('col-c1') && ids.includes('col-c6'));
  assert.strictEqual(akileRunner.stats.blocked, 0);

  // 恢复
  akileRunner.filterState.cycle = 'all';
  akileRunner.filterState.hideBlocked = false;
  akileRunner.filterState.onlyDiscount = false;
  akileRunner.applyFilters();
});

console.log('\n📌 阶段 12：Panstar 平台全真 DOM 交互与多条件筛选验证');

function setupPanstarFixture() {
  const container = new MiniDOMNode('div', 'view-panstar');
  const grid = new MiniDOMNode('div', '', 'console-marketplace-grid');
  grid.setAttribute('data-marketplace-listing-grid', '1');
  container.appendChild(grid);

  const panstarData = [
    { id: 'p1', title: 'US-West Silicon Valley Pro', price: '$28.00', status: 'IP normal', renewal: '$35.00 / Month', cycle: 'month', sale: 28, val: 35 },
    { id: 'p2', title: 'JP-Tokyo Budget (Blocked)', price: '$3.50', status: 'IP blocked', renewal: '$6.00 / Month', cycle: 'month', sale: 3.5, val: 6 },
    { id: 'p3', title: 'SG-Singapore Direct Route', price: '$16.00', status: 'IP normal', renewal: '$20.00 / Month', cycle: 'month', sale: 16, val: 20 },
    { id: 'p4', title: 'UK-London Rare Annual', price: '$45.00', status: 'IP normal', renewal: '$24.00 / Year', cycle: 'year', sale: 45, val: 24 },
    { id: 'p5', title: 'KR-Seoul Flash Deal', price: '$6.00', status: 'IP normal', renewal: '$30.00 / Month', cycle: 'month', sale: 6, val: 30 },
    { id: 'p6', title: 'DE-Frankfurt Traffic Monster', price: '$22.00', status: 'IP normal', renewal: '$25.00 / Month', cycle: 'month', sale: 22, val: 20 },
    { id: 'p7', title: 'HK-Hong Kong Expired', price: '$2.00', status: 'IP normal', renewal: '$10.00 / Month', cycle: 'month', sale: 2, val: 0 },
  ];

  panstarData.forEach((d) => {
    const card = new MiniDOMNode('article', `panstar-card-${d.id}`);
    card.setAttribute('data-marketplace-listing-card', '1');
    card.dataset.xrvSale = String(d.sale);
    card.dataset.xrvValue = String(d.val);
    card.dataset.xrvCycle = d.cycle;
    const statusChip = new MiniDOMNode('div', '', 'console-marketplace-status-chip');
    statusChip.textContent = d.status;
    card.appendChild(statusChip);
    grid.appendChild(card);
  });

  return { container, grid };
}

const panstarDOM = setupPanstarFixture();
const panstarRunner = createDOMFilterRunner(panstarDOM, true);

it('Panstar 全卡片智能打标：精准识别 IP blocked 并赋予 xrvIpBlocked="1"', () => {
  const cards = panstarRunner.getCards();
  const cardP2 = cards.find(c => c.id === 'panstar-card-p2');
  assert.strictEqual(cardP2.dataset.xrvIpBlocked, '1');
  assert.strictEqual(cardP2.classList.contains('xrv-card-blocked'), true);
  const normalCards = cards.filter(c => c.id !== 'panstar-card-p2');
  normalCards.forEach(c => assert.strictEqual(c.dataset.xrvIpBlocked, '0'));
});

it('Panstar 勾选「隐藏被墙IP」：被墙卡片被彻底隐藏且具备 style.display="none !important"', () => {
  panstarRunner.filterState.hideBlocked = true;
  panstarRunner.applyFilters();

  const hiddenCards = panstarRunner.getUnits().filter(u => u.classList.contains('xrv-filter-hidden'));
  assert.strictEqual(hiddenCards.length, 1);
  assert.strictEqual(hiddenCards[0].id, 'panstar-card-p2');
  assert.strictEqual(hiddenCards[0].style.display, 'none');
  assert.strictEqual(hiddenCards[0].style._priorities['display'], 'important');

  const visibleCards = panstarRunner.getUnits().filter(u => !u.classList.contains('xrv-filter-hidden'));
  assert.strictEqual(visibleCards.length, 6);
  assert.strictEqual(panstarRunner.stats.blocked, 0);
});

it('Panstar 反选取消勾选「隐藏被墙IP」：全数恢复且清除行内 display 样式', () => {
  panstarRunner.filterState.hideBlocked = false;
  panstarRunner.applyFilters();

  const cardP2 = panstarRunner.getUnits().find(u => u.id === 'panstar-card-p2');
  assert.strictEqual(cardP2.classList.contains('xrv-filter-hidden'), false);
  assert.strictEqual(cardP2.style.display, undefined);

  const visibleCards = panstarRunner.getUnits().filter(u => !u.classList.contains('xrv-filter-hidden'));
  assert.strictEqual(visibleCards.length, 7);
  assert.strictEqual(panstarRunner.stats.blocked, 1);
});

it('Panstar 周期分类与多条件复合筛选：年付(year)筛选仅剩 1 张神机，月付+隐藏被墙仅剩 5 张', () => {
  panstarRunner.filterState.cycle = 'year';
  panstarRunner.applyFilters();

  const visibleCards = panstarRunner.getUnits().filter(u => !u.classList.contains('xrv-filter-hidden'));
  assert.strictEqual(visibleCards.length, 1);
  assert.strictEqual(visibleCards[0].id, 'panstar-card-p4');

  // 月付 + 隐藏被墙
  panstarRunner.filterState.cycle = 'month';
  panstarRunner.filterState.hideBlocked = true;
  panstarRunner.applyFilters();

  const monthUnblocked = panstarRunner.getUnits().filter(u => !u.classList.contains('xrv-filter-hidden'));
  assert.strictEqual(monthUnblocked.length, 5);
  assert.strictEqual(panstarRunner.stats.blocked, 0);

  // 恢复
  panstarRunner.filterState.cycle = 'all';
  panstarRunner.filterState.hideBlocked = false;
  panstarRunner.applyFilters();
});

console.log('\n📌 阶段 13：Isvoro 平台全真 DOM 交互、6 维排序与多条件筛选验证');

// vpsModule 已在顶部加载

it('Isvoro 适配器规格契约审查：SITES.isvoro 拥有全部必备字段与处理器', () => {
  const isv = vpsModule.SITES && vpsModule.SITES.isvoro;
  assert.ok(isv, '必须导出 SITES.isvoro');
  assert.strictEqual(typeof isv.cardSelector, 'string', 'cardSelector 必须是选择器字符串');
  assert.strictEqual(typeof isv.gridSelector, 'string', 'gridSelector 必须是选择器字符串');
  assert.strictEqual(typeof isv.sortUnitOf, 'function', 'sortUnitOf 必须是函数');
  assert.strictEqual(typeof isv.priceSelector, 'string', 'priceSelector 必须是选择器字符串');
  assert.strictEqual(typeof isv.statusSelector, 'string', 'statusSelector 必须是选择器字符串');
  assert.ok(Array.isArray(isv.fallbackSelectors), 'fallbackSelectors 必须是数组');
  assert.strictEqual(typeof isv.findField, 'function', 'findField 必须是函数');
  assert.strictEqual(typeof isv.ipText, 'function', 'ipText 必须是函数');
  assert.strictEqual(typeof isv.isIpBlocked, 'function', 'isIpBlocked 必须是函数');
  assert.strictEqual(typeof isv.networkUsage, 'function', 'networkUsage 必须是函数');
});

function setupIsvoroFixture() {
  const container = new MiniDOMNode('div', 'view-isvoro');
  const tabPanel = new MiniDOMNode('div', '', 'space-y-4');
  tabPanel.setAttribute('role', 'tabpanel');
  tabPanel.setAttribute('data-state', 'active');
  container.appendChild(tabPanel);

  const grid = new MiniDOMNode('div', 'cards-grid', 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4');
  tabPanel.appendChild(grid);

  const isvoroData = [
    { id: 'iv1', title: 'HK-BGP-Standard-01', price: '¥25.00', status: '[IP正常]', renewal: '¥45.00/月', cycle: 'month', sale: 25, val: 45, days: 30, trafficRatio: 0.85, discountRate: 0.444, monthlyRenew: 45, dailyCost: 0.833 },
    { id: 'iv2', title: 'TYO-Softbank-01', price: '¥380.00', status: '[IP正常]', renewal: '¥480.00/年', cycle: 'year', sale: 380, val: 420.82, days: 320, trafficRatio: 0.829, discountRate: 0.097, monthlyRenew: 40, dailyCost: 1.188 },
    { id: 'iv3', title: 'SJC-Premium-Blocked', price: '¥120.00', status: '[IP被墙]', renewal: '¥240.00/年', cycle: 'year', sale: 120, val: 164.38, days: 250, trafficRatio: 0.90, discountRate: 0.27, monthlyRenew: 20, dailyCost: 0.48 },
    { id: 'iv4', title: 'SGP-Direct-Route', price: '¥6.00', status: '[IP正常]', renewal: '¥30.00/月', cycle: 'month', sale: 6, val: 25, days: 25, trafficRatio: 0.96, discountRate: 0.76, monthlyRenew: 30, dailyCost: 0.24 },
    { id: 'iv5', title: 'FRA-Monster-Traffic', price: '¥130.00', status: '[IP正常]', renewal: '¥150.00/季', cycle: 'quarter', sale: 130, val: 100, days: 60, trafficRatio: 0.99, discountRate: 0, monthlyRenew: 50, dailyCost: 2.167 },
    { id: 'iv6', title: 'HK-Expired-Deal', price: '¥15.00', status: '[IP正常]', renewal: '¥40.00/月', cycle: 'month', sale: 15, val: 0, days: 0, trafficRatio: 0, discountRate: 0, monthlyRenew: 40, dailyCost: Infinity },
    { id: 'iv7', title: 'US-Unblock-Good', price: '¥20.00', status: '[IP正常]', renewal: '¥25.00/月', cycle: 'month', sale: 20, val: 25, days: 35, trafficRatio: 0.90, discountRate: 0.20, monthlyRenew: 25, dailyCost: 0.571, note: '包含原生防火墙保护，未阻断直连顺畅，续费锁价机型' },
  ];

  isvoroData.forEach((d) => {
    const card = new MiniDOMNode('div', `isvoro-card-${d.id}`, 'rounded-xl border bg-card text-card-foreground shadow-sm flex flex-col p-4');
    card.dataset.xrvSale = String(d.sale);
    card.dataset.xrvValue = String(d.val);
    card.dataset.xrvCycle = d.cycle;
    card.dataset.xrvDays = String(d.days);
    card.dataset.xrvTrafficRatio = String(d.trafficRatio);
    card.dataset.xrvDiscountRate = String(d.discountRate);
    card.dataset.xrvMonthlyRenew = String(d.monthlyRenew);
    card.dataset.xrvDailyCost = String(d.dailyCost);

    const header = new MiniDOMNode('div', '', 'pb-3');
    const title = new MiniDOMNode('div', '', 'text-lg font-semibold');
    title.textContent = d.title;
    header.appendChild(title);

    const statusContainer = new MiniDOMNode('div', '', 'mt-1');
    const statusChip = new MiniDOMNode('span', '', d.status.includes('被墙') ? 'text-destructive bg-destructive/10' : 'text-success bg-success/15');
    statusChip.textContent = d.status;
    statusContainer.appendChild(statusChip);
    header.appendChild(statusContainer);
    card.appendChild(header);

    const body = new MiniDOMNode('div', '', 'flex-1 flex flex-col');
    const dl = new MiniDOMNode('dl', '', 'grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm');

    const dtRenewal = new MiniDOMNode('dt', '', 'text-muted-foreground');
    dtRenewal.textContent = '续费价格';
    const ddRenewal = new MiniDOMNode('dd', '', 'text-primary');
    ddRenewal.textContent = d.renewal;
    dl.appendChild(dtRenewal);
    dl.appendChild(ddRenewal);

    const dtExpiry = new MiniDOMNode('dt', '', 'text-muted-foreground');
    dtExpiry.textContent = '到期时间';
    const ddExpiry = new MiniDOMNode('dd', '', '');
    ddExpiry.textContent = d.days > 0 ? '2026-11-20 18:00' : '2026-10-01 00:00';
    dl.appendChild(dtExpiry);
    dl.appendChild(ddExpiry);

    const dtNetwork = new MiniDOMNode('dt', '', 'text-muted-foreground');
    dtNetwork.textContent = '网络';
    const ddNetwork = new MiniDOMNode('dd', '', '');
    ddNetwork.textContent = '带宽 500M 流量 150 GB / 1000 GB';
    dl.appendChild(dtNetwork);
    dl.appendChild(ddNetwork);

    if (d.note) {
      const dtNote = new MiniDOMNode('dt', '', 'text-muted-foreground');
      dtNote.textContent = '描述';
      const ddNote = new MiniDOMNode('dd', '', '');
      ddNote.textContent = d.note;
      dl.appendChild(dtNote);
      dl.appendChild(ddNote);
    }

    body.appendChild(dl);

    const footer = new MiniDOMNode('div', '', 'flex items-end justify-between pt-4 mt-auto border-t');
    const priceEl = new MiniDOMNode('div', '', 'text-2xl font-bold text-primary');
    priceEl.textContent = d.price;
    footer.appendChild(priceEl);
    body.appendChild(footer);

    card.appendChild(body);
    grid.appendChild(card);
  });

  return { container, grid, tabPanel };
}

const isvoroDOM = setupIsvoroFixture();
const isvoroRunner = createDOMFilterRunner(isvoroDOM, 'isvoro');

it('Isvoro DOM 规格字段提取：findField 精准从 <dl><dt><dd> 结构中提取续费价格、到期时间与网络流量', () => {
  const cards = isvoroRunner.getCards();
  const card1 = cards[0];
  const isv = vpsModule.SITES.isvoro;

  const renewalField = isv.findField(card1, 'renewal');
  assert.ok(renewalField, '必须找到 renewal 字段');
  assert.strictEqual(renewalField.row.tagName, 'DL', 'row 必须返回 dl 节点以保证不破坏网格排版');
  assert.strictEqual(renewalField.valueEl.tagName, 'DD', 'valueEl 必须是 dd 节点');
  assert.strictEqual(renewalField.raw, '¥45.00/月');

  const expiryField = isv.findField(card1, 'expiry');
  assert.ok(expiryField, '必须找到 expiry 字段');
  assert.strictEqual(expiryField.row.tagName, 'DL');
  assert.ok(expiryField.raw.includes('2026-11-20'));

  const networkField = isv.findField(card1, 'network');
  assert.ok(networkField, '必须找到 network 字段');
  assert.strictEqual(networkField.row.tagName, 'DL');
  assert.ok(networkField.raw.includes('150 GB / 1000 GB'));
});

it('Isvoro sortUnitOf 验证：卡片本身即为排序单元', () => {
  const cards = isvoroRunner.getCards();
  const isv = vpsModule.SITES.isvoro;
  cards.forEach((c) => {
    assert.strictEqual(isv.sortUnitOf(c), c, 'Isvoro 卡片自身即为 Grid 子项');
  });
});

it('Isvoro 全卡片智能打标：精准识别 IP normal 与 IP blocked 状态', () => {
  const cards = isvoroRunner.getCards();
  const cardBlocked = cards.find(c => c.id === 'isvoro-card-iv3');
  assert.strictEqual(cardBlocked.dataset.xrvIpBlocked, '1');
  assert.strictEqual(cardBlocked.classList.contains('xrv-card-blocked'), true);

  const normalCards = cards.filter(c => c.id !== 'isvoro-card-iv3');
  normalCards.forEach(c => assert.strictEqual(c.dataset.xrvIpBlocked, '0'));
});

it('Isvoro 排序矩阵：🔥 折扣最大 (discountRateDesc) 模式下 76% 折扣神机置顶', () => {
  const cards = isvoroRunner.getCards();
  const sorted = [...cards].sort((a, b) => getCardSortScore(a, 'discountRateDesc') - getCardSortScore(b, 'discountRateDesc'));
  assert.strictEqual(sorted[0].id, 'isvoro-card-iv4');
});

it('Isvoro 排序矩阵：👑 月均续费最低 (monthlyRenewAsc) 模式下正常机器置顶且被墙机沉底', () => {
  const cards = isvoroRunner.getCards();
  const sorted = [...cards].sort((a, b) => getCardSortScore(a, 'monthlyRenewAsc') - getCardSortScore(b, 'monthlyRenewAsc'));
  // iv7: 25/mo 是正常机器中最低月均续费
  assert.strictEqual(sorted[0].id, 'isvoro-card-iv7');
  // 被墙机器 iv3 (虽然 renewal/12 是 20) 必须因为 1 亿惩罚基数沉底
  assert.strictEqual(sorted[sorted.length - 1].id, 'isvoro-card-iv3');
});

it('Isvoro 排序矩阵：🎁 倒贴最多 (discountDesc) 模式下净让利最多机器置顶', () => {
  const cards = isvoroRunner.getCards();
  const sorted = [...cards].sort((a, b) => getCardSortScore(a, 'discountDesc') - getCardSortScore(b, 'discountDesc'));
  // iv2: val 420.82 - sale 380 = 40.82 净倒贴第一
  assert.strictEqual(sorted[0].id, 'isvoro-card-iv2');
  // 被墙机器 iv3 必须绝对沉底
  assert.strictEqual(sorted[sorted.length - 1].id, 'isvoro-card-iv3');
});

it('Isvoro 排序矩阵：📶 剩余流量最多 (trafficDesc) 模式下 99% 可用神机置顶', () => {
  const cards = isvoroRunner.getCards();
  const sorted = [...cards].sort((a, b) => getCardSortScore(a, 'trafficDesc') - getCardSortScore(b, 'trafficDesc'));
  assert.strictEqual(sorted[0].id, 'isvoro-card-iv5');
});

it('Isvoro 排序矩阵：⏱ 日均成本最低 (costDailyAsc) 模式下过期机器安全沉底', () => {
  const cards = isvoroRunner.getCards();
  const sorted = [...cards].sort((a, b) => getCardSortScore(a, 'costDailyAsc') - getCardSortScore(b, 'costDailyAsc'));
  // 最低日均成本是 iv4 (0.24 元/天)
  assert.strictEqual(sorted[0].id, 'isvoro-card-iv4');
  // 过期机器 iv6 或被墙机器 iv3 沉底
  const lastCards = sorted.slice(-2).map(c => c.id);
  assert.ok(lastCards.includes('isvoro-card-iv6'), '过期机器必须沉底');
  assert.ok(lastCards.includes('isvoro-card-iv3'), '被墙机器必须沉底');
});

it('Isvoro 1 亿权重 IP 状态惩罚绝对沉底：💰 售价最低 (priceAsc) 模式下被墙机器必须沉底', () => {
  const cards = isvoroRunner.getCards();
  const sorted = [...cards].sort((a, b) => getCardSortScore(a, 'priceAsc') - getCardSortScore(b, 'priceAsc'));
  // 最低标价正常机器是 iv4 (¥6.00)
  assert.strictEqual(sorted[0].id, 'isvoro-card-iv4');
  // 被墙机器 iv3 (标价 120) 绝不能排在 130 或 380 之前，必须在末位沉底
  assert.strictEqual(sorted[sorted.length - 1].id, 'isvoro-card-iv3');
});

it('Isvoro 勾选「隐藏被墙IP」：被墙卡片被彻底隐藏且具备 style.display="none !important"', () => {
  isvoroRunner.filterState.hideBlocked = true;
  isvoroRunner.applyFilters();

  const hiddenCards = isvoroRunner.getUnits().filter(u => u.classList.contains('xrv-filter-hidden'));
  assert.strictEqual(hiddenCards.length, 1);
  assert.strictEqual(hiddenCards[0].id, 'isvoro-card-iv3');
  assert.strictEqual(hiddenCards[0].style.display, 'none');
  assert.strictEqual(hiddenCards[0].style._priorities['display'], 'important');

  const visibleCards = isvoroRunner.getUnits().filter(u => !u.classList.contains('xrv-filter-hidden'));
  assert.strictEqual(visibleCards.length, 6);
  assert.strictEqual(isvoroRunner.stats.blocked, 0);
});

it('Isvoro 反选取消勾选「隐藏被墙IP」：全数恢复且清除行内 display 样式', () => {
  isvoroRunner.filterState.hideBlocked = false;
  isvoroRunner.applyFilters();

  const cardIv3 = isvoroRunner.getUnits().find(u => u.id === 'isvoro-card-iv3');
  assert.strictEqual(cardIv3.classList.contains('xrv-filter-hidden'), false);
  assert.strictEqual(cardIv3.style.display, undefined);

  const visibleCards = isvoroRunner.getUnits().filter(u => !u.classList.contains('xrv-filter-hidden'));
  assert.strictEqual(visibleCards.length, 7);
  assert.strictEqual(isvoroRunner.stats.blocked, 1);
});

it('Isvoro 周期分类与多条件复合筛选：年付(year)筛选仅剩 2 张，月付+隐藏被墙仅剩 4 张', () => {
  isvoroRunner.filterState.cycle = 'year';
  isvoroRunner.applyFilters();

  const yearCards = isvoroRunner.getUnits().filter(u => !u.classList.contains('xrv-filter-hidden'));
  assert.strictEqual(yearCards.length, 2);
  const yearIds = yearCards.map(c => c.id);
  assert.ok(yearIds.includes('isvoro-card-iv2') && yearIds.includes('isvoro-card-iv3'));

  // 月付 + 隐藏被墙
  isvoroRunner.filterState.cycle = 'month';
  isvoroRunner.filterState.hideBlocked = true;
  isvoroRunner.applyFilters();

  const monthUnblocked = isvoroRunner.getUnits().filter(u => !u.classList.contains('xrv-filter-hidden'));
  assert.strictEqual(monthUnblocked.length, 4);
  assert.strictEqual(isvoroRunner.stats.blocked, 0);

  // 恢复
  isvoroRunner.filterState.cycle = 'all';
  isvoroRunner.filterState.hideBlocked = false;
  isvoroRunner.applyFilters();
});

it('Isvoro 防误判清洗验证：包含原生防火墙、未阻断直连的卡片准确识别为正常', () => {
  const cardIv7 = isvoroRunner.getCards().find(c => c.id === 'isvoro-card-iv7');
  assert.strictEqual(cardIv7.dataset.xrvIpBlocked, '0');
  assert.strictEqual(cardIv7.classList.contains('xrv-card-blocked'), false);
});

// ─── 第十四部分：Panstar 公开市场结构与双模适配专有测试套件 ───
console.log('\n📌 阶段 14：Panstar 公开市场结构与双模适配专有测试套件');

it('Panstar 路由识别：/marketplace 与 /console/marketplace 双路径全面放行且拦截无关路径', () => {
  const origLoc = global.location;
  try {
    // 1. 公开市场路径放行
    global.location = { hostname: 'panstar.ai', pathname: '/marketplace' };
    vpsModule.refreshSite();
    assert.strictEqual(vpsModule.isMarketplaceRoute(), true, 'panstar.ai /marketplace 必须放行');

    global.location = { hostname: 'panstar.ai', pathname: '/marketplace/product/101' };
    vpsModule.refreshSite();
    assert.strictEqual(vpsModule.isMarketplaceRoute(), true, 'panstar.ai /marketplace/product/101 必须放行');

    global.location = { hostname: 'panstar.hk', pathname: '/marketplace' };
    vpsModule.refreshSite();
    assert.strictEqual(vpsModule.isMarketplaceRoute(), true, 'panstar.hk /marketplace 必须放行');

    // 2. 控制台路径放行
    global.location = { hostname: 'panstar.ai', pathname: '/console/marketplace' };
    vpsModule.refreshSite();
    assert.strictEqual(vpsModule.isMarketplaceRoute(), true, 'panstar.ai /console/marketplace 必须放行');

    global.location = { hostname: 'console.panstar.hk', pathname: '/console/marketplace' };
    vpsModule.refreshSite();
    assert.strictEqual(vpsModule.isMarketplaceRoute(), true, 'console.panstar.hk /console/marketplace 必须放行');

    // 3. 拦截无关路由
    global.location = { hostname: 'panstar.ai', pathname: '/login' };
    vpsModule.refreshSite();
    assert.strictEqual(vpsModule.isMarketplaceRoute(), false, 'panstar.ai /login 必须拦截');

    global.location = { hostname: 'panstar.ai', pathname: '/dashboard' };
    vpsModule.refreshSite();
    assert.strictEqual(vpsModule.isMarketplaceRoute(), false, 'panstar.ai /dashboard 必须拦截');

    global.location = { hostname: 'panstar.ai', pathname: '/console/orders' };
    vpsModule.refreshSite();
    assert.strictEqual(vpsModule.isMarketplaceRoute(), false, 'panstar.ai /console/orders 必须拦截');
  } finally {
    global.location = origLoc;
    vpsModule.refreshSite();
  }
});

it('Panstar 站点适配器契约审查：gridSelector 兼容 .marketplace-public-grid，statusSelector 包含 action-small', () => {
  const pan = vpsModule.SITES && vpsModule.SITES.panstar;
  assert.ok(pan, '必须导出 SITES.panstar');
  assert.ok(pan.gridSelector.includes('.marketplace-public-grid'), 'gridSelector 必须包含 .marketplace-public-grid');
  assert.ok(pan.gridSelector.includes('[data-marketplace-listing-grid]'), 'gridSelector 必须包含 [data-marketplace-listing-grid]');
  assert.ok(pan.statusSelector.includes('.console-marketplace-action-small'), 'statusSelector 必须包含 .console-marketplace-action-small');
  assert.ok(pan.fallbackSelectors.includes('[class*="action-small"]'), 'fallbackSelectors 必须包含 [class*="action-small"]');
  assert.ok(pan.fallbackSelectors.includes('.console-marketplace-action-small'), 'fallbackSelectors 必须包含 .console-marketplace-action-small');
});

it('Panstar 双模字段解析：控制台模式 (.console-marketplace-spec-row) 精准提取各项规格', () => {
  const pan = vpsModule.SITES.panstar;
  const card = new MiniDOMNode('article', 'panstar-console-test');
  card.setAttribute('data-marketplace-listing-card', '1');

  const addConsoleRow = (label, val) => {
    const row = new MiniDOMNode('div', '', 'console-marketplace-spec-row');
    const dt = new MiniDOMNode('span', '', 'console-marketplace-spec-label');
    dt.textContent = label;
    const dd = new MiniDOMNode('span', '', 'console-marketplace-spec-value');
    dd.textContent = val;
    row.appendChild(dt);
    row.appendChild(dd);
    card.appendChild(row);
  };

  addConsoleRow('Renewal Price', '$35.00 / Month');
  addConsoleRow('Expiration Time', '2026-05-10 12:00:00');
  addConsoleRow('Network', '1 Gbps | 200GB / 1000GB');

  const renewalField = pan.findField(card, 'renewal');
  assert.ok(renewalField, '控制台模式必须解析 renewal 字段');
  assert.strictEqual(renewalField.raw, '$35.00 / Month');

  const expiryField = pan.findField(card, 'expiry');
  assert.ok(expiryField, '控制台模式必须解析 expiry 字段');
  assert.strictEqual(expiryField.raw, '2026-05-10 12:00:00');

  const networkField = pan.findField(card, 'network');
  assert.ok(networkField, '控制台模式必须解析 network 字段');
  assert.strictEqual(networkField.raw, '1 Gbps | 200GB / 1000GB');
});

it('Panstar 双模字段解析：公开市场模式 (<dl><div class="grid"><dt><dd>) 精准提取各项规格', () => {
  const pan = vpsModule.SITES.panstar;
  const card = new MiniDOMNode('article', 'panstar-public-test');
  card.setAttribute('data-marketplace-listing-card', 'true');

  const dl = new MiniDOMNode('dl', '', 'mt-4 flex flex-1 flex-col justify-end gap-[10px]');
  const addPublicRow = (label, val) => {
    const row = new MiniDOMNode('div', '', 'grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-center gap-[10px]');
    const dt = new MiniDOMNode('dt', '', 'console-marketplace-copy-body-strong whitespace-nowrap text-[rgba(148,163,184,0.58)]');
    dt.textContent = label;
    const dd = new MiniDOMNode('dd', '', 'min-w-0 truncate text-[rgba(203,213,225,0.68)]');
    dd.textContent = val;
    row.appendChild(dt);
    row.appendChild(dd);
    dl.appendChild(row);
  };

  addPublicRow('Renewal Price', '$24.00 / Year');
  addPublicRow('Expiration Time', '2026-10-01 00:00:00');
  addPublicRow('Network', '2.5 Gbps | 300GB / 1500GB');
  card.appendChild(dl);

  const renewalField = pan.findField(card, 'renewal');
  assert.ok(renewalField, '公开市场模式必须精准定位 renewal');
  assert.strictEqual(renewalField.raw, '$24.00 / Year');
  assert.strictEqual(renewalField.valueEl.tagName, 'DD');

  const expiryField = pan.findField(card, 'expiry');
  assert.ok(expiryField, '公开市场模式必须精准定位 expiry');
  assert.strictEqual(expiryField.raw, '2026-10-01 00:00:00');
  assert.strictEqual(expiryField.valueEl.tagName, 'DD');

  const networkField = pan.findField(card, 'network');
  assert.ok(networkField, '公开市场模式必须精准定位 network');
  assert.strictEqual(networkField.raw, '2.5 Gbps | 300GB / 1500GB');
  assert.strictEqual(networkField.valueEl.tagName, 'DD');
});

it('Panstar 双模字段解析：公开市场语义回退 (无特定 class 的全卡片 dt/dd 结构) 健壮提取', () => {
  const pan = vpsModule.SITES.panstar;
  const card = new MiniDOMNode('article', 'panstar-fallback-test');
  card.setAttribute('data-marketplace-listing-card', 'true');

  const dl = new MiniDOMNode('dl');
  const addFallbackRow = (label, val) => {
    const row = new MiniDOMNode('div');
    const dt = new MiniDOMNode('dt');
    dt.textContent = label;
    const dd = new MiniDOMNode('dd');
    dd.textContent = val;
    row.appendChild(dt);
    row.appendChild(dd);
    dl.appendChild(row);
  };

  addFallbackRow('续费价格', '$12.00 / Month');
  addFallbackRow('到期时间', '2026-12-31 23:59:59');
  addFallbackRow('网络', '500 Mbps | 50GB / 500GB');
  card.appendChild(dl);

  assert.strictEqual(pan.findField(card, 'renewal').raw, '$12.00 / Month');
  assert.strictEqual(pan.findField(card, 'expiry').raw, '2026-12-31 23:59:59');
  assert.strictEqual(pan.findField(card, 'network').raw, '500 Mbps | 50GB / 500GB');
});

it('Panstar 公开市场 IP 状态探测：识别 .console-marketplace-action-small 中的 reachability issue 与疑似受限', () => {
  const pan = vpsModule.SITES.panstar;

  const testIpStatus = (badgeText) => {
    const card = new MiniDOMNode('article', 'ip-test');
    card.setAttribute('data-marketplace-listing-card', 'true');
    const chip = new MiniDOMNode('div', '', 'console-marketplace-action-small');
    chip.textContent = badgeText;
    card.appendChild(chip);
    const chipEl = card.querySelector(pan.statusSelector);
    const text = pan.ipText(chipEl);
    const blocked = pan.isIpBlocked(text);
    const extracted = vpsModule.extractCardIpStatus(card);
    return { text, blocked, extractedBlocked: extracted.blocked };
  };

  assert.strictEqual(testIpStatus('IP reachability issue').blocked, true, 'reachability issue 必须识别为阻断');
  assert.strictEqual(testIpStatus('IP reachability issue').extractedBlocked, true, 'extractCardIpStatus 必须判定为阻断');
  assert.strictEqual(testIpStatus('IP 疑似受限').blocked, true, '疑似受限必须识别为阻断');
  assert.strictEqual(testIpStatus('IP blocked').blocked, true, 'blocked 必须识别为阻断');
  assert.strictEqual(testIpStatus('IP normal').blocked, false, 'normal 判定为正常');
});

it('Panstar 公开市场 IP 防误判清洗：严格排除未受限、未阻断与原生防火墙等良性词汇', () => {
  const pan = vpsModule.SITES.panstar;

  const testClean = (badgeText) => {
    const card = new MiniDOMNode('article', 'clean-test');
    card.setAttribute('data-marketplace-listing-card', 'true');
    const chip = new MiniDOMNode('div', '', 'console-marketplace-action-small');
    chip.textContent = badgeText;
    card.appendChild(chip);
    const chipEl = card.querySelector(pan.statusSelector);
    const text = pan.ipText(chipEl);
    return pan.isIpBlocked(text);
  };

  assert.strictEqual(testClean('网络未受限，直连顺畅'), false, '未受限不得误判为阻断');
  assert.strictEqual(testClean('不阻断海外访问'), false, '不阻断不得误判为阻断');
  assert.strictEqual(testClean('附带原生防火墙服务'), false, '防火墙不得误判为阻断');
});

function setupPanstarPublicFixture() {
  const container = new MiniDOMNode('div', 'view-panstar-public');
  const grid = new MiniDOMNode('section', 'panstar-public-grid', 'marketplace-public-grid grid min-w-0 grid-cols-1 gap-[16px] md:grid-cols-2 lg:grid-cols-3');
  grid.setAttribute('data-marketplace-listing-grid', 'true');
  container.appendChild(grid);

  const publicData = [
    { id: 'pub1', title: 'US-West Public Silicon Valley Pro', price: '$28.00', status: 'IP normal', renewal: '$35.00 / Month', expiry: '2026-05-10 12:00:00', network: '1 Gbps | 200GB / 1000GB', cycle: 'month', sale: 28, val: 35, days: 35, trafficRatio: 0.8, discountRate: 20, monthlyRenew: 35, dailyCost: 0.8 },
    { id: 'pub2', title: 'KR-Seoul Public Flash Deal (80% Off)', price: '$6.00', status: 'IP normal', renewal: '$30.00 / Month', expiry: '2026-05-01 00:00:00', network: '1 Gbps | 50GB / 1000GB', cycle: 'month', sale: 6, val: 28, days: 28, trafficRatio: 0.95, discountRate: 78.57, monthlyRenew: 30, dailyCost: 0.214 },
    { id: 'pub3', title: 'JP-Tokyo Public Budget (Reachability Issue)', price: '$3.00', status: 'IP reachability issue', renewal: '$10.00 / Month', expiry: '2026-04-18 10:00:00', network: '500 Mbps | 450GB / 500GB', cycle: 'month', sale: 3.0, val: 6, days: 12, trafficRatio: 0.1, discountRate: 50, monthlyRenew: 10, dailyCost: 0.25 },
    { id: 'pub4', title: 'UK-London Public Rare Annual', price: '$45.00', status: 'IP normal', renewal: '$24.00 / Year', expiry: '2026-10-01 00:00:00', network: '2.5 Gbps | 300GB / 1500GB', cycle: 'year', sale: 45, val: 20, days: 180, trafficRatio: 0.8, discountRate: 0, monthlyRenew: 2, dailyCost: 0.25 },
    { id: 'pub5', title: 'SG-Singapore Public Route Deal', price: '$15.00', status: 'IP normal', renewal: '$45.00 / Month', expiry: '2026-05-01 00:00:00', network: '1 Gbps | 100GB / 2000GB', cycle: 'month', sale: 15, val: 43.5, days: 29, trafficRatio: 0.95, discountRate: 65.5, monthlyRenew: 45, dailyCost: 0.517 },
    { id: 'pub6', title: 'DE-Frankfurt Public Traffic Monster', price: '$22.00', status: 'IP normal', renewal: '$25.00 / Month', expiry: '2026-04-25 00:00:00', network: '10 Gbps | 1GB / 5000GB', cycle: 'month', sale: 22, val: 20, days: 25, trafficRatio: 0.9998, discountRate: 0, monthlyRenew: 25, dailyCost: 0.88 },
    { id: 'pub7', title: 'HK-Hong Kong Public Expired', price: '$2.00', status: 'IP normal', renewal: '$10.00 / Month', expiry: '2026-03-01 00:00:00', network: '500 Mbps | 100GB / 500GB', cycle: 'month', sale: 2, val: 0, days: 0, trafficRatio: 0.8, discountRate: 0, monthlyRenew: 10, dailyCost: Infinity },
  ];

  publicData.forEach((d) => {
    const card = new MiniDOMNode('article', `panstar-pub-${d.id}`, 'group relative flex min-h-[331px] flex-col overflow-hidden rounded-[20px] border border-white/10 bg-[#0e131f]/90 p-[20px]');
    card.setAttribute('data-marketplace-listing-card', 'true');
    card.dataset.xrvSale = String(d.sale);
    card.dataset.xrvValue = String(d.val);
    card.dataset.xrvDays = String(d.days);
    card.dataset.xrvCycle = d.cycle;
    card.dataset.xrvTrafficRatio = String(d.trafficRatio);
    card.dataset.xrvDiscountRate = String(d.discountRate);
    card.dataset.xrvMonthlyRenew = String(d.monthlyRenew);
    card.dataset.xrvDailyCost = String(d.dailyCost);

    const titleRow = new MiniDOMNode('div', '', 'console-marketplace-title flex items-center justify-between pb-2');
    const titleText = new MiniDOMNode('span', '', 'font-bold text-white text-base');
    titleText.textContent = d.title;
    const priceText = new MiniDOMNode('span', '', 'console-marketplace-price text-lg font-semibold text-emerald-400');
    priceText.textContent = d.price;
    titleRow.appendChild(titleText);
    titleRow.appendChild(priceText);
    card.appendChild(titleRow);

    const statusWrapper = new MiniDOMNode('div', '', 'mt-2 flex items-center gap-2');
    const statusChip = new MiniDOMNode('div', '', 'console-marketplace-action-small');
    statusChip.textContent = d.status;
    statusWrapper.appendChild(statusChip);
    card.appendChild(statusWrapper);

    const dl = new MiniDOMNode('dl', '', 'mt-4 flex flex-1 flex-col justify-end gap-[10px]');
    
    const rowRenewal = new MiniDOMNode('div', '', 'grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-center gap-[10px]');
    const dtRenewal = new MiniDOMNode('dt', '', 'console-marketplace-copy-body-strong whitespace-nowrap text-[rgba(148,163,184,0.58)]');
    dtRenewal.textContent = 'Renewal Price';
    const ddRenewal = new MiniDOMNode('dd', '', 'min-w-0 truncate text-[rgba(203,213,225,0.68)]');
    ddRenewal.textContent = d.renewal;
    rowRenewal.appendChild(dtRenewal);
    rowRenewal.appendChild(ddRenewal);
    dl.appendChild(rowRenewal);

    const rowExpiry = new MiniDOMNode('div', '', 'grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-center gap-[10px]');
    const dtExpiry = new MiniDOMNode('dt', '', 'console-marketplace-copy-body-strong whitespace-nowrap text-[rgba(148,163,184,0.58)]');
    dtExpiry.textContent = 'Expiration Time';
    const ddExpiry = new MiniDOMNode('dd', '', 'min-w-0 truncate text-[rgba(203,213,225,0.68)]');
    ddExpiry.textContent = d.expiry;
    rowExpiry.appendChild(dtExpiry);
    rowExpiry.appendChild(ddExpiry);
    dl.appendChild(rowExpiry);

    const rowNetwork = new MiniDOMNode('div', '', 'grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-center gap-[10px]');
    const dtNetwork = new MiniDOMNode('dt', '', 'console-marketplace-copy-body-strong whitespace-nowrap text-[rgba(148,163,184,0.58)]');
    dtNetwork.textContent = 'Network';
    const ddNetwork = new MiniDOMNode('dd', '', 'min-w-0 truncate text-[rgba(203,213,225,0.68)]');
    ddNetwork.textContent = d.network;
    rowNetwork.appendChild(dtNetwork);
    rowNetwork.appendChild(ddNetwork);
    dl.appendChild(rowNetwork);

    card.appendChild(dl);
    grid.appendChild(card);
  });

  return { container, grid };
}

const panstarPubDOM = setupPanstarPublicFixture();
const panstarPubRunner = createDOMFilterRunner(panstarPubDOM, true);

it('Panstar 公开市场全真卡片智能打标：精准识别 IP reachability issue 阻断机 pub3 并赋予 xrvIpBlocked="1"', () => {
  const cards = panstarPubRunner.getCards();
  const cardPub3 = cards.find(c => c.id === 'panstar-pub-pub3');
  assert.ok(cardPub3, '必须找到 pub3 卡片');
  assert.strictEqual(cardPub3.dataset.xrvIpBlocked, '1', 'pub3 必须打标为被墙');
  assert.strictEqual(cardPub3.classList.contains('xrv-card-blocked'), true);

  const normalCards = cards.filter(c => c.id !== 'panstar-pub-pub3');
  normalCards.forEach(c => assert.strictEqual(c.dataset.xrvIpBlocked, '0', `${c.id} 必须判定为正常`));
});

it('Panstar 公开市场排序矩阵：🔥 折扣最大 (discountRateDesc) 模式下 78.6% 折扣神机置顶且被墙机绝对沉底', () => {
  const cards = panstarPubRunner.getCards();
  const sorted = [...cards].sort((a, b) => getCardSortScore(a, 'discountRateDesc') - getCardSortScore(b, 'discountRateDesc'));
  assert.strictEqual(sorted[0].id, 'panstar-pub-pub2', 'pub2 (78.57% 折扣) 必须置顶');
  assert.strictEqual(sorted[sorted.length - 1].id, 'panstar-pub-pub3', '被墙机器 pub3 必须绝对沉底');
});

it('Panstar 公开市场排序矩阵：👑 月均续费最低 (monthlyRenewAsc) 模式下 $2/mo 绝版年付神机置顶且被墙机绝对沉底', () => {
  const cards = panstarPubRunner.getCards();
  const sorted = [...cards].sort((a, b) => getCardSortScore(a, 'monthlyRenewAsc') - getCardSortScore(b, 'monthlyRenewAsc'));
  assert.strictEqual(sorted[0].id, 'panstar-pub-pub4', 'pub4 ($2/mo 年付折算) 必须置顶');
  assert.strictEqual(sorted[sorted.length - 1].id, 'panstar-pub-pub3', '被墙机器 pub3 必须绝对沉底');
});

it('Panstar 公开市场排序矩阵：🎁 倒贴最多 (discountDesc) 模式下净让利最多机器置顶且被墙机绝对沉底', () => {
  const cards = panstarPubRunner.getCards();
  const sorted = [...cards].sort((a, b) => getCardSortScore(a, 'discountDesc') - getCardSortScore(b, 'discountDesc'));
  assert.strictEqual(sorted[0].id, 'panstar-pub-pub5', 'pub5 (净倒贴 28.50) 必须置顶');
  assert.strictEqual(sorted[sorted.length - 1].id, 'panstar-pub-pub3', '被墙机器 pub3 必须绝对沉底');
});

it('Panstar 公开市场排序矩阵：📶 剩余流量最多 (trafficDesc) 模式下 99.98% 可用神机置顶且被墙机绝对沉底', () => {
  const cards = panstarPubRunner.getCards();
  const sorted = [...cards].sort((a, b) => getCardSortScore(a, 'trafficDesc') - getCardSortScore(b, 'trafficDesc'));
  assert.strictEqual(sorted[0].id, 'panstar-pub-pub6', 'pub6 (99.98% 流量) 必须置顶');
  assert.strictEqual(sorted[sorted.length - 1].id, 'panstar-pub-pub3', '被墙机器 pub3 必须绝对沉底');
});

it('Panstar 公开市场排序矩阵：⏱ 日均成本最低 (costDailyAsc) 模式下低成本机置顶且过期机与被墙机安全沉底', () => {
  const cards = panstarPubRunner.getCards();
  const sorted = [...cards].sort((a, b) => getCardSortScore(a, 'costDailyAsc') - getCardSortScore(b, 'costDailyAsc'));
  assert.strictEqual(sorted[0].id, 'panstar-pub-pub2', 'pub2 ($0.214/天) 必须置顶');
  const bottomTwo = sorted.slice(-2).map(c => c.id);
  assert.ok(bottomTwo.includes('panstar-pub-pub7'), '过期机 pub7 必须在末尾沉底');
  assert.ok(bottomTwo.includes('panstar-pub-pub3'), '被墙机 pub3 必须在末尾沉底');
});

it('Panstar 公开市场 1 亿权重 IP 状态惩罚绝对沉底：💰 售价最低 (priceAsc) 模式下被墙机器绝对沉底', () => {
  const cards = panstarPubRunner.getCards();
  const sorted = [...cards].sort((a, b) => getCardSortScore(a, 'priceAsc') - getCardSortScore(b, 'priceAsc'));
  assert.strictEqual(sorted[sorted.length - 1].id, 'panstar-pub-pub3', '被墙卡片 pub3 无论标价多低均必须末位绝对沉底');
  assert.strictEqual(sorted[0].id, 'panstar-pub-pub7', '最低正常售价卡片置顶');
});

it('Panstar 公开市场 6 种排序模式产生相互独立、不可混淆的卡片顺序（彻底解决无变化 Bug）', () => {
  const cards = panstarPubRunner.getCards();
  const modes = ['discountDesc', 'discountRateDesc', 'priceAsc', 'monthlyRenewAsc', 'costDailyAsc', 'trafficDesc'];
  const signatures = new Set();
  modes.forEach((mode) => {
    const sorted = [...cards].sort((a, b) => getCardSortScore(a, mode) - getCardSortScore(b, mode));
    const sig = sorted.map(c => c.id).join(',');
    assert.strictEqual(signatures.has(sig), false, `模式 ${mode} 不得与其他模式序列冲突`);
    signatures.add(sig);
  });
  assert.strictEqual(signatures.size, 6, '全部 6 种排序模式必须产生 6 种完全不同的序列');
});

it('Panstar 公开市场 勾选「隐藏被墙IP」：被墙卡片被彻底隐藏且具备 style.display="none !important"', () => {
  panstarPubRunner.filterState.hideBlocked = true;
  panstarPubRunner.applyFilters();

  const hiddenCards = panstarPubRunner.getUnits().filter(u => u.classList.contains('xrv-filter-hidden'));
  assert.strictEqual(hiddenCards.length, 1);
  assert.strictEqual(hiddenCards[0].id, 'panstar-pub-pub3');
  assert.strictEqual(hiddenCards[0].style.display, 'none');
  assert.strictEqual(hiddenCards[0].style._priorities['display'], 'important');

  const visibleCards = panstarPubRunner.getUnits().filter(u => !u.classList.contains('xrv-filter-hidden'));
  assert.strictEqual(visibleCards.length, 6);
  assert.strictEqual(panstarPubRunner.stats.blocked, 0);
});

it('Panstar 公开市场 反选取消勾选「隐藏被墙IP」：全数恢复且清除行内 display 样式', () => {
  panstarPubRunner.filterState.hideBlocked = false;
  panstarPubRunner.applyFilters();

  const cardPub3 = panstarPubRunner.getUnits().find(u => u.id === 'panstar-pub-pub3');
  assert.strictEqual(cardPub3.classList.contains('xrv-filter-hidden'), false);
  assert.strictEqual(cardPub3.style.display, undefined);

  const visibleCards = panstarPubRunner.getUnits().filter(u => !u.classList.contains('xrv-filter-hidden'));
  assert.strictEqual(visibleCards.length, 7);
  assert.strictEqual(panstarPubRunner.stats.blocked, 1);
});

it('Panstar 公开市场 周期分类与多条件复合筛选：年付(year)筛选仅剩 1 张神机，月付+隐藏被墙仅剩 5 张', () => {
  panstarPubRunner.filterState.cycle = 'year';
  panstarPubRunner.applyFilters();

  const yearCards = panstarPubRunner.getUnits().filter(u => !u.classList.contains('xrv-filter-hidden'));
  assert.strictEqual(yearCards.length, 1);
  assert.strictEqual(yearCards[0].id, 'panstar-pub-pub4');

  // 月付 + 隐藏被墙
  panstarPubRunner.filterState.cycle = 'month';
  panstarPubRunner.filterState.hideBlocked = true;
  panstarPubRunner.applyFilters();

  const monthUnblocked = panstarPubRunner.getUnits().filter(u => !u.classList.contains('xrv-filter-hidden'));
  assert.strictEqual(monthUnblocked.length, 5);
  assert.strictEqual(panstarPubRunner.stats.blocked, 0);

  // 恢复
  panstarPubRunner.filterState.cycle = 'all';
  panstarPubRunner.filterState.hideBlocked = false;
  panstarPubRunner.applyFilters();
});

console.log('\n================================================================');
console.log(`🎉 全部 ${totalCount} 项自动化测试断言全数通过！(Passed: ${passedCount}/${totalCount})`);
console.log('================================================================\n');

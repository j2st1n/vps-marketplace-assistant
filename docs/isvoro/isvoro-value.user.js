// ==UserScript==
// @name         Isvoro 二手交易市场剩余价值计算与科学排序助手
// @name:en      Isvoro Marketplace Remaining-Value Calculator & Smart Sorter
// @namespace    https://github.com/j2st1n/isvoro-marketplace-tool
// @version      1.0.0
// @description  为 Isvoro 二手交易市场 (https://isvoro.com/marketplace) 量身打造的科学计算与智能排序插件：自动计算每台机器实际剩余价值、倒贴/溢价额、实际折数与打折力度、接手日均成本、归一化月均续费成本；提供 6 维科学排序矩阵（正常 IP 优先，被墙机器 1 亿惩罚基数绝对沉底）、智能多维筛选（隐藏被墙/只看倒贴/周期分类）与 Tailwind HSL 双模暗黑自适应。
// @description:en  Tailor-made remaining-value calculator and smart sorting assistant for Isvoro Marketplace (https://isvoro.com/marketplace): calculates true remaining value, bonus/premium amount, real discount rate, buyer daily holding cost, normalized monthly renewal cost; provides 6D scientific sorting matrix (normal IP first, 100M penalty sinks blocked machines), smart filtering (hide blocked/only deals/cycle filter) and Tailwind HSL dual dark mode adaptation.
// @author       j2st1n
// @match        *://isvoro.com/*
// @match        *://*.isvoro.com/*
// @match        *://127.0.0.1:*/*
// @match        *://localhost:*/*
// @homepageURL  https://github.com/j2st1n/isvoro-marketplace-tool
// @supportURL   https://github.com/j2st1n/isvoro-marketplace-tool/issues
// @license      MIT
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ═════════════════════════════════════════════════════════════════
  // 1. IP 状态探测正则与清洗防御矩阵
  // ═════════════════════════════════════════════════════════════════
  const IP_PATTERNS = {
    blocked: /(?:ip|IP|网络|连接|端口)?\s*(?:被墙|被封|封锁|封禁|被锁|阻断|不可达|失联|不可用|污染)|GFW|\b(?:blocked|banned|unreachable|gfw)\b/i,
    abnormal: /\bno\s*data\b|暂无(?:数据|检测)?|检测失败|异常|超时|timeout/i,
    normal: /(?:ip|IP)?\s*(?:正常|OK|ok|良好)|\b(?:normal|healthy|ok)\b/i,
    pending: /检测中|加载中|\b(?:checking|loading)\b|\.\.\./i,
  };

  function sanitizeIpStatusText(text) {
    if (!text) return '';
    return text
      .replace(/防火墙/gi, '')
      .replace(/锁价/gi, '')
      .replace(/锁单/gi, '')
      .replace(/不锁\S*/gi, '')
      .replace(/未锁\S*/gi, '')
      .replace(/(?:不|未|无)\s*(?:阻断|封锁|被墙|不可达)/gi, '');
  }

  function isIpBlockedUnified(text) {
    if (!text) return false;
    const sanitized = sanitizeIpStatusText(text.trim());
    if (IP_PATTERNS.blocked.test(sanitized)) return true;
    if (IP_PATTERNS.abnormal.test(sanitized)) return true;
    if (IP_PATTERNS.normal.test(sanitized)) return false;
    return false;
  }

  // 语言检测（中/英，环境容错）
  function isZh() {
    const docLang = typeof document !== 'undefined' && document.documentElement ? document.documentElement.lang : '';
    const navLang = typeof navigator !== 'undefined' ? navigator.language : '';
    const lang = (docLang || navLang || 'zh-CN').toLowerCase();
    return lang.indexOf('zh') === 0;
  }

  // 路由判定：是否处于 Isvoro 二手市场页面
  function isMarketplaceRoute() {
    const host = location.hostname || '';
    if (host === '127.0.0.1' || host === 'localhost') {
      return true; // 本地测试沙箱环境始终激活
    }
    const path = location.pathname || '';
    return path.startsWith('/marketplace');
  }

  // ═════════════════════════════════════════════════════════════════
  // 2. 状态机与配置中心
  // ═════════════════════════════════════════════════════════════════
  const STATE = {
    sortMode: 'bonus', // 'bonus' | 'discount' | 'renew' | 'daily' | 'traffic' | 'default'
    hideBlocked: false,
    onlyBonus: false,
    cycleFilter: 'all', // 'all' | 'month' | 'quarter' | 'halfYear' | 'year'
    isCollapsed: false,
    stats: {
      total: 0,
      normal: 0,
      blocked: 0,
      bonusCount: 0,
    },
  };

  // ═════════════════════════════════════════════════════════════════
  // 3. 样式注入 (Tailwind CSS HSL Design Tokens & 暗黑模式)
  // ═════════════════════════════════════════════════════════════════
  function injectStyles() {
    if (document.getElementById('isvoro-xrv-styles')) return;

    const style = document.createElement('style');
    style.id = 'isvoro-xrv-styles';
    style.textContent = `
      /* ─── Isvoro XRV Design Tokens ─── */
      :root {
        --isv-bg-card: hsl(var(--card, 0 0% 100%));
        --isv-fg-card: hsl(var(--card-foreground, 222.2 47.4% 11.2%));
        --isv-border: hsl(var(--border, 214.3 31.8% 91.4%));
        --isv-primary: hsl(var(--primary, 221 83% 53%));
        --isv-primary-fg: hsl(var(--primary-foreground, 210 40% 98%));
        --isv-muted: hsl(var(--muted, 210 40% 96.1%));
        --isv-muted-fg: hsl(var(--muted-foreground, 215.4 16.3% 44%));
        --isv-success: hsl(var(--success, 142 71% 45%));
        --isv-destructive: hsl(var(--destructive, 0 84.2% 48%));
        --isv-warning: hsl(var(--warning, 38 92% 50%));
        --isv-radius: var(--radius, 0.625rem);
        --isv-shadow-hud: 0 4px 16px -2px rgba(0, 0, 0, 0.06), 0 2px 6px -1px rgba(0, 0, 0, 0.04);
        --isv-btn-bg: hsl(var(--muted, 210 40% 96.1%));
        --isv-btn-border: hsl(var(--border, 214.3 31.8% 91.4%));
        --isv-btn-text: hsl(var(--card-foreground, 222.2 47.4% 11.2%));
      }

      /* 暗色模式 Token 映射 (通过 html.dark 或系统偏好) */
      .dark, html.dark, [data-theme="dark"], :root[data-theme="dark"] {
        --isv-bg-card: hsl(var(--card, 224 71% 6%));
        --isv-fg-card: hsl(var(--card-foreground, 210 40% 98%));
        --isv-border: hsl(var(--border, 217.2 32.6% 17.5%));
        --isv-primary: hsl(var(--primary, 217 91% 60%));
        --isv-primary-fg: hsl(var(--primary-foreground, 222.2 47.4% 11.2%));
        --isv-muted: hsl(var(--muted, 217.2 32.6% 17.5%));
        --isv-muted-fg: hsl(var(--muted-foreground, 215 20.2% 65.1%));
        --isv-success: hsl(var(--success, 142 65% 45%));
        --isv-destructive: hsl(var(--destructive, 0 62.8% 50%));
        --isv-warning: hsl(var(--warning, 38 92% 55%));
        --isv-shadow-hud: 0 6px 20px -2px rgba(0, 0, 0, 0.45), 0 2px 8px -1px rgba(0, 0, 0, 0.3);
        --isv-btn-bg: hsl(var(--muted, 217.2 32.6% 17.5%));
        --isv-btn-border: hsl(var(--border, 217.2 32.6% 22%));
        --isv-btn-text: hsl(var(--card-foreground, 210 40% 98%));
      }

      /* ─── HUD 仪表盘容器 ─── */
      .isvoro-xrv-hud {
        background-color: var(--isv-bg-card);
        color: var(--isv-fg-card);
        border: 1px solid var(--isv-border);
        border-radius: var(--isv-radius);
        box-shadow: var(--isv-shadow-hud);
        margin-bottom: 1.25rem;
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        overflow: hidden;
      }

      .isvoro-xrv-hud-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--isv-border);
        background: hsla(var(--muted), 0.35);
        gap: 0.75rem;
        flex-wrap: wrap;
      }

      .isvoro-xrv-title-area {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 600;
        font-size: 0.95rem;
      }

      .isvoro-xrv-title-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.5rem;
        height: 1.5rem;
        border-radius: 0.375rem;
        background: hsla(var(--primary), 0.15);
        color: var(--isv-primary);
        font-size: 0.85rem;
      }

      .isvoro-xrv-badge-ver {
        font-size: 0.7rem;
        padding: 0.1rem 0.4rem;
        border-radius: 9999px;
        background: hsla(var(--primary), 0.12);
        color: var(--isv-primary);
        font-weight: 500;
      }

      .isvoro-xrv-stats-bar {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.8rem;
        color: var(--isv-muted-fg);
        flex-wrap: wrap;
      }

      .isvoro-xrv-stat-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.15rem 0.5rem;
        border-radius: 0.375rem;
        background: hsla(var(--muted), 0.6);
        font-variant-numeric: tabular-nums;
      }

      .isvoro-xrv-stat-normal {
        color: var(--isv-success);
      }

      .isvoro-xrv-stat-blocked {
        color: var(--isv-destructive);
      }

      .isvoro-xrv-stat-deal {
        color: var(--isv-primary);
        font-weight: 600;
      }

      .isvoro-xrv-hud-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .isvoro-xrv-icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 1.85rem;
        padding: 0 0.6rem;
        font-size: 0.78rem;
        border-radius: calc(var(--isv-radius) - 2px);
        border: 1px solid var(--isv-btn-border);
        background: var(--isv-btn-bg);
        color: var(--isv-btn-text);
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
      }

      .isvoro-xrv-icon-btn:hover {
        border-color: var(--isv-primary);
        color: var(--isv-primary);
      }

      .isvoro-xrv-hud-body {
        padding: 0.85rem 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
      }

      .isvoro-xrv-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;
      }

      .isvoro-xrv-row-label {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--isv-muted-fg);
        min-width: 4rem;
      }

      .isvoro-xrv-btn-group {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        flex-wrap: wrap;
      }

      .isvoro-xrv-pill-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        height: 2rem;
        padding: 0 0.7rem;
        font-size: 0.8rem;
        font-weight: 500;
        border-radius: calc(var(--isv-radius) - 2px);
        border: 1px solid var(--isv-btn-border);
        background: var(--isv-btn-bg);
        color: var(--isv-btn-text);
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
      }

      .isvoro-xrv-pill-btn:hover {
        border-color: var(--isv-primary);
        color: var(--isv-primary);
      }

      .isvoro-xrv-pill-btn.active {
        background: var(--isv-primary);
        color: var(--isv-primary-fg);
        border-color: var(--isv-primary);
        font-weight: 600;
        box-shadow: 0 2px 8px hsla(var(--primary), 0.35);
      }

      .isvoro-xrv-checkbox-label {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        height: 2rem;
        padding: 0 0.65rem;
        font-size: 0.8rem;
        font-weight: 500;
        border-radius: calc(var(--isv-radius) - 2px);
        border: 1px solid var(--isv-btn-border);
        background: var(--isv-btn-bg);
        color: var(--isv-btn-text);
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
      }

      .isvoro-xrv-checkbox-label:hover {
        border-color: var(--isv-primary);
      }

      .isvoro-xrv-checkbox-label input {
        cursor: pointer;
        accent-color: var(--isv-primary);
      }

      /* ─── 卡片内嵌指标行 (Injected Value Metrics) ─── */
      .isvoro-xrv-metrics {
        margin-top: 0.65rem;
        margin-bottom: 0.65rem;
        padding: 0.65rem 0.75rem;
        border-radius: calc(var(--isv-radius) - 2px);
        border: 1px dashed var(--isv-border);
        background: hsla(var(--muted), 0.4);
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        font-size: 0.8rem;
        line-height: 1.4;
      }

      .isvoro-xrv-metrics-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }

      .isvoro-xrv-val-title {
        font-weight: 500;
        color: var(--isv-fg-card);
      }

      .isvoro-xrv-val-num {
        font-weight: 700;
        color: var(--isv-primary);
        font-variant-numeric: tabular-nums;
      }

      /* 徽章样式：倒贴、折价、平价、溢价、高溢价、已过期 */
      .isvoro-xrv-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.15rem 0.5rem;
        border-radius: 0.375rem;
        font-size: 0.75rem;
        font-weight: 600;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }

      .isvoro-xrv-badge-super {
        background: hsla(var(--success), 0.18);
        color: var(--isv-success);
        border: 1px solid hsla(var(--success), 0.3);
      }

      .isvoro-xrv-badge-discount {
        background: hsla(var(--success), 0.12);
        color: var(--isv-success);
        border: 1px solid hsla(var(--success), 0.2);
      }

      .isvoro-xrv-badge-fair {
        background: hsla(var(--muted), 0.7);
        color: var(--isv-muted-fg);
        border: 1px solid var(--isv-border);
      }

      .isvoro-xrv-badge-premium {
        background: hsla(var(--warning), 0.15);
        color: var(--isv-warning);
        border: 1px solid hsla(var(--warning), 0.3);
      }

      .isvoro-xrv-badge-high-premium {
        background: hsla(var(--destructive), 0.12);
        color: var(--isv-destructive);
        border: 1px solid hsla(var(--destructive), 0.25);
      }

      .isvoro-xrv-badge-expired {
        background: hsla(var(--muted), 0.5);
        color: var(--isv-muted-fg);
        border: 1px solid var(--isv-border);
      }

      /* 指标网格：折数、接手日均、月均续费 */
      .isvoro-xrv-grid-3 {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.35rem 0.5rem;
        padding-top: 0.35rem;
        border-top: 1px dashed var(--isv-border);
        font-size: 0.75rem;
      }

      .isvoro-xrv-cell {
        display: flex;
        flex-direction: column;
      }

      .isvoro-xrv-cell-k {
        color: var(--isv-muted-fg);
        font-size: 0.7rem;
      }

      .isvoro-xrv-cell-v {
        font-weight: 600;
        color: var(--isv-fg-card);
        font-variant-numeric: tabular-nums;
      }

      /* 流量进度条 */
      .isvoro-xrv-traffic-wrap {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        margin-top: 0.2rem;
      }

      .isvoro-xrv-traffic-header {
        display: flex;
        justify-content: space-between;
        font-size: 0.7rem;
        color: var(--isv-muted-fg);
      }

      .isvoro-xrv-traffic-bar {
        height: 5px;
        border-radius: 9999px;
        background: hsla(var(--muted), 0.9);
        overflow: hidden;
      }

      .isvoro-xrv-traffic-fill {
        height: 100%;
        border-radius: 9999px;
        transition: width 0.3s ease;
      }

      /* 被墙卡片高亮与警示边框 */
      .isvoro-xrv-card-blocked {
        box-shadow: 0 0 0 1px hsla(var(--destructive), 0.4), 0 2px 10px hsla(var(--destructive), 0.15) !important;
        position: relative;
      }

      .isvoro-xrv-card-deal {
        border-color: hsla(var(--success), 0.4) !important;
      }

      /* 过滤隐藏状态 */
      .isvoro-xrv-hidden {
        display: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // ═════════════════════════════════════════════════════════════════
  // 4. 数据解析与数学模型计算 (Mathematical Valuation Models)
  // ═════════════════════════════════════════════════════════════════

  function currencySymbol(text) {
    if (!text) return '¥';
    if (text.indexOf('$') !== -1 || /USD/i.test(text)) return '$';
    if (text.indexOf('€') !== -1 || /EUR/i.test(text)) return '€';
    if (text.indexOf('£') !== -1 || /GBP/i.test(text)) return '£';
    return '¥';
  }

  // 解析续费文本，例如 "¥45.00/月", "¥480.00/年", "¥135.00/季", "$20.00/month"
  function parseRenewalPrice(text) {
    if (!text) return null;
    const clean = text.trim();
    // 匹配金额与周期标记
    const m = clean.match(/([¥$€£]|CN¥)?\s*([\d,]+(?:\.\d+)?)\s*(?:\/|\s*每\s*|\s*per\s*)?\s*([^/]*)$/i);
    if (!m) return null;

    const rawCur = m[1];
    const amount = parseFloat(m[2].replace(/,/g, ''));
    if (Number.isNaN(amount)) return null;

    const cycleToken = (m[3] || '').trim().toLowerCase();
    let cycle = 'month';
    let cycleDays = 30;
    let period = 1;
    let monthlyRenewalCost = amount;
    let unitLabel = isZh() ? '月' : 'mo';

    if (/半年|half-year|semiannual/i.test(cycleToken)) {
      cycle = 'halfYear';
      cycleDays = 180;
      period = 6;
      monthlyRenewalCost = amount / 6;
      unitLabel = isZh() ? '半年' : 'half-yr';
    } else if (/年|year|yr|annual/i.test(cycleToken)) {
      cycle = 'year';
      cycleDays = 365;
      period = 12;
      monthlyRenewalCost = amount / 12;
      unitLabel = isZh() ? '年' : 'yr';
    } else if (/季|quarter/i.test(cycleToken)) {
      cycle = 'quarter';
      cycleDays = 90;
      period = 3;
      monthlyRenewalCost = amount / 3;
      unitLabel = isZh() ? '季' : 'qtr';
    } else if (/周|week|wk/i.test(cycleToken)) {
      cycle = 'week';
      cycleDays = 7;
      period = 1;
      monthlyRenewalCost = (amount / 7) * 30;
      unitLabel = isZh() ? '周' : 'wk';
    } else if (/天|日|day/i.test(cycleToken)) {
      cycle = 'day';
      cycleDays = 1;
      period = 1;
      monthlyRenewalCost = amount * 30;
      unitLabel = isZh() ? '天' : 'd';
    }

    return {
      price: amount,
      cycle,
      cycleDays,
      period,
      unitLabel,
      monthlyRenewalCost: Math.round(monthlyRenewalCost * 100) / 100,
      currency: currencySymbol(clean || rawCur),
    };
  }

  // 解析到期时间：支持 "2026-11-20 18:00", "2026-11-20T18:00:00Z", "2026/11/20"
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

  // 解析售价
  function parseSalePrice(text) {
    if (!text) return null;
    const m = text.match(/([¥$€£]|CN¥)?\s*([\d,]+(?:\.\d+)?)/i);
    if (!m) return null;
    const num = parseFloat(m[2].replace(/,/g, ''));
    return Number.isNaN(num) ? null : num;
  }

  // 解析流量数值（GB/MB/TB/B）
  function parseTrafficAmount(text) {
    if (!text) return null;
    const m = text.trim().match(/^([\d.]+)\s*(B|KB|MB|GB|TB)$/i);
    if (!m) return null;
    const scale = { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 };
    return parseFloat(m[1]) * (scale[m[2].toUpperCase()] || 1);
  }

  // 计算流量统计与剩余比例
  function calcTrafficStock(usageText) {
    if (!usageText) return null;
    if (/不限|unlimited|unmetered/i.test(usageText)) {
      return {
        remainingRatio: 1.0,
        remainingPct: '100.0',
        usedText: '0 GB',
        totalText: isZh() ? '不限流量' : 'Unlimited',
        isUnlimited: true,
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
      isUnlimited: false,
    };
  }

  function fmtMoney(amount, cur = '¥') {
    return cur + Number(amount || 0).toFixed(2);
  }

  // 核心科学剩余价值计算
  function calcValuation(renewalText, expiryText, salePrice) {
    const renewal = parseRenewalPrice(renewalText);
    const expiry = parseExpiry(expiryText);
    if (!renewal || !expiry) return null;

    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;
    const elapsed = expiry.getTime() - now;

    const floatDays = Math.max(0, elapsed / msPerDay);
    const remainingDays = Math.ceil(floatDays);
    const isExpired = elapsed <= 0;

    // 剩余价值 V_rem = 续费价 * (剩余天数 / 周期总天数)
    const rawValue = isExpired ? 0 : renewal.price * (floatDays / renewal.cycleDays);
    const remainingValue = Math.round(rawValue * 100) / 100;

    // 接手日均持有成本 C_daily = 售价 / 剩余天数
    const dailyCost = salePrice !== null && floatDays > 0 ? salePrice / Math.max(1, floatDays) : 0;

    // 倒贴/溢价额 ΔP = 售价 - 剩余价值
    const deltaP = salePrice !== null ? Math.round((salePrice - remainingValue) * 100) / 100 : 0;
    const bonus = Math.max(0, -deltaP);
    const premium = Math.max(0, deltaP);

    // 实际折扣率 DiscountRate = 售价 / 剩余价值
    let discountRate = 1.0;
    let foldText = '';
    let pctText = '';

    if (remainingValue > 0 && salePrice !== null) {
      discountRate = salePrice / remainingValue;
      if (discountRate < 1.0) {
        const offPct = Math.round((1 - discountRate) * 100);
        const fold = (discountRate * 10).toFixed(1).replace(/\.0$/, '');
        pctText = `-${offPct}%`;
        foldText = `${fold}折`;
      } else if (discountRate > 1.0) {
        const overPct = Math.round((discountRate - 1) * 100);
        pctText = `+${overPct}%`;
        foldText = `超额${overPct}%`;
      } else {
        foldText = '平价';
        pctText = '0%';
      }
    }

    // 评估徽章与展示文本
    let badge = null;
    const cur = renewal.currency;

    if (isExpired) {
      badge = {
        cls: 'isvoro-xrv-badge-expired',
        text: isZh() ? '已到期' : 'Expired',
        type: 'expired',
      };
    } else if (salePrice === null || Number.isNaN(salePrice)) {
      badge = {
        cls: 'isvoro-xrv-badge-fair',
        text: `${fmtMoney(remainingValue, cur)} (${remainingDays}${isZh() ? '天' : 'd'})`,
        type: 'fair',
      };
    } else if (bonus >= 5 || (discountRate <= 0.8 && bonus > 0)) {
      // 大额倒贴超值捡漏
      badge = {
        cls: 'isvoro-xrv-badge-super',
        text: `🎁 ${isZh() ? '倒贴' : 'Bonus'} ${fmtMoney(bonus, cur)} (${pctText})`,
        type: 'super',
      };
    } else if (bonus > 0.05) {
      // 小额折价倒贴
      badge = {
        cls: 'isvoro-xrv-badge-discount',
        text: `🎁 ${isZh() ? '倒贴' : 'Bonus'} ${fmtMoney(bonus, cur)} (${pctText})`,
        type: 'discount',
      };
    } else if (Math.abs(deltaP) <= 0.05) {
      // 平价流转
      badge = {
        cls: 'isvoro-xrv-badge-fair',
        text: isZh() ? '平价转让' : 'Fair Price',
        type: 'fair',
      };
    } else if (premium <= 15) {
      // 适度溢价
      badge = {
        cls: 'isvoro-xrv-badge-premium',
        text: `${isZh() ? '溢价' : 'Premium'} +${fmtMoney(premium, cur)} (${pctText})`,
        type: 'premium',
      };
    } else {
      // 严重高溢价
      badge = {
        cls: 'isvoro-xrv-badge-high-premium',
        text: `⚠️ ${isZh() ? '溢价' : 'Premium'} +${fmtMoney(premium, cur)} (${pctText})`,
        type: 'high',
      };
    }

    return {
      remainingValue,
      remainingDays,
      floatDays,
      isExpired,
      salePrice,
      deltaP,
      bonus,
      premium,
      discountRate,
      foldText,
      pctText,
      dailyCost: Math.round(dailyCost * 100) / 100,
      monthlyRenewalCost: renewal.monthlyRenewalCost,
      renewalPrice: renewal.price,
      cycleDays: renewal.cycleDays,
      cycle: renewal.cycle,
      period: renewal.period,
      unitLabel: renewal.unitLabel,
      currency: cur,
      badge,
    };
  }

  // ═════════════════════════════════════════════════════════════════
  // 5. DOM 提取层 (高容错选择器与骨架屏自愈)
  // ═════════════════════════════════════════════════════════════════

  // 定位当前市场卡片网格
  function findGridContainer() {
    const activePanel = document.querySelector('div[role="tabpanel"][data-state="active"]');
    if (activePanel) {
      const grid = activePanel.querySelector('.grid.grid-cols-1, .grid');
      if (grid) return grid;
    }
    return document.querySelector('.grid.grid-cols-1.md\\:grid-cols-2, .grid.grid-cols-1');
  }

  // 提取一张卡片的全部原始字段
  function extractCardData(card) {
    if (!card) return null;

    // 1. 骨架屏检测：若卡片未加载完成，跳过
    if (card.querySelector('.skeleton') || card.classList.contains('h-80') || !card.querySelector('dl')) {
      return { isSkeleton: true };
    }

    // 2. 标题提取
    const titleEl = card.querySelector('.pb-3 .text-lg') || card.querySelector('[class*="font-semibold"]');
    const title = titleEl ? titleEl.textContent.trim() : '';

    // 3. IP 状态探测流水线 (三级回退)
    let isBlocked = false;
    let ipStatusText = '';

    // Level 1: 专用徽章探测 (.pb-3 span)
    const ipBadge = card.querySelector('.pb-3 span');
    if (ipBadge) {
      ipStatusText = ipBadge.textContent.trim();
      isBlocked = isIpBlockedUnified(ipStatusText);
    } else {
      // Level 2: 遍历所有可能标签
      const tags = card.querySelectorAll('.badge, [class*="badge"], span[class*="text-"]');
      for (const t of tags) {
        const txt = t.textContent.trim();
        if (IP_PATTERNS.blocked.test(txt) || IP_PATTERNS.normal.test(txt)) {
          ipStatusText = txt;
          isBlocked = isIpBlockedUnified(txt);
          break;
        }
      }
    }

    // 4. 规格定义列表 <dl> 字段提取
    const dts = card.querySelectorAll('dl dt');
    let region = '';
    let plan = '';
    let config = '';
    let networkRaw = '';
    let renewalRaw = '';
    let expiresRaw = '';

    for (const dt of dts) {
      const key = dt.textContent.trim();
      const dd = dt.nextElementSibling;
      if (!dd) continue;
      const val = dd.textContent.trim();

      if (/地区|Region/i.test(key)) region = val;
      else if (/套餐|Plan/i.test(key)) plan = val;
      else if (/配置|Config/i.test(key)) config = val;
      else if (/网络|Network/i.test(key)) networkRaw = val;
      else if (/续费价格|Renewal/i.test(key)) renewalRaw = val;
      else if (/到期时间|Expires/i.test(key)) expiresRaw = val;
    }

    // 5. 售价提取 (.pt-4 .text-2xl)
    const priceEl = card.querySelector('.pt-4 .text-2xl') || card.querySelector('[class*="text-2xl"]');
    const priceRaw = priceEl ? priceEl.textContent.trim() : '';
    const salePrice = parseSalePrice(priceRaw);

    // 6. 流量统计
    const trafficStock = calcTrafficStock(networkRaw);

    return {
      isSkeleton: false,
      title,
      isBlocked,
      ipStatusText,
      region,
      plan,
      config,
      networkRaw,
      trafficStock,
      renewalRaw,
      expiresRaw,
      priceRaw,
      salePrice,
    };
  }

  // ═════════════════════════════════════════════════════════════════
  // 6. 卡片渲染与 HUD 注入控制 (Rendering & Decoration)
  // ═════════════════════════════════════════════════════════════════

  // 为单张卡片注入价值模型指标行
  function decorateCard(card, cardData, valuation) {
    if (!card || !cardData || !valuation) return;

    // 移除已有的指标容器，保证幂等更新
    const existing = card.querySelector('.isvoro-xrv-metrics');
    if (existing) existing.remove();

    // 标记卡片 IP 阻断与好价状态
    if (cardData.isBlocked) {
      card.classList.add('isvoro-xrv-card-blocked');
      card.dataset.xrvBlocked = '1';
    } else {
      card.classList.remove('isvoro-xrv-card-blocked');
      card.dataset.xrvBlocked = '0';
    }

    if (valuation.bonus >= 5) {
      card.classList.add('isvoro-xrv-card-deal');
    } else {
      card.classList.remove('isvoro-xrv-card-deal');
    }

    // 构建内嵌指标容器
    const container = document.createElement('div');
    container.className = 'isvoro-xrv-metrics';

    // 行 1：剩余价值与评估徽章
    const topRow = document.createElement('div');
    topRow.className = 'isvoro-xrv-metrics-top';

    const valTitle = document.createElement('div');
    valTitle.className = 'isvoro-xrv-val-title';
    valTitle.innerHTML = `${isZh() ? '剩余价值' : 'Value'}: <span class="isvoro-xrv-val-num">${fmtMoney(valuation.remainingValue, valuation.currency)}</span> <span style="font-size:0.75rem;color:var(--isv-muted-fg);">(${isZh() ? '剩' : ''}${valuation.remainingDays}${isZh() ? '天' : 'd'})</span>`;

    const badgeEl = document.createElement('div');
    badgeEl.className = `isvoro-xrv-badge ${valuation.badge.cls}`;
    badgeEl.textContent = valuation.badge.text;

    topRow.appendChild(valTitle);
    topRow.appendChild(badgeEl);
    container.appendChild(topRow);

    // 行 2：三列关键指标（实际折数、接手日均、月均续费）
    const gridRow = document.createElement('div');
    gridRow.className = 'isvoro-xrv-grid-3';

    // 实际折数
    const cellFold = document.createElement('div');
    cellFold.className = 'isvoro-xrv-cell';
    cellFold.innerHTML = `
      <span class="isvoro-xrv-cell-k">${isZh() ? '实际折数' : 'Discount'}</span>
      <span class="isvoro-xrv-cell-v" style="color:${valuation.bonus > 0 ? 'var(--isv-success)' : 'inherit'}">${valuation.foldText || '--'}</span>
    `;

    // 接手日均
    const cellDaily = document.createElement('div');
    cellDaily.className = 'isvoro-xrv-cell';
    cellDaily.innerHTML = `
      <span class="isvoro-xrv-cell-k">${isZh() ? '接手日均' : 'Daily Cost'}</span>
      <span class="isvoro-xrv-cell-v">${fmtMoney(valuation.dailyCost, valuation.currency)}/${isZh() ? '天' : 'd'}</span>
    `;

    // 月均续费
    const cellRenew = document.createElement('div');
    cellRenew.className = 'isvoro-xrv-cell';
    cellRenew.innerHTML = `
      <span class="isvoro-xrv-cell-k">${isZh() ? '月均续费' : 'Monthly Renew'}</span>
      <span class="isvoro-xrv-cell-v">${fmtMoney(valuation.monthlyRenewalCost, valuation.currency)}/${isZh() ? '月' : 'mo'}</span>
    `;

    gridRow.appendChild(cellFold);
    gridRow.appendChild(cellDaily);
    gridRow.appendChild(cellRenew);
    container.appendChild(gridRow);

    // 行 3：剩余流量进度条 (若存在流量规格)
    if (cardData.trafficStock) {
      const ts = cardData.trafficStock;
      const trafficWrap = document.createElement('div');
      trafficWrap.className = 'isvoro-xrv-traffic-wrap';

      const trafficHeader = document.createElement('div');
      trafficHeader.className = 'isvoro-xrv-traffic-header';
      trafficHeader.innerHTML = `
        <span>${isZh() ? '剩余流量' : 'Traffic Left'}: <b>${ts.usedText} / ${ts.totalText}</b></span>
        <span><b>${ts.remainingPct}%</b></span>
      `;

      const barBg = document.createElement('div');
      barBg.className = 'isvoro-xrv-traffic-bar';

      const barFill = document.createElement('div');
      barFill.className = 'isvoro-xrv-traffic-fill';
      const pct = parseFloat(ts.remainingPct);
      barFill.style.width = `${pct}%`;
      if (pct > 50) {
        barFill.style.backgroundColor = 'var(--isv-success)';
      } else if (pct > 20) {
        barFill.style.backgroundColor = 'var(--isv-warning)';
      } else {
        barFill.style.backgroundColor = 'var(--isv-destructive)';
      }

      barBg.appendChild(barFill);
      trafficWrap.appendChild(trafficHeader);
      trafficWrap.appendChild(barBg);
      container.appendChild(trafficWrap);
    }

    // 锚定注入位置：位于 CardContent 内部，紧邻 CardFooter (.pt-4.border-t) 之上
    const footer = card.querySelector('.pt-4.border-t') || card.querySelector('.pt-4');
    if (footer && footer.parentElement) {
      footer.parentElement.insertBefore(container, footer);
    } else {
      card.appendChild(container);
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // 7. 6 维科学排序矩阵与被阻断机器沉底 (1 亿权重)
  // ═════════════════════════════════════════════════════════════════

  function computeCardScore(cardData, valuation, domIndex, sortMode) {
    // 被阻断机器 1 亿惩罚基数，无论何种排序绝对沉底在所有正常卡片之后
    const ipPenalty = cardData.isBlocked ? 100000000 : 0;

    if (!valuation) {
      return ipPenalty + 50000000 + domIndex;
    }

    switch (sortMode) {
      case 'bonus':
        // 倒贴最多：ΔP 越小（让利倒贴最多），排在越前面
        return ipPenalty + valuation.deltaP;

      case 'discount':
        // 折扣最大：折扣率 R_discount 越小（打折力度最猛），排在越前面
        return ipPenalty + (valuation.discountRate * 100);

      case 'renew':
        // 月均续费最低：长期持有成本最低排在最前
        return ipPenalty + valuation.monthlyRenewalCost;

      case 'daily':
        // 接手日均成本最低
        return ipPenalty + valuation.dailyCost;

      case 'traffic':
        // 剩余流量最多：剩余比例最高（负号取小值排前面）
        if (cardData.trafficStock) {
          return ipPenalty - (cardData.trafficStock.remainingRatio * 100);
        }
        return ipPenalty + 50;

      case 'default':
      default:
        // 默认排序：保留原站发布次序，但被阻断机器依然沉底
        return ipPenalty + domIndex;
    }
  }

  // 执行科学排序与筛选
  function applySortingAndFilters(cards, cardMetaList) {
    cards.forEach((card, idx) => {
      const meta = cardMetaList[idx];
      if (!meta || !meta.cardData) return;

      const { cardData, valuation } = meta;

      // 1. 快捷筛选器判断
      let shouldHide = false;

      // 隐藏被阻断 IP
      if (STATE.hideBlocked && cardData.isBlocked) {
        shouldHide = true;
      }

      // 只看倒贴机
      if (STATE.onlyBonus && (!valuation || valuation.deltaP >= -0.01)) {
        shouldHide = true;
      }

      // 周期分类筛选
      if (STATE.cycleFilter !== 'all' && valuation) {
        if (STATE.cycleFilter === 'month' && (valuation.cycle !== 'month' || valuation.period !== 1)) {
          shouldHide = true;
        } else if (STATE.cycleFilter === 'quarter' && valuation.cycle !== 'quarter' && valuation.period !== 3) {
          shouldHide = true;
        } else if (STATE.cycleFilter === 'halfYear' && valuation.cycle !== 'halfYear' && valuation.period !== 6) {
          shouldHide = true;
        } else if (STATE.cycleFilter === 'year' && valuation.cycle !== 'year' && valuation.period !== 12) {
          shouldHide = true;
        }
      }

      if (shouldHide) {
        card.classList.add('isvoro-xrv-hidden');
      } else {
        card.classList.remove('isvoro-xrv-hidden');
      }

      // 2. CSS Order 无损排序（不触碰 DOM 结构与 Vue 虚拟树）
      const score = computeCardScore(cardData, valuation, idx, STATE.sortMode);
      card.style.order = String(Math.floor(score * 100));
    });
  }

  // ═════════════════════════════════════════════════════════════════
  // 8. HUD 控制台构建与注入 (Interactive Control Console)
  // ═════════════════════════════════════════════════════════════════

  function renderHud(container, onUpdate) {
    container.innerHTML = '';
    container.className = 'isvoro-xrv-hud';

    // 1. HUD Header
    const header = document.createElement('div');
    header.className = 'isvoro-xrv-hud-header';

    const titleArea = document.createElement('div');
    titleArea.className = 'isvoro-xrv-title-area';
    titleArea.innerHTML = `
      <span class="isvoro-xrv-title-icon">⚡</span>
      <span>${isZh() ? 'Isvoro 市场助手' : 'Isvoro Assistant'}</span>
      <span class="isvoro-xrv-badge-ver">v1.0</span>
    `;

    const statsBar = document.createElement('div');
    statsBar.className = 'isvoro-xrv-stats-bar';
    const s = STATE.stats;
    statsBar.innerHTML = `
      <span class="isvoro-xrv-stat-pill">${isZh() ? '共' : 'Total'} <b>${s.total}</b></span>
      <span class="isvoro-xrv-stat-pill isvoro-xrv-stat-normal">${isZh() ? '正常' : 'OK'} <b>${s.normal}</b></span>
      <span class="isvoro-xrv-stat-pill isvoro-xrv-stat-blocked">${isZh() ? '被墙' : 'Blocked'} <b>${s.blocked}</b></span>
      <span class="isvoro-xrv-stat-pill isvoro-xrv-stat-deal">🎁 ${isZh() ? '倒贴' : 'Deals'} <b>${s.bonusCount}</b></span>
    `;

    const actions = document.createElement('div');
    actions.className = 'isvoro-xrv-hud-actions';

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'isvoro-xrv-icon-btn';
    refreshBtn.innerHTML = `🔄 ${isZh() ? '刷新' : 'Refresh'}`;
    refreshBtn.onclick = () => onUpdate(true);

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'isvoro-xrv-icon-btn';
    toggleBtn.innerHTML = STATE.isCollapsed ? (isZh() ? '展开 ▼' : 'Expand ▼') : (isZh() ? '收起 ▲' : 'Collapse ▲');
    toggleBtn.onclick = () => {
      STATE.isCollapsed = !STATE.isCollapsed;
      body.style.display = STATE.isCollapsed ? 'none' : 'flex';
      toggleBtn.innerHTML = STATE.isCollapsed ? (isZh() ? '展开 ▼' : 'Expand ▼') : (isZh() ? '收起 ▲' : 'Collapse ▲');
    };

    actions.appendChild(refreshBtn);
    actions.appendChild(toggleBtn);

    header.appendChild(titleArea);
    header.appendChild(statsBar);
    header.appendChild(actions);
    container.appendChild(header);

    // 2. HUD Body
    const body = document.createElement('div');
    body.className = 'isvoro-xrv-hud-body';
    if (STATE.isCollapsed) body.style.display = 'none';

    // 排序模式行 (6 维科学排序矩阵)
    const sortRow = document.createElement('div');
    sortRow.className = 'isvoro-xrv-row';

    const sortLabel = document.createElement('div');
    sortLabel.className = 'isvoro-xrv-row-label';
    sortLabel.textContent = isZh() ? '科学排序:' : 'Sort By:';

    const sortGroup = document.createElement('div');
    sortGroup.className = 'isvoro-xrv-btn-group';

    const sortModes = [
      { key: 'bonus', label: isZh() ? '🎁 倒贴最多' : '🎁 Best Deals' },
      { key: 'discount', label: isZh() ? '🏷️ 折扣最大' : '🏷️ Deepest Discount' },
      { key: 'renew', label: isZh() ? '📉 月均续费最低' : '📉 Lowest Renew' },
      { key: 'daily', label: isZh() ? '📅 日均成本最低' : '📅 Lowest Daily' },
      { key: 'traffic', label: isZh() ? '📊 剩余流量最多' : '📊 Most Traffic' },
      { key: 'default', label: isZh() ? '🔄 默认排序' : '🔄 Default' },
    ];

    sortModes.forEach((m) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `isvoro-xrv-pill-btn ${STATE.sortMode === m.key ? 'active' : ''}`;
      btn.textContent = m.label;
      btn.onclick = () => {
        STATE.sortMode = m.key;
        sortGroup.querySelectorAll('.isvoro-xrv-pill-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        onUpdate(false);
      };
      sortGroup.appendChild(btn);
    });

    sortRow.appendChild(sortLabel);
    sortRow.appendChild(sortGroup);
    body.appendChild(sortRow);

    // 筛选条件行
    const filterRow = document.createElement('div');
    filterRow.className = 'isvoro-xrv-row';

    const filterLabel = document.createElement('div');
    filterLabel.className = 'isvoro-xrv-row-label';
    filterLabel.textContent = isZh() ? '智能筛选:' : 'Filter:';

    const filterGroup = document.createElement('div');
    filterGroup.className = 'isvoro-xrv-btn-group';

    // 隐藏被墙复选框
    const hideBlockedLabel = document.createElement('label');
    hideBlockedLabel.className = 'isvoro-xrv-checkbox-label';
    const hideBlockedCheck = document.createElement('input');
    hideBlockedCheck.type = 'checkbox';
    hideBlockedCheck.checked = STATE.hideBlocked;
    hideBlockedCheck.onchange = () => {
      STATE.hideBlocked = hideBlockedCheck.checked;
      onUpdate(false);
    };
    hideBlockedLabel.appendChild(hideBlockedCheck);
    hideBlockedLabel.appendChild(document.createTextNode(isZh() ? '🚫 隐藏被墙机器' : '🚫 Hide Blocked IP'));
    filterGroup.appendChild(hideBlockedLabel);

    // 只看倒贴复选框
    const onlyBonusLabel = document.createElement('label');
    onlyBonusLabel.className = 'isvoro-xrv-checkbox-label';
    const onlyBonusCheck = document.createElement('input');
    onlyBonusCheck.type = 'checkbox';
    onlyBonusCheck.checked = STATE.onlyBonus;
    onlyBonusCheck.onchange = () => {
      STATE.onlyBonus = onlyBonusCheck.checked;
      onUpdate(false);
    };
    onlyBonusLabel.appendChild(onlyBonusCheck);
    onlyBonusLabel.appendChild(document.createTextNode(isZh() ? '🎁 只看倒贴机器' : '🎁 Deals Only'));
    filterGroup.appendChild(onlyBonusLabel);

    // 周期分段筛选 (全部/月付/季付/半年付/年付)
    const cycles = [
      { key: 'all', label: isZh() ? '全部周期' : 'All Cycles' },
      { key: 'month', label: isZh() ? '月付' : 'Monthly' },
      { key: 'quarter', label: isZh() ? '季付' : 'Quarterly' },
      { key: 'halfYear', label: isZh() ? '半年付' : 'Semi-Annual' },
      { key: 'year', label: isZh() ? '年付' : 'Yearly' },
    ];

    cycles.forEach((c) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `isvoro-xrv-pill-btn ${STATE.cycleFilter === c.key ? 'active' : ''}`;
      btn.textContent = c.label;
      btn.onclick = () => {
        STATE.cycleFilter = c.key;
        filterGroup.querySelectorAll('.isvoro-xrv-pill-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        onUpdate(false);
      };
      filterGroup.appendChild(btn);
    });

    filterRow.appendChild(filterLabel);
    filterRow.appendChild(filterGroup);
    body.appendChild(filterRow);

    container.appendChild(body);
  }

  // ═════════════════════════════════════════════════════════════════
  // 9. 核心调度流水线 (Core Pipeline & Orchestration)
  // ═════════════════════════════════════════════════════════════════

  let hudContainer = null;
  let isProcessing = false;
  let debounceTimer = null;

  function runPipeline(forceRecalc = false) {
    if (!isMarketplaceRoute()) {
      if (hudContainer && hudContainer.parentElement) {
        hudContainer.remove();
      }
      return;
    }

    const grid = findGridContainer();
    if (!grid) return;

    // 1. 确保 HUD 容器注入于卡片网格前
    if (!hudContainer || !hudContainer.parentElement || hudContainer.parentElement !== grid.parentElement) {
      if (hudContainer && hudContainer.parentElement) {
        hudContainer.remove();
      }
      hudContainer = document.createElement('div');
      grid.parentElement.insertBefore(hudContainer, grid);
    }

    // 2. 提取所有卡片
    // 兼容多种卡片容器类名
    const cards = Array.from(grid.querySelectorAll(':scope > div.rounded-xl, :scope > div.flex.flex-col.rounded-xl, :scope > div[class*="rounded-xl"]'));
    if (cards.length === 0) return;

    let normalCount = 0;
    let blockedCount = 0;
    let bonusCount = 0;
    const cardMetaList = [];

    cards.forEach((card) => {
      const cardData = extractCardData(card);
      if (!cardData || cardData.isSkeleton) {
        cardMetaList.push({ cardData: null, valuation: null });
        return;
      }

      // 卡片内容指纹签名，避免无效重算
      const signature = `${cardData.title}_${cardData.priceRaw}_${cardData.renewalRaw}_${cardData.expiresRaw}_${cardData.isBlocked ? '1' : '0'}`;
      let valuation = card._xrvValuation;

      if (forceRecalc || !valuation || card.dataset.xrvSig !== signature) {
        valuation = calcValuation(cardData.renewalRaw, cardData.expiresRaw, cardData.salePrice);
        card._xrvValuation = valuation;
        card.dataset.xrvSig = signature;
        decorateCard(card, cardData, valuation);
      }

      if (cardData.isBlocked) {
        blockedCount++;
      } else {
        normalCount++;
      }

      if (valuation && valuation.bonus > 0.05) {
        bonusCount++;
      }

      cardMetaList.push({ cardData, valuation });
    });

    // 3. 更新统计状态
    STATE.stats = {
      total: normalCount + blockedCount,
      normal: normalCount,
      blocked: blockedCount,
      bonusCount,
    };

    // 4. 重新渲染 HUD 控件
    renderHud(hudContainer, (force) => runPipeline(force));

    // 5. 应用排序与筛选
    applySortingAndFilters(cards, cardMetaList);
  }

  function schedulePipeline(delay = 60, force = false) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (isProcessing) return;
      isProcessing = true;
      try {
        runPipeline(force);
      } finally {
        isProcessing = false;
      }
    }, delay);
  }

  // ═════════════════════════════════════════════════════════════════
  // 10. SPA 路由感知、MutationObserver 与生命周期监听
  // ═════════════════════════════════════════════════════════════════

  let domObserver = null;

  function initObserver() {
    if (domObserver) domObserver.disconnect();

    domObserver = new MutationObserver((mutations) => {
      // 检查变动是否涉及市场卡片与网格
      let shouldTrigger = false;
      for (const m of mutations) {
        // 忽略插件内部自身容器引发的变动，防止死循环
        if (m.target && m.target.closest && m.target.closest('.isvoro-xrv-hud, .isvoro-xrv-metrics')) {
          continue;
        }
        if (m.addedNodes.length > 0 || m.removedNodes.length > 0 || m.type === 'attributes') {
          shouldTrigger = true;
          break;
        }
      }
      if (shouldTrigger) {
        schedulePipeline(80, false);
      }
    });

    domObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-state'],
    });
  }

  function hookHistory() {
    const _pushState = history.pushState;
    const _replaceState = history.replaceState;

    history.pushState = function (...args) {
      _pushState.apply(this, args);
      onRouteChange();
    };

    history.replaceState = function (...args) {
      _replaceState.apply(this, args);
      onRouteChange();
    };

    window.addEventListener('popstate', onRouteChange);
    window.addEventListener('hashchange', onRouteChange);
  }

  function onRouteChange() {
    if (isMarketplaceRoute()) {
      schedulePipeline(100, true);
    } else {
      if (hudContainer && hudContainer.parentElement) {
        hudContainer.remove();
        hudContainer = null;
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // 11. 插件启动入口
  // ═════════════════════════════════════════════════════════════════
  function bootstrap() {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }
    injectStyles();
    hookHistory();
    initObserver();

    // 页面初次载入时执行
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => schedulePipeline(150, true));
    } else {
      schedulePipeline(150, true);
    }

    console.log('%c[Isvoro-XRV] 🚀 Isvoro 二手交易市场计算与排序助手已就绪！', 'color:#3b82f6;font-weight:bold;');
  }

  const exportedAPI = {
    STATE,
    IP_PATTERNS,
    sanitizeIpStatusText,
    isIpBlockedUnified,
    isZh,
    isMarketplaceRoute,
    currencySymbol,
    parseRenewalPrice,
    parseExpiry,
    parseSalePrice,
    parseTrafficAmount,
    calcTrafficStock,
    calcValuation,
    computeCardScore,
    extractCardData,
    decorateCard,
    applySortingAndFilters,
    runPipeline,
  };

  if (typeof window !== 'undefined') {
    window.__ISVORO_XRV_EXPORTS__ = exportedAPI;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportedAPI;
  }

  bootstrap();
})();

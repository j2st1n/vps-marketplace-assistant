# SITES.isvoro 适配层规范与三合一多站点架构契约

> **文档版本**：v1.0.0  
> **制定角色**：架构与设计专家 (`architect`)  
> **适用工程**：`userscripts/vps-marketplace-assistant` (原 `panstar-akile-marketplace-tool`)  
> **目标**：将 Isvoro 二手交易市场适配层无缝接入工作区原有插件，形成 Panstar、Akile、Isvoro 三合一统一架构的《VPS 交易所助手》。

---

## 1. 架构目标与工程重命名

原有插件 `panstar-akile-marketplace-tool` 已具备成熟的多站点适配器模式 (`SITES.panstar` 与 `SITES.akile`)、6 维科学排序矩阵、IP 状态三级探测流水线、防误判清洗矩阵、明暗双模自适应系统以及 56 项端到端回归测试套件。

本次升级将：
1. **GitHub 仓库**：从 `j2st1n/panstar-akile-marketplace-tool` 重命名为 `j2st1n/vps-marketplace-assistant`；
2. **本地目录**：从 `userscripts/panstar-akile-marketplace-tool/` 重命名为 `userscripts/vps-marketplace-assistant/`；
3. **插件定位**：升级为通用的《VPS 二手交易市场剩余价值计算与科学排序助手 (Panstar / Akile / Isvoro)》；
4. **清理临时产物**：彻底移除先前独立创建的临时仓库 `j2st1n/isvoro-marketplace-tool` 与本地独立目录 `userscripts/isvoro-marketplace-tool/`，避免维护割裂。

---

## 2. 油猴脚本元数据契约 (Userscript Header Contract)

主脚本文件名后续将重构或对齐为 `vps-marketplace-assistant.user.js`（或保留主入口兼容别名），其元数据头规范如下：

```javascript
// ==UserScript==
// @name         VPS 二手交易市场剩余价值计算与科学排序助手 (Panstar / Akile / Isvoro)
// @name:en      VPS Marketplace Remaining-Value Calculator & Smart Sorter (Panstar / Akile / Isvoro)
// @namespace    https://github.com/j2st1n/vps-marketplace-assistant
// @version      0.5.0
// @description  为 Panstar、Akile 与 Isvoro 交易所量身打造：自动计算真实剩余价值、折溢价额、实际折数、接手日均成本与归一化月均续费成本；提供 6 维科学排序矩阵、智能多维筛选与明暗双模自适应。
// @description:en Tailor-made for Panstar, Akile and Isvoro marketplaces: automatically calculates true remaining value, discount/premium, daily cost, normalized monthly renewal; provides 6D scientific sorting matrix, multi-filter and dual-mode dark theme.
// @author       j2st1n
// @match        *://console.panstar.hk/*
// @match        *://panstar.hk/*
// @match        *://akile.html/*
// @match        *://akile.io/*
// @match        *://*.akile.io/*
// @match        *://isvoro.com/*
// @match        *://*.isvoro.com/*
// @match        *://127.0.0.1:*/*
// @match        *://localhost:*/*
// @homepageURL  https://github.com/j2st1n/vps-marketplace-assistant
// @supportURL   https://github.com/j2st1n/vps-marketplace-assistant/issues
// @license      MIT
// @grant        none
// @run-at       document-idle
// ==/UserScript==
```

---

## 3. SITES 站点适配器接口契约 (Adapter Interface Contract)

主脚本的核心引擎通过 `SITES[siteName]` 获取当前平台的特化实现。每个适配器对象必须严格履行以下契约：

```typescript
interface SiteAdapter {
  // 1. 卡片与网格 DOM 选择器
  cardSelector: string;          // 匹配卡片外层容器
  gridSelector: string | null;   // 匹配网格容器，若为 null 则自动降级至 card.parentElement
  sortUnitOf(card: HTMLElement): HTMLElement; // 返回排序移动的物理单元 (Akile 为 .arco-col, Panstar/Isvoro 为 card 本身)

  // 2. 字段定位与取值
  priceSelector: string;         // 卡片内售价元素选择器
  statusSelector: string;        // Level 1 专属 IP 状态标签选择器
  fallbackSelectors: string[];   // Level 2 备用标签选择器列表

  // 3. 字段查找函数 (支持 'renewal' | 'expiry' | 'network')
  findField(card: HTMLElement, key: 'renewal' | 'expiry' | 'network'): {
    row: HTMLElement;            // 字段所在的行/容器节点 (用于 insertAdjacentElement 挂载 metrics 容器)
    valueEl: HTMLElement;        // 字段的值容器节点 (用于挂载流量进度条)
    raw: string;                 // 提取的未经修饰的原始字符串
  } | null;

  // 4. IP 与网络流量处理器
  ipText(chip: HTMLElement | null): string;       // 提取 IP 状态标签文本
  isIpBlocked(text: string): boolean;             // 判定该状态文本是否属于被墙/阻断
  networkUsage(valueEl: HTMLElement | null): string; // 提取网络流量原始文本并剔除插件已注入的 DOM
}
```

---

## 4. `SITES.isvoro` 精确配置实现

根据对 Isvoro 生产环境 DOM 与 Shadcn-Vue 结构的逆向分析，`SITES.isvoro` 的完整规范实现如下：

```javascript
  const SITES = {
    // ... 既有 panstar 与 akile 配置保持不变 ...

    isvoro: {
      // 1. 卡片容器：Shadcn-Vue Card，具备 rounded-xl、border、bg-card 特征
      cardSelector: '.grid > div.rounded-xl, .grid > div.flex.flex-col.rounded-xl, .grid > div.market-card, .grid > div[class*="rounded-xl"]',

      // 2. 网格容器：首选当前活动 Tab 面板内的 grid，带回退
      gridSelector: 'div[role="tabpanel"][data-state="active"] .grid, .grid.grid-cols-1.md\\:grid-cols-2, .grid.grid-cols-1, #cards-grid',

      // 3. 排序单元：卡片自身即为 Grid 的直接子项，直接移动卡片
      sortUnitOf(card) {
        return card;
      },

      // 4. 售价元素：CardFooter 中的 text-2xl 高亮文本
      priceSelector: '.pt-4 .text-2xl, [class*="text-2xl"]',

      // 5. IP 状态专用选择器与备用回退列表
      // Level 1: 卡片头部 .pb-3 下的专用状态徽章 span
      statusSelector: '.pb-3 span, .pb-3 [class*="text-success"], .pb-3 [class*="text-destructive"]',
      // Level 2: 遍历可能的 badge 与带色 span
      fallbackSelectors: ['.badge', '[class*="badge"]', 'span[class*="text-"]', '[class*="status"]'],

      // 6. 依字段键在卡片内取值：Isvoro 使用 <dl> + <dt>/<dd> 键值网格
      findField(card, key) {
        const dl = card.querySelector('dl');
        if (!dl) return null;

        const labelMap = {
          renewal: ['续费价格', 'Renewal', 'Renewal Price'],
          expiry: ['到期时间', 'Expires', 'Expiration Time'],
          network: ['网络', 'Network'],
        };
        const targets = labelMap[key];
        if (!targets) return null;

        const dts = dl.querySelectorAll('dt');
        for (const dt of dts) {
          const txt = dt.textContent.trim();
          if (targets.some((lbl) => txt.includes(lbl))) {
            const dd = dt.nextElementSibling;
            if (!dd) continue;
            // 重要架构设计：
            // row 返回 dl 容器本身！
            // 如此在 injectCard 中执行 `expiryField.row.insertAdjacentElement('afterend', wrapper)` 时，
            // metrics 容器将精准挂载于 <dl> 之后、CardFooter (.pt-4.border-t) 之前，
            // 既不破坏 <dl class="grid grid-cols-[auto_1fr]"> 内部栅格列排版，又契合视觉层级！
            return {
              row: dl,
              valueEl: dd,
              raw: dd.textContent.trim(),
            };
          }
        }
        return null;
      },

      // 7. IP 状态文本
      ipText(chip) {
        return chip ? chip.textContent.trim() : '';
      },

      // 8. IP 判定：复用统一的 isIpBlockedUnified
      isIpBlocked(text) {
        return isIpBlockedUnified(text);
      },

      // 9. 流量文本：提取网络字段原始文本并过滤脚本已注入的进度条
      networkUsage(valueEl) {
        if (!valueEl) return null;
        const trafficEl = valueEl.querySelector('.xrv-traffic');
        if (!trafficEl) return valueEl.textContent.trim();
        const clone = valueEl.cloneNode(true);
        clone.querySelectorAll('.xrv-traffic').forEach((el) => el.remove());
        return clone.textContent.trim();
      },
    },
  };
```

---

## 5. 站点识别与路由匹配契约

### 5.1 `detectSite()` 升级

```javascript
  function detectSite() {
    const host = location.hostname || '';
    if (/panstar/.test(host)) return 'panstar';
    if (/akile/.test(host)) return 'akile';
    if (/isvoro/.test(host)) return 'isvoro';

    // 本地沙箱与测试环境支持通过 URL 参数或 DOM 自动探测
    if (host === '127.0.0.1' || host === 'localhost') {
      const sp = new URLSearchParams(location.search);
      const forced = sp.get('site');
      if (forced === 'panstar' || forced === 'akile' || forced === 'isvoro') return forced;

      if (document.querySelector('article[data-marketplace-listing-card]')) return 'panstar';
      if (document.querySelector('.server-manage-card')) return 'akile';
      if (document.querySelector('.market-card') || document.querySelector('div[role="tabpanel"][data-state="active"]')) return 'isvoro';
      return 'akile';
    }
    return host.indexOf('panstar') !== -1 ? 'panstar' : (host.indexOf('isvoro') !== -1 ? 'isvoro' : 'akile');
  }
```

### 5.2 `isMarketplaceRoute()` 升级

```javascript
  function isMarketplaceRoute() {
    const host = location.hostname || '';
    if (host === '127.0.0.1' || host === 'localhost') {
      return true; // 本地测试壳环境始终激活
    }
    const path = location.pathname || '';
    if (SITE.name === 'panstar') {
      return path.startsWith('/console/marketplace');
    }
    if (SITE.name === 'akile') {
      return path.startsWith('/console/pushshop');
    }
    if (SITE.name === 'isvoro') {
      return path.startsWith('/marketplace');
    }
    return false;
  }
```

### 5.3 `getSortAnchor()` HUD 挂载升级

```javascript
  function getSortAnchor() {
    if (SITE.name === 'panstar') {
      const grid = document.querySelector(SITE.gridSelector);
      if (grid) return grid;
      const firstCard = document.querySelector(SITE.cardSelector);
      if (firstCard && firstCard.parentElement) return firstCard.parentElement;
      return null;
    }
    if (SITE.name === 'isvoro') {
      const activePanel = document.querySelector('div[role="tabpanel"][data-state="active"]');
      if (activePanel) {
        const grid = activePanel.querySelector('.grid.grid-cols-1, .grid');
        if (grid) return grid;
      }
      const grid = document.querySelector(SITE.gridSelector);
      if (grid) return grid;
      const firstCard = document.querySelector(SITE.cardSelector);
      if (firstCard && firstCard.parentElement) return firstCard.parentElement;
      return null;
    }
    // Akile
    const firstCard = document.querySelector(SITE.cardSelector);
    if (firstCard) {
      const row = firstCard.closest('.arco-row');
      if (row) return row;
    }
    const rows = document.querySelectorAll('.arco-row');
    for (const r of rows) {
      if (r.querySelector('.arco-col') || r.querySelector('.server-manage-card')) {
        return r;
      }
    }
    return rows[0] || null;
  }
```

---

## 6. 暗色模式与设计变量兼容性

Isvoro 原生采用 Tailwind CSS HSL Tokens，其暗色模式触发为在根标签添加 `html.dark`。
原插件 Design Tokens 中的暗色触发器：
```css
:root[arco-theme="dark"],
body[arco-theme="dark"],
[arco-theme="dark"],
html.dark,
body.dark,
.dark,
:root[data-theme="dark"],
body[data-theme="dark"],
[data-theme="dark"],
html.xrv-panstar { ... }
```
已原生包含 `html.dark, body.dark, .dark`，因此 `--xrv-*` 设计变量无需任何破坏性重构，即可在 Isvoro 的明亮与暗夜模式下 100% 自动适应。

---

## 7. 下游任务交付要求与检查清单

- [ ] **开发阶段 (`developer`)**：
  1. 将 `SITES.isvoro` 及相关站点识别函数合并入主脚本；
  2. 将元数据头更名为《VPS 二手交易市场剩余价值计算与科学排序助手》；
  3. 将 `mock-marketplace-isvoro.json` 中的 12 张仿真卡片并入 `mock-marketplace.html`（增加 Isvoro 切换视图）；
  4. 将 Isvoro 的回归测试用例并入 `test-regression.js`，确保三站点断言全数通过。
- [ ] **测试与同步阶段 (`tester`)**：
  1. 运行 `node test-regression.js` 确保全量通过；
  2. 验证本地开发服务与浏览器调试壳；
  3. 更新 README.md 与相关文档；
  4. 提交更改并推送至 GitHub `vps-marketplace-assistant`。

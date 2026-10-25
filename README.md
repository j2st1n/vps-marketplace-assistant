# 《VPS 交易所助手》(VPS Marketplace Assistant)

[![Version](https://img.shields.io/badge/version-0.5.1-blue.svg)](https://github.com/j2st1n/vps-marketplace-assistant)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/platform-Tampermonkey%20%7C%20Violentmonkey%20%7C%20ScriptCat-orange.svg)]()
[![Tests](https://img.shields.io/badge/tests-92%20passed-brightgreen.svg)]()

一套专为 **Panstar** (`panstar.hk`)、**Akile** (`akile.io`) 与 **Isvoro** (`isvoro.com`) 主流 VPS 二手流转交易市场量身打造的三合一高性能浏览器用户脚本。

自动根据访问域名切换站点适配器，秒级精准核算每台在售机器的**真实剩余价值、实际折溢价（倒贴让利/加价）、打折力度、接手日均成本与归一化月均续费成本**；提供**6 维科学排序矩阵（正常 IP 优先，被墙机器 1 亿权重绝对沉底）**与**快捷联动筛选器（隐藏被墙机、只看倒贴捡漏、全部/月付/年付周期切换）**，配备明暗双模自适应 HUD 控制台。

---

## ✨ 核心特性

### 1. 🌐 三合一多站点适配器架构 (Panstar / Akile / Isvoro)
- **单一脚本，三站兼容**：统一抽象 `SITES[siteName]` 适配层契约，一套代码无缝兼容：
  - **Panstar**：CSS Grid 布局 + 中英多语言规格行；
  - **Akile**：Arco Design 3 列响应式栅格 + React 动态 DOM；
  - **Isvoro**：Shadcn-Vue / Tailwind CSS + `<dl>` 键值定义列表。
- **保护原生排版与虚拟 DOM**：Isvoro 采用 `dl` 作为注入锚点保证两列网格完整性；排序基于纯 CSS `order`，筛选基于 CSS 状态类，**零破坏性 DOM 节点挪动**，完全兼容 Vue 3 与 React 响应式渲染。

### 2. 🚀 SPA 单页路由无感即时加载与骨架屏自愈
- **告别手动刷新 F5**：全局 History AOP 代理（劫持 `pushState` / `replaceState`，监听 `popstate` / `hashchange`）；无论从官网首页、控制台概览还是个人中心路由跳转进入市场，插件秒级自动初始化。
- **全生命周期防泄漏**：离开市场页面时自动断开 `MutationObserver` 监听并彻底清理注入的 DOM 与全局状态，零内存残留。
- **骨架屏数据指纹自愈**：引入卡片规格指纹（Signature）与动态状态机，彻底消除原有脚本在骨架屏占位时提前打标失效、异步数据返回后被永久跳过的严重缺陷。

### 3. 💰 科学的二手 VPS 交易价值模型
- **精确剩余价值 ($V_{rem}$)**：根据周期价格与到期浮点剩余天数精准分摊；
- **倒贴让利 / 溢价额 ($\Delta P = P_{sale} - V_{rem}$)**：
  - 卖家让利亏本甩卖时显示：`🎁 倒贴 ¥XX.XX`（或小额折价）；
  - 卖家加价转让时显示：`溢价 ¥XX.XX`；
- **实际折扣率**：计算相对打折力度（如 **-80% / 2.0 折**），精准发掘高比例打折神机；
- **接手日均成本 ($C_{daily}$)**：清晰展示买家接手后在机器到期前每日的实际分摊支出；
- **折合月均续费成本 ($C_{monthly\_renew}$)**：年付（年付÷12）、半年付、季付与月付统一归一化折算，便于横向比较机器真实持有成本；
- **5 级折溢价视觉徽章**：超值倒贴（深绿）、小额折价（浅绿）、平价出机（中性蓝）、轻度溢价（黄色）、高度溢价（红色）。

### 4. 🎯 6 维科学多维排序矩阵（1 亿被墙绝对沉底）
所有价值排序均注入 **1 亿权重 IP 状态惩罚（`ipPenalty = 100000000`）**，正常 IP 机器绝对优先排在最前，**彻底终结低价被墙机霸屏**的痛点：

| 排序模式 | 标识 | 业务意图与适用场景 |
|---|---|---|
| **默认顺序** | `default` | 恢复原站最新发布流 |
| **🎁 倒贴最多** | `discountDesc` | 按卖家倒贴让利绝对金额降序，**二手捡漏核心首选** |
| **🔥 折扣最大** | `discountRateDesc` | 按实际折扣率降序（如 2 折、3 折优先），挖掘超值小额神机 |
| **💰 售价最低** | `priceAsc` | 低预算首选，**正常 IP 严格在前**，被墙机自动沉底 |
| **👑 月均续费最低** | `monthlyRenewAsc` | 年付/月付折合月均续费成本升序，**专为挖掘低续费绝版“传家宝”神机设计** |
| **⏱ 日均成本最低** | `costDailyAsc` | 持有期内单日花费最少，过期机器安全沉底，适合精打细算的买家 |
| **📶 剩余流量最多** | `trafficDesc` | 智能正则解析全行网络数据，按流量可用存量比例重排 |

> **注**：原“天数最长”排序因业务逻辑失真（年付无脑置顶碾压月付、掩盖高续费负资产机型）已被彻底废除。

### 5. 🎛️ 现代 HUD 控制面板与多维联动筛选
- **周期三段式快捷切换**：集成 `【全部】`、`【月付】`、`【年付】` 胶囊组，买家一键切片筛选；
- **双重级联隐藏防御机制**：
  - `隐藏被墙 IP`：一键过滤所有被墙、被锁机器，只看正常 IP；
  - `只看折价(倒贴)`：一键剔除所有溢价加价机，只保留捡漏机器；
  - 隐藏时同时赋予 `.xrv-filter-hidden` 与行内 `style.display="none !important"`，彻底免疫宿主样式冲刷；
- **实时统计大盘**：实时呈现“共 N 台 (IP正常 X / 被墙 Y) · 折价捡漏 Z 台”。

### 6. 🌙 明暗双模 Design Tokens 架构
- 全面适配 Arco Design（`[arco-theme="dark"]`）、Tailwind CSS 类（`.dark`）、`[data-theme="dark"]`、平台样式及系统媒体查询；
- 卡片内嵌虚线、底槽轨道与 5 级折溢价徽章均基于半透明深底调色，杜绝夜间刺目眩光。

---

## 📥 安装使用

### 方式一：直接安装（推荐）

在已安装油猴扩展（Tampermonkey、Violentmonkey 或 ScriptCat）的浏览器中点击下方安装链接即可一键安装：

👉 **[安装脚本 (GitHub Raw)](https://raw.githubusercontent.com/j2st1n/vps-marketplace-assistant/main/vps-marketplace.user.js)**

### 方式二：本地开发实时热重载 (Dev Mode)

适合修改与调试脚本源码：
1. 克隆本项目并在本地启动服务：
   ```bash
   git clone https://github.com/j2st1n/vps-marketplace-assistant.git
   cd vps-marketplace-assistant
   bash start-dev.sh
   # 本地调试服务将启动在 http://127.0.0.1:8788
   ```
2. 安装本地开发加载器：
   👉 **`http://127.0.0.1:8788/dev.loader.user.js`**
3. 之后每次修改 `vps-marketplace.user.js`，刷新浏览器页面即可自动执行最新代码，无需反复重新安装。

---

## 🧪 本地三合一仿真调试沙盒

本项目内置全真三平台本地仿真调试沙盒，无需任何原站账号即可在本地验证全部逻辑：

- **控制台主页**：`http://127.0.0.1:8788/`
- **三合一全功能调试沙盒**：`http://127.0.0.1:8788/mock-marketplace.html`
  - 动态无感切换 **Akile** (Arco 栅格) / **Panstar** (CSS Grid) / **Isvoro** (Shadcn-Vue / Tailwind)；
  - 预设 24 张各站点代表性真实卡片样本（含倒贴神机、年付传家宝、被墙机、大流量机与过期机）；
  - 提供“运行排序与筛选自动化验收测试”、“模拟 SPA 异步载入卡片”与“模拟路由切换”交互按钮；
  - 支持多维度明暗主题即时切换。

---

## 🔬 自动化回归测试套件

本项目配备严密的端到端自动化回归与边界测试套件（覆盖 14 阶段、92 项全量测试断言）：

```bash
node test-regression.js
```

测试范围全面覆盖：
1. 源码静态与规范审查（新老特性防异味）；
2. 多周期解析（月付/季付/半年付/年付/周付）与流量分子分母提取；
3. 6 维科学排序矩阵区分度与准确性；
4. 分类与多条件组合筛选；
5. 本地三合一仿真沙盒完备性；
6. 暗色模式 Design Tokens 规范；
7. IP 状态探测流水线与三级降级；
8. IP 判定与防误判清洗矩阵（排除防火墙、锁价、未阻断等干扰）；
9. 双重级联隐藏防御机制；
10. Akile / Panstar / Isvoro 全真 DOM 交互、排序与筛选验证；
11. Panstar 公开市场与控制台双模路由识别、无类名 `<dl><dt><dd>` 规格解析与 IP 阻断识别。

---

## 📋 更新日志

### v0.5.1
- **Panstar 公共市场双模全面适配**：
  - **路由守卫放行**：放行条件扩展为 `path.startsWith('/console/marketplace') || path.startsWith('/marketplace')`，补齐 `@match *://*.panstar.hk/*` 与 `*://*.panstar.ai/*` 元数据；
  - **规格列表兼容提取**：`findField` 支持 `.console-marketplace-spec-row, dl > div, dl > div.grid` 与全卡片语义回退，彻底解决非控制台公开市场模式下无类名 `<dt><dd>` 解析失败问题；
  - **IP 状态探测与沉底增强**：网格选择器扩充 `.marketplace-public-grid`，状态选择器支持 `.console-marketplace-action-small`，阻断正则扩充 `reachability issue` 与 `疑似受限` 关键词；
  - **沙盒与测试升级**：`mock-marketplace.html` 增加 Panstar 控制台与公开市场双模切换仿真示例，`test-regression.js` 新增阶段 14 专有测试套件，断言增至 92 项且 100% 通过。

### v0.5.0
- **全量合并 Isvoro 市场支持**：
  - 接入 `SITES.isvoro` 适配器，支持 Shadcn-Vue 卡片与 `<dl>` 键值网格提取；
  - 创新设计 `row` 指向 `dl` 容器，保护两列网格布局，metrics 容器自然流式布局；
  - 支持 Vue 3 骨架屏动态跳过与自愈重填；
- **三合一多站点架构演进**：
  - 仓库由 `panstar-akile-marketplace-tool` 正式迁移命名为 `vps-marketplace-assistant`；
  - 插件品牌升级为《VPS 交易所助手》（英文《VPS Marketplace Assistant》）；
  - 主脚本重命名为 `vps-marketplace.user.js` 并保持完整提交历史；
- **调试沙盒与工具链升级**：
  - `mock-marketplace.html` 升级为三合一仿真沙盒，新增 Isvoro 原生视图与动态无感切换；
  - 本地测试套件扩展至 13 阶段全量 73 项断言 100% 通过；
  - 多周期续费解析升级，全面支持月付、季付、半年付、年付、周付及归一化月均折算。

### v0.4.4
- **面板标题亲和度优化**：将原本晦涩的内部技术代号“⚡ XRV 交易所助手”正式更名为“**⚡ 交易所剩余价值助手**”（英文模式同步为 `⚡ Marketplace Value Assistant`）。

### v0.4.3
- **统计看板语义优化**：顶部 HUD 实时数据看板中，将原“正常 / 异常”文案优化调整为“**IP正常 / 被墙**”（英文模式同步为 `Normal IP / Blocked`），清晰直观对应右侧“隐藏被墙 IP”筛选器。

### v0.4.2
- **重构全卡片智能 IP 状态探测流水线（三级降级流水线）**：
  - Level 1 专属状态节点 + Level 2 结构化备用回退 + Level 3 全卡片高精度文本扫描；
  - 引入防误判清洗矩阵，严格排除“防火墙”、“锁价”、“不锁频”、“未阻断”等良性规格描述；
  - 双重级联隐藏防御机制：`.xrv-filter-hidden` 与行内 `style.display="none !important"` 结合。

### v0.4.1
- **全面适配暗色模式**：重构 CSS 样式体系为基于 CSS Custom Properties 的全景 Design Tokens 架构；
- 支持 Arco Design、通用 `.dark`、`[data-theme="dark"]` 与系统媒体查询；
- 卡片内嵌虚线、进度槽与 5 级折溢价徽章防眩光深度适配。

### v0.4.0
- **排序深度重构**：废除业务失真的“天数最长”排序，新增 `🔥 折扣最大` 与 `👑 月均续费最低`；
- **周期筛选**：HUD 增加【全部 / 月付 / 年付】三段式周期切换；
- **修复流量提取 Bug**：解决 `xrvTrafficRatio` 恒为 0 导致流量最多排序无变化的缺陷。

### v0.3.0
- **生命周期重构**：History AOP 路由引擎与数据指纹状态机；
- 引入 IP 异常 1 亿权重绝对沉底机制；
- 现代 HUD 控制面板与双开关筛选。

---

## 📜 开源许可与致谢

- 本项目基于 [MIT License](./LICENSE) 协议开源；
- **致谢与灵感**：感谢 SI Xiaolong 的《Akile 交易所剩余价值计算器》（Greasy Fork ID: 576546）提供的灵感思路，以及早期版本作者 hj6lago7 的贡献。

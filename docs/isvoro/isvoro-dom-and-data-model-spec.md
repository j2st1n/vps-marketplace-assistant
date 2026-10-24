# Isvoro 交易所插件：前端 DOM 结构、Tailwind Token 与数据模型契约规范

> **版本**：v1.0.0 (生产逆向与适配层规格发布)  
> **责任阶段**：架构与数据分析师 (`analyst`)  
> **适用工程**：`userscripts/isvoro-marketplace-tool/`  
> **逆向目标**：`https://isvoro.com/marketplace` 及相关构建物 (`Marketplace-hC8CaW6f.js`, `api-modules-0EKLAvsn.js`, `admin-api-Ccp1pSNp.js`, `index-DdPxODzB.css`)

---

## 1. 目标与分析方法论

本技术规范旨在通过对 Isvoro 云服务平台前端源码的系统性深度逆向工程，全面解构其二手交易市场 (`/marketplace`) 的页面拓扑、组件渲染逻辑、Tailwind 变量设计系统与底层 API 数据契约，为后续开发高性能、高容错、无侵入的用户脚本（油猴插件）提供明确、标准、生产级的技术准绳。

分析手段结合了：
1. 生产环境 Webpack/Vite 打包产物抽象语法树（AST）逆向与模块依赖图谱分析；
2. Vue 3 编译后模板渲染函数（Render Functions）深度还原；
3. Tailwind CSS HSL Design Tokens 提取与暗黑模式机制匹配；
4. 真实 REST API 接口拦截与跨币种、跨周期数据实体定义。

---

## 2. 页面拓扑与 DOM 容器结构深度剖析

Isvoro 前端基于 **Vue 3 + Vite + Reka UI (Radix Vue) + Tailwind CSS** 构建。整个市场模块被封装为单一大型懒加载异步组件 `Marketplace-hC8CaW6f.js`，挂载于应用路由 `/marketplace`。

### 2.1 整体页面层级与 Tabs 结构

市场页面采用标准的垂直堆叠与标签页布局：

```text
div#app
 └─ main / div.space-y-6
     ├─ [PageHeader] 顶部标题栏 ("二手市场" / "Marketplace")
     └─ div[role="tablist"] / div.flex-wrap.h-auto (TabsRoot / TabsList)
         ├─ button[role="tab"][data-state="active"] (浏览 / Browse, value="browse")
         ├─ button[role="tab"] (我的挂单 / My listings, value="my")
         ├─ button[role="tab"] (交易记录 / Trades, value="trades")
         ├─ button[role="tab"] (推送记录 / Transfers, value="push")
         └─ button[role="tab"] (市场余额 / Balance, value="balance")
```

当选中“浏览”标签时，对应面板呈现：
```html
<div role="tabpanel" data-state="active" class="space-y-4">
  <!-- 1. 若市场关闭：闭市告警横条 (Et) -->
  <!-- 2. 过滤与操作工具栏 (kt) -->
  <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
    <!-- 左侧：刷新按钮与投诉邮箱 -->
    <div class="flex items-center gap-2 flex-wrap">
      <button class="... size-4 ...">刷新</button>
      <div class="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/10 text-sm text-primary">...</div>
    </div>
    <!-- 右侧：地区下拉筛选与搜索框 -->
    <div class="flex items-center gap-2 flex-wrap">
      <!-- 地区选择 Select -->
      <button type="button" role="combobox" class="w-44 ...">全部地区</button>
      <!-- 搜索框容器 (Lt) -->
      <div class="relative">
        <input class="pr-10 w-64 ..." placeholder="搜索商品名称" />
        <button type="button" class="absolute right-0 top-0 h-full px-3 ...">搜索</button>
      </div>
    </div>
  </div>

  <!-- 3. 上架规则简述与买家提醒警告框 (zt / Bt) -->
  <p class="text-xs text-muted-foreground">上架最低售价 10 元 · 平台成交手续费 5%</p>
  <div class="flex items-start gap-3 p-4 rounded-md border border-warning/40 bg-warning/10 text-sm text-warning">
    <div class="space-y-1 leading-relaxed">
      <p>购买前请谨慎考虑，慎重购买高溢价值商品...</p>
    </div>
  </div>

  <!-- ★ 插件 HUD 控制台黄金注入锚点 (Insert Point) ★ -->

  <!-- 4. 骨架屏占位容器 (Ut, loading 状态) -->
  <!-- <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"> 包含 6 个 h-80 skeleton 占位卡片 -->

  <!-- 5. 真实卡片网格容器 (Wt) -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    <!-- 各卡片元素 (Card) -->
  </div>
</div>
```

### 2.2 卡片容器与内部微结构（Card Element Topology）

每张在售机器卡片由 Shadcn-Vue 的 `Card`、`CardHeader`、`CardContent`、`CardFooter` 组件组成。

#### 2.2.1 卡片外层容器选择器与类名
* **标签名**：`div`
* **类名特征**：`rounded-xl border bg-card text-card-foreground shadow-sm flex flex-col`
* **动画标记**：包含 `reveal-item` 类及内联样式 `--ri: <index>`
* **识别选择器契约**：
  - 精确卡片选择器：`.grid.grid-cols-1 > div.rounded-xl.border.bg-card` 或 `.grid > div.flex.flex-col.rounded-xl`
  - 通用网格选择器：`.grid.grid-cols-1.md\:grid-cols-2.lg\:grid-cols-3.gap-4`

#### 2.2.2 卡片头部（CardHeader）
```html
<div class="pb-3"> <!-- CardHeader, class: pb-3 -->
  <!-- 主机名 / 套餐名 / 服务编号 -->
  <div class="flex items-start justify-between gap-2">
    <div class="text-lg font-semibold leading-tight">HK-BGP-Standard-01</div>
    <svg aria-hidden="true" class="size-4 text-muted-foreground shrink-0">...</svg>
  </div>
  <!-- IP 状态标签徽章容器 (Kt: class="mt-1") -->
  <div class="mt-1">
    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-success bg-success/15">[IP正常]</span>
    <!-- 或被墙状态： -->
    <!-- <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-destructive bg-destructive/10">[IP被墙]</span> -->
  </div>
</div>
```

#### 2.2.3 卡片规格主体（CardContent）
CardContent 为包含 8 个规格维度的定义列表 `<dl>`，采用两列 CSS Grid 排版：
```html
<div class="flex-1 flex flex-col">
  <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
    <!-- 1. 地区 (Region) -->
    <dt class="text-muted-foreground">地区</dt>
    <dd><span class="mr-1">🇭🇰</span>香港</dd>

    <!-- 2. 套餐 (Plan) -->
    <dt class="text-muted-foreground">套餐</dt>
    <dd>HK-BGP-Standard-1C1G</dd>

    <!-- 3. 配置 (Config) -->
    <dt class="text-muted-foreground">配置</dt>
    <dd>1 核 1024M 20GB</dd>

    <!-- 4. 网络 (Network) -->
    <dt class="text-muted-foreground">网络</dt>
    <dd>
      带宽 500M 
      流量 <span class="underline decoration-dotted">150 GB / 1000 GB</span>
    </dd>

    <!-- 5. IP -->
    <dt class="text-muted-foreground">IP</dt>
    <dd>v4 1 个 v6 1 个</dd>

    <!-- 6. 续费价格 (Renewal Price) -->
    <dt class="text-muted-foreground">续费价格</dt>
    <dd class="text-primary">¥45.00/月</dd>

    <!-- 7. 重置流量 (Reset Traffic) -->
    <dt class="text-muted-foreground">重置流量</dt>
    <dd class="text-primary">¥10.00</dd>

    <!-- 8. 到期时间 (Expires At) -->
    <dt class="text-muted-foreground">到期时间</dt>
    <dd>2026-11-20 18:00</dd>
  </dl>

  <!-- ★ 插件价值计算扩展行注入锚点 (Injected Value Metrics Row) ★ -->

  <!-- 卡片底部操作栏 (CardFooter: on) -->
  <div class="flex items-end justify-between pt-4 mt-auto border-t">
    <div class="text-2xl font-bold text-primary">¥25.00</div>
    <button type="button" class="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-3 bg-primary text-primary-foreground hover:bg-primary/90">
      购买
    </button>
  </div>
</div>
```

---

## 3. Tailwind CSS 设计系统与暗黑模式适配规范

Isvoro 前端全面采用现代 **Tailwind CSS 3 + CSS 变量 (HSL 格式)** 架构。页面明暗主题切换直接通过在 `<html>` 根元素上增删 `.dark` 类驱动。

### 3.1 核心 HSL Token 映射表

| 设计变量 (CSS Variable) | 亮色模式 (:root) | 暗色模式 (.dark) | 业务语义与插件应用 |
| :--- | :--- | :--- | :--- |
| `--background` | `0 0% 100%` (白) | `224 71% 4%` (极致深黑) | 全局背景 |
| `--foreground` | `222.2 47.4% 11.2%` | `210 40% 98%` (近白) | 正文主要文本 |
| `--card` | `0 0% 100%` | `224 71% 6%` (微深灰蓝) | 卡片/HUD 背景底色 |
| `--card-foreground` | `222.2 47.4% 11.2%` | `210 40% 98%` | 卡片主要文本 |
| `--border` | `214.3 31.8% 91.4%` | `217.2 32.6% 17.5%` | 边框线条分割线 |
| `--border-subtle` | `214.3 31.8% 94%` | `217.2 32.6% 14%` | 极细装饰线 |
| `--primary` | `221 83% 53%` (亮蓝) | `217 91% 60%` (明亮电光蓝) | 品牌主色、售价强调色 |
| `--primary-foreground` | `210 40% 98%` | `222.2 47.4% 11.2%` | 主按钮文本色 |
| `--muted` | `210 40% 96.1%` | `217.2 32.6% 17.5%` | 次级浅灰背景、徽章底色 |
| `--muted-foreground` | `215.4 16.3% 44%` | `215 20.2% 65.1%` | 标签 Label 文本弱化色 |
| `--success` | `142 71% 45%` (正绿) | `142 65% 45%` (柔和翠绿) | IP正常、超值倒贴绿色 |
| `--destructive` | `0 84.2% 48%` (正红) | `0 62.8% 50%` (警告正红) | IP被墙、严重溢价红色 |
| `--warning` | `38 92% 50%` (明黄橙) | `38 92% 55%` (柔和金橙) | 折扣力度、适度溢价金黄色 |
| `--radius` | `.625rem` (10px) | `.625rem` (10px) | 统一圆角基准 |

### 3.2 插件样式注入最佳实践（Zero Color Hardcoding）

为确保插件在亮色与暗色模式下均获得与宿主原生界面 100% 毫无违和感的视觉融合，**严禁在插件 CSS 中写死十六进制绝对色值（如 `#ffffff` 或 `#1a1a1a`）**，必须直接复用宿主的 CSS HSL 变量：

```css
/* 插件 HUD 与扩展卡片行无缝继承宿主主题变量 */
.isvoro-xrv-hud {
  background: hsl(var(--card));
  color: hsl(var(--card-foreground));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
}

.isvoro-xrv-badge-deal {
  background: hsla(var(--success), 0.15);
  color: hsl(var(--success));
}

.isvoro-xrv-badge-premium {
  background: hsla(var(--destructive), 0.1);
  color: hsl(var(--destructive));
}

.isvoro-xrv-text-muted {
  color: hsl(var(--muted-foreground));
}
```

---

## 4. 数据模型契约与 API 架构

Isvoro 后端遵循标准 RESTful API 规范，API 统一前缀为 `/api/v1`。

### 4.1 核心列表接口：`GET /api/v1/marketplace`

* **鉴权策略**：需要用户登录 Cookie / Token；未登录返回 `{"code": -1, "message": "AUTH_NOT_LOGGED_IN"}`。
* **请求参数 (Query Params)**：
  - `page` (number): 页码（从 1 开始）。
  - `per_page` (number): 每页条数（宿主默认为 100，最大支持多页抓取累计至 2000 台）。
  - `q` (string): 搜索关键词（按商品/套餐/主机名过滤）。
  - `location_id` (number): 地区 ID（可选，`__all__` 为全部）。
* **响应结构 (Response JSON)**：
  ```typescript
  interface MarketplaceResponse {
    code: number;          // 0 为成功
    message: string;       // "SUCCESS"
    data: MarketplaceItem[];
    meta: {
      page: number;
      per_page: number;
      total: number;
    };
  }
  ```

### 4.2 交易挂单对象实体规范 (`MarketplaceItem`)

通过深度静态解析 `Marketplace-hC8CaW6f.js` 的 `Ki`、`qi`、`Ji`、`Yi`、`Xi`、`Zi` 与 `Li` 函数，提取出核心字段契约：

```typescript
interface MarketplaceItem {
  id: number;                 // 市场挂单编号，如 1001
  service_id: number;         // 关联的实例服务 ID，如 2001
  price: number;              // 挂牌售价，如 25.00
  currency_code: string;      // 币种代码，如 "CNY"、"USD"
  ip_status: "normal" | "blocked"; // IP 状态枚举
  description?: string;       // 卖家留存备注/转让说明
  created_at: string;         // 上架时间 (ISO 8601 UTC)
  
  // 云服务器详细规格对象
  server_info: {
    hostname?: string;        // 实例主机名，如 "hk-bgp-bonus-01"
    plan_name?: string;        // 套餐名称，如 "HK-BGP-Standard-1C1G"
    location_name?: string;    // 所在区域名称，如 "香港"、"东京"
    region?: string;           // 区域缩写代码，如 "HK"、"JP"、"US"
    node?: string;             // 节点集群名称，如 "hk-node-01"
    ipv4_count: number;        // IPv4 数量，通常为 1
    ipv6_count: number;        // IPv6 数量，0 或 1
    renewal_price: number;     // 周期续费价格，如 45.00
    renewal_currency?: string; // 续费币种，缺省回退到 currency_code
    billing_unit: "month" | "year" | "quarter" | "halfYear" | "week" | "day" | "hour"; // 计费周期单位
    billing_period: number;    // 周期乘数（如 billing_unit="month" 且 billing_period=12 代表年付）
    traffic_reset_price?: number | null; // 重置流量费用，如 10.00
    expires_at: string;        // 到期时间戳字符串，如 "2026-11-20 18:00" 或 ISO 串
    bandwidth_usage?: string;  // 已用流量显示字符串，如 "150 GB"
    
    // 规格参数
    spec?: {
      cores: number;           // CPU 核心数，如 1
      memory_mb: number;       // 内存容量 (MB)，如 1024
      disk_gb: number;         // 存储容量 (GB)，如 20
      traffic_gb: number;      // 周期总流量 (GB)，如 1000；0 代表不限流量
      bandwidth_mbps: number;  // 端口带宽峰值 (Mbps)，如 500
    };
    
    // 备用动态配置参数（自定义机型）
    config?: {
      cores: number;
      extra_cores?: number;
      memory: number;
      extra_memory_gb?: number;
      disk: number;
      extra_disk_gb?: number;
      traffic_multiplier?: number;
      extra_traffic_gb?: number;
    };
  };

  service?: {
    product?: {
      name: string;            // 产品族名称，如 "香港 BGP 云主机"
    };
  };
}
```

---

## 5. 卡片元素字段提取与高鲁棒性适配规范

在浏览器用户脚本运行态，脚本主要通过操作宿主 DOM 实现轻量、快速、无侵入渲染。针对宿主卡片内部各要素，建立如下高容错提取路径：

### 5.1 标题提取规范
* **提取路径**：`card.querySelector('.pb-3 .text-lg')`
* **回退路径**：`card.querySelector('[class*="font-semibold"]')`
* **业务意义**：宿主函数 `Zi(a)` 依次降级：`hostname -> product.name -> plan_name -> '#'+service_id`。

### 5.2 IP 状态探测规范（枚举、类名与三级回退）
宿主源码显式定义状态转换映射 `Xi(ip_status)`：
- `blocked`: label 为 `marketplace.ipStatusBadge.blocked`，徽章类为 `text-destructive bg-destructive/10`；
- `normal` / 其它: label 为 `marketplace.ipStatusBadge.normal`，徽章类为 `text-success bg-success/15`。

#### 文本多语言规范
- **中文模式 (zh-CN / zh-TW)**：`[IP正常]` vs `[IP被墙]`
- **英文模式 (en)**：`[IP OK]` vs `[Blocked]`

#### 状态探测流水线 (Detection Pipeline)
1. **专用选择器探测**：`card.querySelector('.pb-3 span[class*="text-destructive"], .pb-3 span[class*="text-success"]')`
2. **文本特征正则匹配**：
   - `isBlocked`: `/(?:ip|IP)?\s*(?:被墙|阻断|封锁|封禁|不可达|失联|污染)|\b(?:blocked|banned|unreachable|gfw)\b/i`
   - `isNormal`: `/(?:ip|IP)?\s*(?:正常|OK|ok|良好)|\b(?:normal|healthy)\b/i`
3. **清洗与防误判机制**：清洗掉含有“防火墙”、“锁价”等可能包含关键字的干扰描述。

### 5.3 规格字段 `<dl>` 键值对提取映射表

由于宿主使用 `<dl>` 结构，最稳健的做法是遍历所有 `<dt>`，根据其内容匹配字段，然后提取相邻的 `<dd>`：

```javascript
function extractCardSpec(card) {
  const dts = card.querySelectorAll('dl dt');
  const result = {};
  for (const dt of dts) {
    const key = dt.textContent.trim();
    const dd = dt.nextElementSibling;
    if (!dd) continue;
    const val = dd.textContent.trim();
    
    if (/地区|Region/i.test(key)) result.region = val;
    else if (/套餐|Plan/i.test(key)) result.plan = val;
    else if (/配置|Config/i.test(key)) result.config = val;
    else if (/网络|Network/i.test(key)) {
      result.networkRaw = val;
      result.trafficEl = dd.querySelector('.underline') || dd;
    }
    else if (/^IP$/i.test(key)) result.ip = val;
    else if (/续费价格|Renewal/i.test(key)) result.renewalRaw = val;
    else if (/重置流量|Reset\s*traffic/i.test(key)) result.trafficResetRaw = val;
    else if (/到期时间|Expires/i.test(key)) result.expiresRaw = val;
  }
  return result;
}
```

### 5.4 售价与币种提取
* **售价元素**：`card.querySelector('.pt-4 .text-2xl')`
* **解析方式**：
  - 提取原始文本（如 `¥25.00` 或 `$15.00` 或 `CN¥380.00`）；
  - 正则匹配货币符号与金额数值：`/([¥$€£]|CN¥)?\s*([\d,]+(?:\.\d+)?)/`；
  - 售价数值提取为浮点数，币种提取为标准化代码 (`CNY` / `USD` 等)。

---

## 6. 周期、货币、续费与到期时间计算模型规范

### 6.1 周期单位天数映射 (`billing_unit` + `billing_period`)

通过逆向宿主 `b4` 函数，确认官方周期长度定义算法：

```javascript
function getCycleDays(unit, period = 1) {
  const p = Math.max(1, Number(period) || 1);
  switch (unit) {
    case 'year':
      return 365 * p;
    case 'week':
      return 7 * p;
    case 'day':
      return 1 * p;
    case 'hour':
      return (1 / 24) * p;
    case 'month':
    default:
      // 当 unit 为 month 时：
      if (p === 12) return 365;   // 12 个月统一按年计 365 天（或平年 360/365）
      if (p === 6) return 180;    // 半年 180 天
      if (p === 3) return 90;     // 季度 90 天
      return 30 * p;              // 月付 30 天
  }
}
```

### 6.2 续费文本解析与归一化月均续费成本 ($C_{monthly\_renew}$)

从 `¥45.00/月` 或 `¥480.00/年` 或 `¥135.00/季` 提取周期与基础价格：
- 周期类型：
  - 年付 (`/年` 或 `/yr` 或 `billing_unit="year"` / `period=12`)
  - 半年付 (`/半年` 或 `/half-year` 或 `period=6`)
  - 季付 (`/季` 或 `/quarter` 或 `period=3`)
  - 月付 (`/月` 或 `/mo` 或 `period=1`)
- **归一化月均续费成本**：
  $$C_{monthly\_renew} = \begin{cases} 
  \text{renewal\_price} / 12 & \text{年付} \\
  \text{renewal\_price} / 6 & \text{半年付} \\
  \text{renewal\_price} / 3 & \text{季付} \\
  \text{renewal\_price} & \text{月付}
  \end{cases}$$

### 6.3 到期时间与剩余天数计算规范

宿主到期时间格式为 `YYYY-MM-DD HH:mm` 或 ISO 时间戳。
- **解析算法**：将文本统一清洗（`-` 替换 `/`），生成本地有效 Date 对象。
- **剩余天数浮点计算**：
  $$\text{remainingDaysFloat} = \frac{T_{expire} - T_{now}}{86400000}$$
- **向上整天计算**（与宿主 `_4` 保持完全一致）：
  $$\text{remainingDays} = \max(0, \lceil \text{remainingDaysFloat} \rceil)$$

### 6.4 剩余价值与溢价/倒贴额模型

1. **剩余价值 ($V_{rem}$)**：
   $$V_{rem} = \text{renewal\_price} \times \frac{\max(0, \text{remainingDaysFloat})}{\text{cycleDays}}$$
2. **溢价 / 倒贴额 ($\Delta P$)**：
   $$\Delta P = P_{sale} - V_{rem}$$
   - 若 $\Delta P < 0$：属于**折价/倒贴甩卖**，倒贴额为 $|\Delta P|$，界面展示为 `🎁 倒贴 ¥XX.XX`；
   - 若 $\Delta P > 0$：属于**加价/溢价流转**，溢价额为 $\Delta P$，界面展示为 `溢价 ¥XX.XX`；
   - 若 $\Delta P = 0$：平价转让。
3. **实际折扣率 (Discount Rate)**：
   $$\text{DiscountRate} = \frac{P_{sale}}{V_{rem}}$$
   - 例如 $V_{rem} = 45$，售价 $25$，折扣率为 $25/45 \approx 0.556$（即 **-44% / 5.6 折**）。
4. **接手日均成本 ($C_{daily}$)**：
   $$C_{daily} = \frac{P_{sale}}{\max(1, \text{remainingDaysFloat})}$$

---

## 7. 6 维科学排序矩阵与被墙机器沉底算法

为确保买家体验并惩罚网络受损资产，确立以下打分矩阵（得分越低越优先排在前面）：

### 7.1 被墙机器沉底惩罚机制 (100,000,000 权重)
$$\text{ipPenalty} = \begin{cases} 100000000 & \text{if isBlocked} \\ 0 & \text{if normal} \end{cases}$$
任何 IP 异常或被墙机器，其打分直接叠加 1 亿基数，保证**在任何正向排序模式下均绝对沉底在所有正常卡片之后**。

### 7.2 排序模式得分函数

| 模式 Key | 模式名称 | 打分公式 (Score，升序排序，越小越靠前) | 说明 |
| :--- | :--- | :--- | :--- |
| `bonus` | **倒贴最多** | $\text{ipPenalty} + \Delta P$ | 让利倒贴金额最大的排在最前 |
| `discount` | **折扣最大** | $\text{ipPenalty} + \text{DiscountRate}$ | 相对打折力度最大的排在最前 |
| `renew` | **月均续费最低** | $\text{ipPenalty} + C_{monthly\_renew}$ | 长期持有成本最低的排在最前 |
| `daily` | **日均成本最低** | $\text{ipPenalty} + C_{daily}$ | 接手后到期日前每日分摊支出最低 |
| `traffic` | **剩余流量最多** | $\text{ipPenalty} - (\text{trafficRemainingRatio} \times 100)$ | 剩余流量比例最高（降序）排在最前 |
| `default` | **默认综合** | $\text{ipPenalty} + \text{originalIndex}$ | 保持原站默认上架次序，但被墙机沉底 |

---

## 8. 适配器生命周期与容错设计契约

1. **SPA 路由监听**：监听 `window.location.pathname === '/marketplace'`，劫持 `history.pushState` 与 `history.replaceState`，监听 `popstate`。
2. **防重复注入**：使用卡片签名机制 `card.dataset.isvoroXrvSignature = '${id}_${price}_${expires}'`，防止 MutationObserver 反复重绘死循环。
3. **骨架屏容错**：在卡片为骨架屏占位（含 `h-80` 或未渲染 `<dl>`）时跳过处理，不给骨架屏打上永久完成标记，等待真实数据注入后再激活计算。
4. **离开路由自动销毁**：用户导航离开 `/marketplace` 时，及时断开 MutationObserver，移除注入的 HUD 节点，清理内存残留。

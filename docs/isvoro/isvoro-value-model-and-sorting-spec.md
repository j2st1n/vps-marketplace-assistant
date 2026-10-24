# Isvoro 二手交易市场：科学排序算法、价值模型与 SPA 生命周期技术规范

> **版本**：v1.0.0 (生产级设计与架构规范)  
> **责任阶段**：架构与数据分析师 (`analyst`)  
> **适用模块**：`userscripts/isvoro-marketplace-tool/`（包括核心用户脚本、本地加载器、仿真沙盒与回归测试）

---

## 1. 核心价值理念与设计哲学

在二手 VPS 交易场景中，传统平台仅简单罗列“售价”与“续费价格”，买家需要心算“距离下次续费还有多少天”、“周期总天数是多少”、“折合原价剩余多少价值”、“卖家到底是在溢价加价割韭菜，还是亏本倒贴甩卖”、“长期持有的月均续费是多少”。

本项目借鉴工作区成熟架构，为 Isvoro 市场提供“**秒级透明化价值计算**”与“**防踩坑科学排序**”：
1. **真实剩余价值可视化**：计算每台机器实际剩余时间占周期的资金份额；
2. **倒贴 / 溢价一目了然**：让利甩卖标出醒目绿色倒贴额，高溢价标出红色溢价额；
3. **6 维多因子科学排序**：无论按倒贴额、折扣率还是月均续费，被墙/异常机器通过 1 亿高惩罚基数强制沉底，彻底杜绝买家误入网络阻断陷阱；
4. **SPA 零感知静默加载**：从任何页面跳转至 `/marketplace` 均秒级即时注入，无须手动 F5 刷新。

---

## 2. 科学价值模型与数学公式推导

### 2.1 基础参数定义
设某卡片包含以下规格与交易参数：
- $P_{sale}$：挂单标价（售价，如 25.00 元）
- $P_{renew}$：周期续费价格（如 45.00 元）
- $U_{billing}$：计费周期单位（如 `month`、`year`、`quarter`、`halfYear` 等）
- $N_{period}$：周期倍数（如 1、3、6、12）
- $T_{expire}$：到期绝对时间戳
- $T_{now}$：当前计算时刻时间戳

### 2.2 周期天数映射 ($D_{cycle}$)
根据 Isvoro 源码逆向确立的官方周期映射规则：
$$D_{cycle} = \begin{cases}
365 \times N_{period} & \text{若 } U_{billing} = \text{'year'} \\
365 & \text{若 } U_{billing} = \text{'month'} \text{ 且 } N_{period} = 12 \text{ (年付)} \\
180 & \text{若 } U_{billing} = \text{'month'} \text{ 且 } N_{period} = 6 \text{ (半年付)} \\
90 & \text{若 } U_{billing} = \text{'month'} \text{ 且 } N_{period} = 3 \text{ (季付)} \\
30 \times N_{period} & \text{若 } U_{billing} = \text{'month'} \text{ 且 } N_{period} \in \{1, 2, \dots\} \\
7 \times N_{period} & \text{若 } U_{billing} = \text{'week'} \\
1 \times N_{period} & \text{若 } U_{billing} = \text{'day'} \\
\end{cases}$$

### 2.3 剩余天数计算 ($D_{remain}$)
- **浮点精确剩余天数**：
  $$D_{float} = \frac{T_{expire} - T_{now}}{86400000}$$
- **向上取整显示天数**（对齐 Isvoro 宿主 `_4` 与 `Ai` 规范）：
  $$D_{remain} = \max(0, \lceil D_{float} \rceil)$$

### 2.4 剩余价值计算 ($V_{rem}$)
根据周期价格与剩余有效时间比例计算机器当前时刻的物理剩余资费：
$$V_{rem} = P_{renew} \times \frac{\max(0, D_{float})}{D_{cycle}}$$

### 2.5 倒贴 / 溢价额计算 ($\Delta P$)
$$\Delta P = P_{sale} - V_{rem}$$
- **倒贴（让利折价甩卖）**：当 $\Delta P < -0.01$ 时
  $$\text{Bonus} = |\Delta P| = V_{rem} - P_{sale}$$
  UI 表现：显示绿底白字或高对比度徽章 `🎁 倒贴 ¥XX.XX`（或小额折价）。
- **平价流转**：当 $|\Delta P| \le 0.01$ 时
  UI 表现：显示 `平价转让`。
- **溢价（加价出鸡）**：当 $\Delta P > 0.01$ 时
  $$\text{Premium} = \Delta P$$
  UI 表现：显示红底或浅红文本 `溢价 ¥XX.XX`。

### 2.6 实际折扣率 (Discount Rate, $R_{discount}$)
$$R_{discount} = \begin{cases}
\frac{P_{sale}}{V_{rem}} & \text{若 } V_{rem} > 0 \\
1.0 & \text{若 } V_{rem} \le 0 \text{ 且 } P_{sale} = 0 \\
\infty & \text{若 } V_{rem} \le 0 \text{ 且 } P_{sale} > 0 \\
\end{cases}$$
- 当 $R_{discount} < 1.0$ 时，折扣比例为 $(1 - R_{discount}) \times 100\%$，折数表达为 $(R_{discount} \times 10)\text{ 折}$。例如 $25 / 45 \approx 0.556 \rightarrow$ **-44% / 5.6 折**。

### 2.7 买家接手日均成本 ($C_{daily}$)
反映买家接手后至机器到期期间每天实际支出的持有成本：
$$C_{daily} = \frac{P_{sale}}{\max(1, D_{float})}$$

### 2.8 归一化月均续费成本 ($C_{monthly\_renew}$)
统一消除年付、季付、月付的周期差异，衡量长期持有一台机器的月付支出：
$$C_{monthly\_renew} = \begin{cases}
P_{renew} / 12 & \text{年付} \\
P_{renew} / 6 & \text{半年付} \\
P_{renew} / 3 & \text{季付} \\
P_{renew} & \text{月付}
\end{cases}$$

### 2.9 剩余流量比率 ($R_{traffic}$)
解析已用流量 $T_{used}$ 与总流量 $T_{total}$：
$$R_{traffic} = \begin{cases}
1.0 & \text{若 } T_{total} = 0 \text{ (无限流量型)} \\
\max\left(0, 1 - \frac{T_{used}}{T_{total}}\right) & \text{若 } T_{total} > 0
\end{cases}$$

---

## 3. 6 维科学排序矩阵与 1 亿权重沉底机制

### 3.1 被墙机器沉底核心算法
二手市场中最恶劣的情况莫过于买家接手后才发现机器 IP 已被 GFW 阻断导致无法直连。为绝对保护买家，设计**100,000,000 (一亿) 权重惩罚基数**：

$$\text{ipPenalty} = \begin{cases}
100000000 & \text{若卡片判定为 } \text{isBlocked} = \text{true} \\
0 & \text{若卡片判定为 } \text{isBlocked} = \text{false}
\end{cases}$$

无论在任何排序模式下，打分值均加上 $\text{ipPenalty}$。因所有正常卡片的打分都在 $[-10000, 100000]$ 之间，加上 1 亿后被墙卡片必然被**死死压在所有正常卡片之后**。

### 3.2 排序模式矩阵表

| 模式 Key | 模式名称 | 英文 | 打分算法 (Score) | 二级排序 (Tie-breaker) | 业务价值 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `bonus` | **倒贴最多** | Best Deals | $\text{ipPenalty} + \Delta P$ | 售价升序 | 让利倒贴金额最大、最具性价比的机器排在最前 |
| `discount` | **折扣最大** | Deepest Discount | $\text{ipPenalty} + R_{discount}$ | 倒贴额降序 | 相对打折力度最高（如 2 折、3 折神机）排在最前 |
| `renew` | **月均续费最低** | Lowest Renew | $\text{ipPenalty} + C_{monthly\_renew}$ | 售价升序 | 适合做低成本长期稳定挂机/建站用途 |
| `daily` | **日均成本最低** | Lowest Daily | $\text{ipPenalty} + C_{daily}$ | 售价升序 | 短期试玩或接盘过渡者持有日均开销最小 |
| `traffic` | **剩余流量最多** | Most Traffic Left | $\text{ipPenalty} - (R_{traffic} \times 100)$ | 绝对剩余流量降序 | 流量党与大带宽下载/代理用户最优选 |
| `default` | **默认综合** | Default Order | $\text{ipPenalty} + \text{DOMIndex}$ | 无 | 保留原站最新上架顺序，但剔除被墙机器置底 |

### 3.3 排序 DOM 实施机制（CSS Order 无损重排）
为防止直接操作 DOM 节点顺序引发 Vue 3 Virtual DOM 的 Diff 混乱或内部状态丢失，**禁止调用 `appendChild`/`insertBefore` 重新移动卡片 DOM 节点**，必须统一使用现代 CSS Flex/Grid `order` 属性实现无损视觉重排：

```javascript
cards.forEach((card, idx) => {
  const score = calculateScore(card, currentSortMode);
  card.style.order = String(Math.floor(score * 100));
});
```

---

## 4. 快捷智能筛选器规范

### 4.1 隐藏被墙机器 (`hideBlocked`)
- **防御机制**：采用“三级识别 + 行内级联样式”双保险：
  ```javascript
  if (filterState.hideBlocked && card.dataset.xrvBlocked === '1') {
    card.style.setProperty('display', 'none', 'important');
    card.classList.add('xrv-filter-hidden');
  } else {
    card.style.removeProperty('display');
    card.classList.remove('xrv-filter-hidden');
  }
  ```
- **统计联动**：实时联动 HUD 统计徽标：`总台数 / (IP正常 X 台 / 被墙 Y 台)`。

### 4.2 只看倒贴机 (`onlyBonus`)
- 仅展示 $\Delta P < -0.01$ 的亏本甩卖机器，方便用户在促销捡漏场景下一键聚焦。

### 4.3 周期分类筛选 (`cycleFilter`)
- `all`：全部展示
- `month`：仅展示月付机器（$U_{billing} = \text{'month'}$ 且 $N_{period} = 1$）
- `year`：仅展示年付机器（$U_{billing} = \text{'year'}$ 或 $N_{period} = 12$）

---

## 5. SPA 生命周期、骨架屏自愈与防死循环规范

### 5.1 路由劫持与监听
```javascript
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
```

### 5.2 骨架屏异步自愈状态机 (Skeleton Self-Healing)
1. **骨架屏识别**：若卡片包含 `h-80` 或未渲染 `<dl>` 结构，标记为 `pending` 状态，**不注入计算行，不设置完成标记**；
2. **签名比对与自愈**：利用规格指纹 `Signature = \`\${title}_\${price}_\${expires}\``。
3. 当 Vue 异步获取真实数据并替换骨架屏内容后，MutationObserver 捕获到子节点变化，指纹变化重新触发运算，注入扩展计算行。

### 5.3 离开路由自动清理
当用户切换到 `/dashboard`、`/services` 或 `/admin` 时：
1. 立即调用 `observer.disconnect()`；
2. 清除所有防抖定时器；
3. 移除已挂载的 `.isvoro-xrv-hud` 节点，还原页面至干净初始状态。

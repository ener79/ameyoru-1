# 启动指南

## 技术栈速览(2026)

| | |
|---|---|
| 框架 | Next.js 15 (App Router) + React 19 + TypeScript |
| 服务端动作 | Server Actions(全用,不写 REST 风格 API) |
| 样式 | Tailwind CSS v4 + shadcn/ui (New York style) |
| 字体 | Geist Sans / Geist Mono + 中文 fallback PingFang SC |
| ORM | Drizzle |
| 数据库 | SQLite(better-sqlite3) |
| 认证 | Better Auth(NextAuth 团队已并入 Better Auth) |
| 校验 | Zod |
| 通知 | Sonner |

## 跑起来

```bash
cd /Users/xin/mo
npm install
```

如果 peer deps 警告:`npm install --legacy-peer-deps`。

## 配置 .env

```bash
cp .env.example .env
```

编辑 `.env`,填两个值:

```env
# 必填:用于签 session 的密钥
BETTER_AUTH_SECRET=<openssl rand -base64 32 的结果>

# 老板的初始密码(只在第一次 seed 时使用,登录后强制改)
BOSS_INIT_PASSWORD=admin123
```

生成 secret:
```bash
openssl rand -base64 32
```

## 初始化数据库 + 创建老板

```bash
mkdir -p data
npm run db:push      # 把 schema 推到 SQLite
npm run db:seed      # 创建老板账号
```

`db:seed` 输出:
```
[seed] 已创建老板账号
       用户名:boss
       初始密码:admin123
       登录后会强制改密。
```

## 跑 dev

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000),用户名 `boss` + 你设的初始密码登录。

## 角色 & 业务模型

- **BOSS**(店主):全权限,管理员工/陪玩,看店铺数据,派单/结算/撤销
- **STAFF**(客服/店长):派单、看订单/排行/客户、看陪玩(只读),不能管理账号
- **PLAYER**(陪玩):自己报单、看自己订单、看排行榜

订单生命周期:
- 创建后 → `进行中(IN_PROGRESS)`
- 陪玩或管理者标记完成 → `已完成 + 未结(COMPLETED + UNSETTLED)`
- 老板/客服打款标记 → `已完成 + 已结(COMPLETED + SETTLED)`
- 中途取消(仅管理者) → `已取消(CANCELED)`,需填**纠纷信息**(下文)

业绩数字(流水/抽成/单数/排行榜)**只统计已完成订单**,取消的不算业绩。

## 纠纷处理(取消订单)

取消订单不是简单 "标记为取消",而是要记录:
- **责任方**:陪玩 / 客户 / 店里 / 其他(影响补偿默认值)
- **取消说明**:自由文本
- **陪玩补偿金额**:可为 0(陪玩责任时常用)或全额(客户/店里责任时常用)

补偿 > 0 时,该单**会出现在「待结算」队列**,老板要像普通订单一样打款给陪玩;补偿 = 0 时直接 `已结算`,无需操作。

陪玩端 `打款明细` 页面会显示"取消补偿"标签,清楚区分常规收入和补偿。

## 三段定价(原价 / 优惠 / 实付)

每单有三段金额:
- **原价** = 单价 × 时长(自动算,客户"标价")
- **优惠** = 管理者填的折扣(默认 0,陪玩自报不可填)
- **实付** = 原价 − 优惠(客户实际付的)

**陪玩按"原价"结算**(不受打折影响,店里承担打折成本)。
**店铺毛利** = 实付 − 陪玩应得 = 抽成 − 优惠(可负,意味着促销亏损)。

适用场景:开业 7 折 / 8 折,系统准确记录折扣额和店里亏损,陪玩仍按标价拿钱。

## 客户

- 创建客户时自动生成 7 位数字 **会员号**(唯一)
- **微信号**:可选,**仅老板/客服可见**(陪玩看不到,后端 SQL 层直接置 NULL)
- 在 `/customers` 页可点编辑改名字 / 微信 / 备注

## 企业微信推送(可选)

在 `.env` 配 `WECOM_WEBHOOK_URL` 后,以下事件自动推到企微群:
- 新派单 / 新报单
- 订单完成
- 订单结算(标记已打款)
- 订单取消

**获取 Webhook**:企微群 → 群设置 → 群机器人 → 添加 → 复制 URL。不配也不影响功能。

## 端到端验证流程

1. **老板登录**(`boss`)→ 强制改密 → 总览
2. 进 **员工**,**新建员工**:用户名 `lily` / 显示名 `小莉` → 复制初始密码
3. 进 **陪玩**,**新建陪玩**:用户名 `tutu` / 显示名 `图图` / 默认单价 `40` → 复制初始密码
4. 退出,用 `lily` 登录,改密 → 进 **派单**:
   - 选陪玩「图图」,客户 `叶子`,10:29 → 12:49,单价 40
   - **优惠**留空 → 计算:原价 / 实付 ¥93.33,抽 ¥11.67,应得 ¥81.66
   - 试填**优惠 16 元** → 实付 ¥77.33,陪玩应得仍 ¥81.66,**店铺毛利 -¥4.33**(亏损)
   - 提交 → 弹 Toast "已创建客户「叶子」,会员号 1234567"
5. 退出,用 `tutu` 登录,改密:
   - 总览应显示"你有 1 单进行中"
   - 进订单 → 点开 → 点 **标记已完成**
6. 退出,用 `boss` 登录,进 **订单**:
   - "待结算"标签下应有图图的单
   - 点开 → 点 **微信付 ¥81.66** → 标记已结
7. 进 **排行榜**:Top 3 卡片里有图图,带 🥇 渐变
8. 进 **客户**:`叶子` 显示会员号 + 累计消费 ¥93.33

## 验证计算逻辑

```bash
npm run test:calc
```

应输出全 ✓:
```
样例 1: 40 元/h × 10:29-12:49 (140 分钟)
✓ 时长 140 分钟: 140
✓ 总 ¥93.33: 9333
✓ 抽 ¥11.67: 1167
✓ 应得 ¥81.66: 8166

样例 2: 45 元/h × 1:09 (69 分钟)
✓ 时长 69 分钟: 69
✓ 总 ¥51.75: 5175
✓ 抽 ¥5.75: 575
✓ 应得 ¥46.00: 4600

边界: 跨零点 23:30 → 01:15
✓ 跨零点时长 105 分钟: 105

✓ 全部通过
```

## 常用命令

```bash
npm run dev         # 开发模式
npm run build       # 生产构建
npm run start       # 生产模式跑
npm run lint        # eslint
npm run db:push     # 把 schema 推到 SQLite(开发用,不生成 migration 文件)
npm run db:generate # 生成 migration SQL(生产部署用)
npm run db:studio   # 打开 Drizzle Studio 看数据
npm run db:seed     # 创建老板账号(已存在则跳过)
npm run test:calc   # 验证金额/时长算法
```

## 常见问题

**`Tailwind classes 不生效`**
检查 `postcss.config.mjs` 用的是 `@tailwindcss/postcss`,不是 `tailwindcss`。这是 v4 的变化。

**`Module not found: better-sqlite3`**
better-sqlite3 是 native 模块,需要本机编译。如果出错,装 Xcode CLT(Mac):`xcode-select --install`。

**`BETTER_AUTH_SECRET is not set`**
`.env` 没填或者放错位置。Drizzle/Better Auth 都默认读 `.env`,不是 `.env.local`。

**端口 3000 被占**
`PORT=3001 npm run dev`

**忘了老板密码**
重新跑 `npm run db:seed` 不会重置已有账号。最简单的办法:删 `data/mo.db` 重新初始化(数据会丢)。或者用 `npm run db:studio` 直接改 `account.password` 字段(需要重新 hash)。

**`时间显示偏了 8 小时(只在生产出现)`**
`npm run dev` / `npm run start` 已经把 `TZ=Asia/Shanghai` 写进 scripts。但如果生产用 Docker / PM2 / systemd 直接跑 `node` 而不是 `npm start`,要自己在容器/进程环境里设 `TZ=Asia/Shanghai`,否则 `date-range`(今日/本周/本月)、leaderboard 会按 UTC 切日。订单表单已经走客户端 → UTC ISO 链路,这一层 TZ 无关;但 server 端 `getDay/getHours` 等本地时间方法仍依赖运行时 TZ。

## 设计风格说明

- **配色**:浅色为主,主色 indigo-600(`#4F46E5`),排行榜强调 amber 渐变,成功 emerald,警告 amber,危险 red
- **字体**:Geist Sans / Mono(英文/数字)+ PingFang SC(中文 fallback)
- **风格参考**:Linear 的克制结构 + Dub.co 的浅色 KPI + Twenty 的圆角亲和
- **暗色模式**:CSS 变量已配,只需 toggle `<html class="dark">` 即可生效(P1 加切换按钮)

## 还没做(P1)

- 陪玩收款码上传(微信/支付宝),老板订单详情看大图打款
- Excel 导出
- 截图分享报告
- 部署到服务器(SQLite 适合自建小服务器)

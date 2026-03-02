# 校园生存指北 (Campus Survival Guide)

精细化校区地理信息系统（GIS），实现校区内导航「最后一米」的精准交付。提供 **中控台**（Command Center）统一管理 POI、审核、集市与团队；基于高德地图的高精度校区 GIS 支持多校区边界、Polylabel 标签与父子 POI 层级。

## 技术栈

- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript (Strict mode)
- **样式**: Tailwind CSS (Mobile-first design)
- **数据库**: MySQL 8.0 with Prisma ORM
- **状态管理**: Zustand
- **GIS 引擎**: 高德地图 JS SDK 2.0
- **UI 组件**: Shadcn UI + Lucide Icons
- **地理计算**: Turf.js

## 项目结构

```
.
├── app/              # Next.js App Router 页面和 API 路由
├── components/       # 可复用 UI 组件（原子化设计）
├── lib/              # 工具函数、Prisma client、GIS 逻辑
├── store/            # Zustand stores
├── hooks/            # 自定义 React hooks
└── prisma/           # Prisma schema 和迁移文件
```

## 快速开始

### 1. 环境配置

复制环境变量模板：

```bash
cp env.template .env
```

编辑 `.env` 文件，配置数据库连接和高德地图 Key。

### 2. 安装依赖

```bash
npm install
```

### 3. 数据库初始化

```bash
# 生成 Prisma Client
npm run db:generate

# 推送 schema 到数据库（开发环境）
npm run db:push

# 或使用 Prisma Studio 可视化查看数据
npm run db:studio
```

### 4. 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

### 5. 生产构建

```bash
npm run build
```

构建成功后使用 `npm run start` 启动生产服务。

## v1.3.2 新特性

- **Unified Server Actions**：业务 CRUD 100% 迁移至 Server Actions，统一返回 `{ success, data, error }`
- **Market Audit Logs & Export**：集市审核抽屉支持 MarketLog 审计日志与导出报告
- **Bazaar Transaction Loop**：意向制交易闭环（提交意向→选定买家→锁定→双确认完成→重新上架）

## 核心特性

### 多租户架构

- 所有业务数据模型必须包含 `schoolId` 字段
- 所有 Prisma 查询必须包含 `where: { schoolId: currentSchoolId }`
- 基于地理围栏自动识别用户所属学校

### 生存集市（v1.3.1）

- **意向制交易闭环**：买家「我有意向」提交联系方式 → 卖家选定买家并锁定 → 线下交易 → 双确认完成 → 永久下架；支持重新上架
- **P2P 资源分享**：SALE（二手交易）、SWAP（以物换物）、BORROW（物品借用）
- **动态配置**：MarketTransactionType 与 MarketCategory 表，分类池多对多关联交易类型
- **2 级分类**：超管维护全局分类，发布必选二级分类
- **7 天自动过期**：发布后 7 天自动下架，服务端保留
- **隐私保护**：联系方式默认隐藏，提交意向后可查看；contact 豁免 6 位数字屏蔽
- **举报审核**：3 次入审核、5 次自动隐藏，与留言审核统一入口
- **GIS 关联**：每商品必链 POI；详情页「在地图中查看」跳转地图定位

### 手势与 Bottom Sheet（v1.3.1）

- **自适应 POI 抽屉**：桌面端右侧固定侧边栏；移动端 vaul 手势 Bottom Sheet（吸附点 0.35/0.85）
- **原生滚动体验**：`.no-scrollbar` 隐藏滚动条、iOS 动量滚动、横向 snap 轮播

### 存储与媒体

- **Vercel Blob Storage**：POI 主图、用户头像、集市商品图片等
- **客户端图片压缩**：目标 <1MB，browser-image-compression，上传前自动压缩

### 搜索与导航

- **POI 别称模糊匹配**：Navbar、导航面板起终点搜索支持 alias 字段
- **全局搜索防抖**：`useDebounce` 300ms，减少 API 调用（Nav 搜索、集市 POI、用户/关键词搜索）
- 支持高德地图未收录的校内小径
- 动态路径权重计算（施工、阶梯、坡度等）

### 众包数据管理

- POI 状态实时更新（TTL：60 分钟）
- 时间衰减算法（最新数据权重 0.7，历史数据权重 0.3）
- 频率限制：1 分钟/用户/IP

### 审核与安全

- **分级举报**：3 次进入管理员审核，5 次自动隐藏（留言/集市商品统一规则）
- **邀请码停用**：DEACTIVATED 状态阻止关联用户登录
- **关键词引擎**：6 位数字屏蔽、敏感词过滤、批量导入（.txt/.csv）、关键词搜索

### 个人中心与通知

- **7 天冷却**：昵称与头像修改每 7 天仅限一次
- **社交卡片**：可点击评论头像查看公开资料（头像、昵称、简介）
- **通知中心**：全局未读红点、深度链接（poiId+commentId 自动打开抽屉并高亮）、快捷回复

### 基础设施（v1.3.1）

- **全屏 Modal Portal**：User Profile、Activity Detail、Post Item、Lost Found 发布、**失物招领详情（LostFoundDetailModal）** 等弹窗通过 `createPortal` 渲染到 body，遮罩覆盖 Navbar、Map、Drawer
- **Z-Index 标准化**：`--z-navbar`、`--z-sidebar`、`--z-modal-overlay`、`--z-modal-content`；覆盖 Drawer 时使用 z-[200]/z-[210]
- **视口感知 Modal**：max-height 约束、内部滚动、固定头尾，适配小屏与长表单
- **搜索历史**：localStorage 持久化，按 schoolId 隔离；下拉限制 6 条可见 + 滚动提示
- **Polylabel 标签**：校区名称标签使用 Pole of Inaccessibility 算法，复杂边界更准确

## 开发规范

详见 `.cursorrules.md` 文件。

## 许可证

MIT

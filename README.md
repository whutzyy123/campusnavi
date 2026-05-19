# 校园生存指北 (Campus Survival Guide)

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5.x-2D3748?logo=prisma)](https://www.prisma.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.x-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)

> 精细化校区 GIS 与 P2P 资源分享平台，实现校园导航「最后一米」交付。

---

## 项目简介

**校园生存指北** 是一款面向高校的 B2B2C 精细化校区地图应用，提供：

- **多租户校区地图**：基于地理围栏的学校识别、多校区边界渲染、POI 聚合与 LOD
- **精准导航**：校内步行路径规划、起终点选点、路径绘制
- **生存集市**：二手交易、以物换物、物品借用，支持意向→选定→锁定→双确认交易闭环
- **社交与内容**：POI 留言板、失物招领、活动管理、消息通知、POI 收藏
- **积分体系**：支持留言点赞积分与实时状态上报积分（含频控与日上限）
- **管理后台**：校级管理（POI/分类/校区/团队/审核）+ 超级管理员（用户/学校/敏感词/集市配置、数据分析、周报/月报/年报导出）
- **用户反馈**：支持用户提交使用体验反馈与 Bug 报告

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 14 (App Router)、React 18 |
| 语言 | TypeScript |
| 样式 | Tailwind CSS、Radix UI、Framer Motion |
| 数据 | Prisma、MySQL 8.0 |
| 地图 | 高德地图 JS API 2.0、@turf/turf |
| 状态 | Zustand |
| 存储 | Vercel Blob Storage |
| 图表 | Recharts（超级管理员数据分析） |

---

## 快速开始

### 环境要求

- Node.js 18+
- MySQL 8.0
- pnpm / npm / yarn

### 1. 克隆项目

```bash
git clone <repository-url>
cd campusproject
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

在项目根目录创建 `.env` 文件：

```env
# 数据库（必填）
DATABASE_URL="mysql://user:password@localhost:3306/campus_survival"

# 高德地图（必填，用于地图与导航）
NEXT_PUBLIC_AMAP_KEY="your-amap-js-api-key"
NEXT_PUBLIC_AMAP_SECURITY_KEY="your-amap-security-key"

# Vercel Blob（图片上传必填）
BLOB_READ_WRITE_TOKEN="your-vercel-blob-token"

# JWT（必填，登录与 Middleware 鉴权）
JWT_SECRET="your-strong-random-secret-at-least-32-bytes"

# 定时任务（生产必填，集市死锁 Cron）
CRON_SECRET="your-cron-secret"

# 开发 Seed（可选；未配置时仅 development 可匿名调用 seed 路由）
# SEED_SECRET="your-seed-secret"
```

完整变量清单与「未配置时的行为」见根目录 [`.env.example`](.env.example)。

> 高德地图 Key 需在 [高德开放平台](https://lbs.amap.com/) 申请，并配置 Web 端 JS API 与安全密钥。

### 4. 初始化数据库

```bash
# 生成 Prisma Client
npm run db:generate

# 推送 Schema 到数据库（开发环境）
npm run db:push

# 可选：执行种子数据
npm run seed
```

### 5. 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)。

---

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建 |
| `npm run start` | 启动生产服务 |
| `npm run lint` | ESLint 检查 |
| `npm run db:generate` | 生成 Prisma Client |
| `npm run db:push` | 推送 Schema 到数据库 |
| `npm run db:studio` | 打开 Prisma Studio |
| `npm run seed` | 执行种子数据 |

---

## 项目结构

```
campusproject/
├── app/                    # Next.js App Router
│   ├── page.tsx           # 首页（地图）
│   ├── login/             # 登录
│   ├── register/          # 注册
│   ├── profile/           # 个人资料
│   ├── center/            # 个人中心/中控台（含 market 子页）
│   ├── favorites/         # 我的收藏
│   ├── feedback/          # 用户反馈
│   ├── messages/          # 消息通知
│   ├── lost-found/        # 失物招领
│   ├── school-onboarding/ # 学校引导
│   ├── (main)/            # 业务分组路由（当前含 activities）
│   │   └── activities/    # 校园活动
│   ├── admin/             # 校级管理后台
│   │   ├── page.tsx       # 管理控制台
│   │   ├── school/        # 学校管理（POI、校区、用户、活动等）
│   │   ├── team/          # 团队管理
│   │   └── audit/         # 审核管理（留言、集市）
│   └── super-admin/       # 超级管理员后台
│       ├── page.tsx       # 系统看板
│       ├── users/         # 用户管理
│       ├── schools/       # 学校管理
│       ├── keywords/      # 敏感词管理
│       ├── feedback/       # 反馈管理
│       ├── invitation-codes/  # 邀请码管理
│       ├── categories/     # 分类管理（POI分类、集市分类）
│       └── analytics/     # 数据分析（用户、集市、内容、留存等）
├── components/             # React 组件
│   ├── ui/               # 基础 UI 组件
│   ├── admin/           # 管理后台组件
│   ├── market/          # 集市模块组件
│   └── shared/          # 共享组件
├── lib/                   # 工具与 Server Actions
│   ├── actions/          # Server Actions（poi、market、comment 等）
│   ├── auth/            # 认证相关
│   ├── market/          # 集市业务逻辑
│   ├── geo/             # 地图/GIS 工具
│   ├── analytics/       # 数据埋点
│   └── school/          # 学校相关逻辑
├── store/                 # Zustand 状态管理
├── hooks/                # 自定义 Hooks
├── prisma/
│   ├── schema.prisma    # 数据模型
│   └── seed.ts          # 种子脚本
├── docs/                 # 项目文档
│   ├── PRD.md           # 产品需求文档
│   ├── API.md           # HTTP 白名单与接口说明
│   ├── 开发规范.md       # 工程规范（含技术栈 §2）
│   ├── 数据库设计文档.md  # 数据库设计
│   └── 代码修复建议.md   # 债务清单与修复路线图
├── scripts/             # 迁移与工具脚本（见 scripts/README.md）
```

---

## 核心架构

### 多租户隔离

- 所有业务表包含 `schoolId` 字段
- 查询需加 `where: { schoolId: currentSchoolId }`（超管除外）
- 创建/更新时 `schoolId` 从认证会话注入，**禁止**信任客户端传入

### 角色与权限

| 角色 | 说明 |
|------|------|
| STUDENT | 学生 |
| ADMIN | 校级管理员（绑定学校） |
| STAFF | 工作人员（绑定学校） |
| SUPER_ADMIN | 超级管理员 |

### 接口架构

- **Server Actions**：主要数据变更与页面数据加载，位于 `lib/actions/*.ts`、`lib/market/*`、`lib/school/actions.ts`
- **Route Handlers**：仅 HTTP 必需端点（cron、登出兜底、开发 seed），详见 [docs/API.md](docs/API.md)

### 认证机制

- **HTTP Only Cookie**：`campus-survival-session` 存储会话 Token
- **JWT Cookie**：`campus-auth-jwt`，供 Middleware 解析管理端角色（无 `/api/auth/me` 自省）
- **Session 表**：`AuthSession`，支持过期时间与撤销
- **频控**：`RateLimit` 表，限制登录/注册频率

---

## 核心功能模块

| 模块 | 说明 |
|------|------|
| 多租户 | 基于 `schoolId` 的数据隔离，射线法地理围栏判定 |
| POI | 兴趣点管理、父子层级、Marker 聚合、LOD、分类筛选、便民设施 |
| 导航 | 校内步行路径规划（AMap.Walking） |
| 社交 | POI 留言板、失物招领、活动管理、消息通知 |
| 集市 | 二手交易(SALE/SWAP/BORROW)、意向→锁定→双确认交易闭环、7天过期 |
| 收藏 | POI 收藏、`/favorites` 页面 |
| 反馈 | 用户反馈/Bug 提交，超管处理台 |
| 管理 | 校级管理 + 超级管理员数据分析与报表导出 |
| 积分 | 用户 `points` 字段；留言获赞 +1；实时状态上报 24h 最多 +10 且全局 10 分钟冷却 |

---

## 文档

| 文档 | 说明 |
|------|------|
| [docs/PRD.md](docs/PRD.md) | 产品需求文档（含埋点契约 §8.7） |
| [docs/API.md](docs/API.md) | HTTP 白名单与 Server Actions 说明 |
| [docs/开发规范.md](docs/开发规范.md) | 工程开发规范、技术栈（§2）与质量门禁 |
| [docs/数据库设计文档.md](docs/数据库设计文档.md) | 数据库设计与 ER 图 |
| [docs/代码修复建议.md](docs/代码修复建议.md) | 技术债清单与修复路线图 |
| [scripts/README.md](scripts/README.md) | 数据库同步（`db:push`）与迁移脚本 |

---

## 部署

项目支持部署至 [Vercel](https://vercel.com/)：

1. 连接 Git 仓库
2. 配置环境变量（`DATABASE_URL`、`NEXT_PUBLIC_AMAP_KEY` 等）
3. 使用 MySQL 托管服务（如 PlanetScale、Railway）或自建数据库
4. 可选：配置 Vercel Blob 用于图片存储

---

## 许可证

Private - 仅供内部使用。

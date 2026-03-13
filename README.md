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
- **社交与内容**：POI 留言板、失物招领、活动管理、消息通知
- **管理后台**：校级管理（POI/分类/校区/团队/审核）+ 超级管理员（用户/学校/敏感词/集市配置、数据分析、周报/月报/年报导出）

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

# Vercel Blob（图片存储，可选）
BLOB_READ_WRITE_TOKEN="your-vercel-blob-token"

# 定时任务（可选，用于集市死锁处理）
CRON_SECRET="your-cron-secret"
```

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
│   ├── (pages)/            # 页面路由
│   │   ├── page.tsx        # 首页（地图）
│   │   ├── login/          # 登录
│   │   ├── register/       # 注册
│   │   ├── profile/        # 个人中心
│   │   ├── admin/          # 校级管理后台
│   │   └── super-admin/    # 超级管理员后台（含 analytics 数据分析）
│   └── api/                # Route Handlers
├── components/             # React 组件
├── lib/                    # 工具与 Server Actions
│   ├── *-actions.ts        # Server Actions
│   ├── prisma.ts           # Prisma 客户端
│   └── amap-loader.ts      # 高德地图动态加载
├── store/                  # Zustand 状态
├── hooks/                  # 自定义 Hooks
├── prisma/
│   ├── schema.prisma       # 数据模型
│   └── seed.ts             # 种子脚本
├── docs/                   # 项目文档
│   ├── PRD.md              # 产品需求文档
│   └── API接口文档.md      # API 接口文档
└── scripts/                # 迁移与工具脚本
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

- **Server Actions**：主要数据变更方式，位于 `lib/*-actions.ts`
- **Route Handlers**：`/api/*`，用于兼容或直接 HTTP 访问

---

## 文档

| 文档 | 说明 |
|------|------|
| [docs/PRD.md](docs/PRD.md) | 产品需求文档 |
| [docs/API接口文档.md](docs/API接口文档.md) | API 与 Server Actions 接口说明 |
| [docs/超级管理员数据看板规划.md](docs/超级管理员数据看板规划.md) | 超级管理员数据分析、报表导出、核心率指标 |
| [docs/技术栈说明文档.md](docs/技术栈说明文档.md) | 技术栈与架构约定 |

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

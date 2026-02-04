# 校园生存指北 (Campus Survival Guide)

精细化校区地理信息系统（GIS），实现校区内导航"最后一米"的精准交付。

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

## 核心特性

### 多租户架构

- 所有业务数据模型必须包含 `schoolId` 字段
- 所有 Prisma 查询必须包含 `where: { schoolId: currentSchoolId }`
- 基于地理围栏自动识别用户所属学校

### 高精度导航

- 支持高德地图未收录的校内小径
- 动态路径权重计算（施工、阶梯、坡度等）
- GPS 位置平滑处理（Kalman 滤波）

### 众包数据管理

- POI 状态实时更新（TTL：60 分钟）
- 时间衰减算法（最新数据权重 0.7，历史数据权重 0.3）
- 频率限制：1 分钟/用户/IP

## 开发规范

详见 `.cursorrules.md` 文件。

## 许可证

MIT


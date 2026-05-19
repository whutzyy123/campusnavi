# Campus Survival Guide — HTTP API 清单

> **适用范围**：本文档仅列出 **`app/api/**` Route Handler**（必须由 URL/HTTP 调用的端点）。  
> **业务读写默认路径**：Server Actions（`lib/actions/*`、`lib/market/*`、`lib/school/actions.ts`）。  
> **最后更新**：2026-05-19（§5.1 双轨收敛完成后）

---

## 1. 架构约定

| 场景 | 入口 |
|------|------|
| 页面表单、按钮、列表加载 | Server Action |
| Vercel Cron、运维 seed、登出 Cookie 兜底 | 本文档所列 HTTP 端点 |
| 新增 HTTP 端点 | PR 须说明「为何不能 Server Action」 |

**认证（非 HTTP）：**

- 会话：`campus-survival-session`（DB Session Token）
- Middleware 角色：`campus-auth-jwt`（JWT，见 `lib/auth/middleware-jwt.ts`）
- 用户信息：`getMe()`（`lib/auth/server-actions.ts`）

---

## 2. HTTP 端点（共 4 个）

### 2.1 `GET /api/cron/market-deadlock`

| 项 | 说明 |
|----|------|
| **用途** | 集市死锁保护定时任务（自动解锁、单方自动完成） |
| **调用方** | Vercel Cron（见 `vercel.json`）或手动 HTTP |
| **鉴权** | `Authorization: Bearer <CRON_SECRET>`（必填） |
| **环境变量** | `CRON_SECRET`；未配置时 production→500，否则→401 |
| **实现** | `processMarketDeadlocks` → `lib/market/deadlock.ts` |

**成功响应示例：**

```json
{ "success": true, "message": "Market deadlock check completed" }
```

---

### 2.2 `POST /api/auth/logout`

| 项 | 说明 |
|----|------|
| **用途** | 清除认证 Cookie（Server Action 登出失败时的客户端兜底） |
| **调用方** | `store/use-auth-store.ts`（`fetch` fallback） |
| **鉴权** | 无 |
| **实现** | `removeAuthCookie` → `lib/auth/server-actions.ts` |

**成功响应：**

```json
{ "success": true }
```

---

### 2.3 `POST /api/auth/seed`

| 项 | 说明 |
|----|------|
| **用途** | 开发环境初始化超级管理员账号 |
| **调用方** | 本地运维 / 脚本 |
| **鉴权** | 仅 `NODE_ENV !== "production"`；若配置 `SEED_SECRET` 则须 `Authorization: Bearer <SEED_SECRET>` |
| **环境变量** | `SEED_SECRET`（可选） |

---

### 2.4 `POST /api/auth/seed-test-accounts`

| 项 | 说明 |
|----|------|
| **用途** | 开发环境初始化测试账号 |
| **调用方** | 本地运维 / 脚本 |
| **鉴权** | 同 `/api/auth/seed` |
| **环境变量** | `SEED_SECRET`（可选） |

---

## 3. Server Actions 索引（非 HTTP）

业务 API 已收敛至 Server Actions，按域查阅：

| 域 | 入口 |
|----|------|
| 认证 / 用户 | `lib/auth/server-actions.ts`、`lib/actions/user.ts`、`lib/actions/profile.ts` |
| 学校 / 校区 | `lib/school/actions.ts` |
| POI / 分类 | `lib/actions/poi.ts`、`lib/actions/category/` |
| 留言 / 审核 | `lib/actions/comment/`、`lib/actions/audit.ts` |
| 集市 | `lib/market/` |
| 邀请码 / 敏感词 | `lib/actions/invitation.ts`、`lib/actions/keyword.ts` |
| 管理统计 | `lib/actions/admin.ts`、`lib/actions/admin-analytics.ts` |

---

## 4. 维护说明

- 删除或新增 `app/api/**` 时须同步更新本文档。
- 禁止在 Route Handler 内重复实现已有 Server Action 的 Prisma 逻辑；若未来必须暴露 HTTP，Route 只能调用 `lib/<domain>/` 共享函数。

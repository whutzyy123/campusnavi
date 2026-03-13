# 校园生存指北 - API 接口文档

---

## 文档信息

| 项目 | 内容 |
|------|------|
| 产品名称 | 校园生存指北 |
| 文档类型 | API 接口文档 |
| 当前版本 | v1.1 |
| 最后更新 | 2026-03-11 |
| 文档状态 | 正式版 |

---

## 一、概述

### 1.1 接口架构

本项目采用 **双轨接口** 架构：

- **Route Handlers**：`/api/*` HTTP 接口，用于客户端 fetch、SWR 等场景
- **Server Actions**：`lib/*-actions.ts` 服务端函数，用于 Next.js 服务端组件、表单提交、客户端 `"use server"` 调用

优先使用 **Server Actions** 以提升可复用性与类型安全；Route Handlers 保留用于兼容现有调用或需直接 HTTP 访问的场景。

### 1.2 基础约定

| 约定项 | 说明 |
|--------|------|
| 基础路径 | Route Handlers: `{BASE_URL}/api`；Server Actions 无 URL，直接导入调用 |
| 数据格式 | 请求/响应均为 JSON（除文件上传为 `multipart/form-data`） |
| 字符编码 | UTF-8 |
| 认证方式 | HTTP Only Cookie（`campus-survival-auth-token`） |

### 1.3 通用响应格式

**成功响应：**
```json
{
  "success": true,
  "data": { ... },
  "message": "可选提示信息",
  "pagination": { "total": 100, "pageCount": 10, "currentPage": 1 }
}
```

**失败响应：**
```json
{
  "success": false,
  "message": "错误描述",
  "error": "可选技术错误信息"
}
```

### 1.4 HTTP 状态码

| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未登录或认证失效 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

### 1.5 角色与权限

| 角色 | 说明 |
|------|------|
| STUDENT | 学生 |
| ADMIN | 校级管理员（需绑定 schoolId） |
| STAFF | 工作人员（需绑定 schoolId） |
| SUPER_ADMIN | 超级管理员 |

---

## 二、Route Handlers（HTTP API）

### 2.1 认证

| 路径 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/auth/me` | GET | 获取当前登录用户完整信息 | Cookie 认证 |

**响应示例：**
```json
{
  "success": true,
  "user": {
    "id": "string",
    "email": "string | null",
    "nickname": "string | null",
    "bio": "string | null",
    "avatar": "string | null",
    "lastProfileUpdateAt": "string | null",
    "role": "STUDENT | ADMIN | STAFF | SUPER_ADMIN",
    "schoolId": "string | null",
    "schoolName": "string | null"
  }
}
```

---

### 2.2 学校

| 路径 | 方法 | 请求参数 | 说明 | 权限 |
|------|------|----------|------|------|
| `/api/schools/list` | GET | - | 获取激活学校列表（学校切换器） | 公开 |
| `/api/schools` | GET | - | 获取学校列表（含统计，内部用） | 内部 |
| `/api/schools/[id]` | GET | Path: `id` | 获取单个学校信息 | 公开 |
| `/api/schools/[id]` | PUT | Path: `id`, Body: `{ name }` | 更新学校信息 | 需鉴权 |
| `/api/schools/[id]` | DELETE | Path: `id` | 删除学校（级联删除） | 需鉴权 |
| `/api/schools/[id]/campuses` | GET | Path: `id` | 获取学校校区列表 | 公开 |
| `/api/schools/detect` | GET | Query: `lat`, `lng` | 根据经纬度检测所属学校 | 公开 |

**`/api/schools/detect` 响应：**
```json
{
  "success": true,
  "school": {
    "id": "string",
    "name": "string",
    "schoolCode": "string",
    "centerLat": "number | null",
    "centerLng": "number | null"
  }
}
```

---

### 2.3 分类（公开）

| 路径 | 方法 | 请求参数 | 说明 | 权限 |
|------|------|----------|------|------|
| `/api/categories` | GET | Query: `schoolId` | 获取学校分类（常规 + 便民） | 公开 |

---

### 2.4 POI 搜索

| 路径 | 方法 | 请求参数 | 说明 | 权限 |
|------|------|----------|------|------|
| `/api/pois/search` | GET | Query: `schoolId`, `q?`, `ongoingOnly?` | 搜索 POI | 公开 |

---

### 2.5 管理端 - 分类

| 路径 | 方法 | 请求参数 | 说明 | 权限 |
|------|------|----------|------|------|
| `/api/admin/categories` | GET | Query: `all?`, `grouped?`, `page?`, `limit?` | 获取学校分类 | ADMIN/STAFF（本校） |
| `/api/admin/categories` | POST | Body: `{ name, icon?, isGlobal? }` | 创建分类 | ADMIN/STAFF；全局仅 SUPER_ADMIN |
| `/api/admin/categories/[id]` | DELETE | Path: `id` | 删除分类 | ADMIN/STAFF（本校） |
| `/api/admin/categories/[id]/override` | PATCH | Path: `id`, Body: `{ isHidden?, customName? }` | 更新分类覆盖 | ADMIN/STAFF（本校） |
| `/api/admin/categories/[id]/override` | DELETE | Path: `id` | 删除分类覆盖 | ADMIN/STAFF（本校） |
| `/api/admin/global-categories` | GET | Query: `page?` | 获取全局分类 | SUPER_ADMIN |
| `/api/admin/global-categories` | POST | Body: `{ name, icon? }` | 创建全局分类 | SUPER_ADMIN |
| `/api/admin/global-categories/[id]` | DELETE | Path: `id` | 删除全局分类 | SUPER_ADMIN |

---

### 2.6 管理端 - 校区

| 路径 | 方法 | 请求参数 | 说明 | 权限 |
|------|------|----------|------|------|
| `/api/admin/campuses` | GET | Query: `schoolId`（超管必填） | 获取校区列表 | ADMIN/SUPER_ADMIN；STAFF 不可 |
| `/api/admin/campuses` | POST | Body: `{ schoolId?, name, boundary }` | 创建校区 | ADMIN/SUPER_ADMIN |
| `/api/admin/campuses/[id]` | PUT | Path: `id`, Body: `{ name?, boundary? }` | 更新校区 | ADMIN/SUPER_ADMIN |
| `/api/admin/campuses/[id]` | DELETE | Path: `id` | 删除校区 | ADMIN/SUPER_ADMIN |

---

### 2.7 管理端 - 集市分类

| 路径 | 方法 | 请求参数 | 说明 | 权限 |
|------|------|----------|------|------|
| `/api/admin/market-categories` | GET | - | 获取物品分类池 + 交易类型关联 | SUPER_ADMIN |
| `/api/admin/market-categories` | POST | Body: `{ name, order? }` | 创建物品分类 | SUPER_ADMIN |
| `/api/admin/market-categories/[id]` | PUT | Path: `id`, Body: `{ name?, order?, isActive? }` | 更新物品分类 | SUPER_ADMIN |
| `/api/admin/market-categories/[id]` | DELETE | Path: `id` | 删除物品分类 | SUPER_ADMIN |
| `/api/admin/market-categories/toggle-type` | POST | Body: `{ typeId, categoryId }` | 切换交易类型与分类关联 | SUPER_ADMIN |

---

### 2.8 管理端 - 集市商品

| 路径 | 方法 | 请求参数 | 说明 | 权限 |
|------|------|----------|------|------|
| `/api/admin/market/items` | GET | Query: `schoolId`, `search?`, `categoryId?`, `status?`, `page?`, `limit?` | 获取集市商品列表 | ADMIN/STAFF/SUPER_ADMIN |
| `/api/admin/market/items/[id]` | PATCH | Path: `id`, Body: `{ action: "delete" \| "relist" }` | 下架/重新上架商品 | 校管/工作人员/超管 |

---

### 2.9 管理端 - 用户

| 路径 | 方法 | 请求参数 | 说明 | 权限 |
|------|------|----------|------|------|
| `/api/admin/users` | GET | Query: `role?`, `schoolId?`, `search?`, `field?`, `page?`, `limit?` | 获取用户列表 | SUPER_ADMIN |
| `/api/admin/users` | PATCH | Body: `{ id, status: "ACTIVE" \| "INACTIVE" }` | 停用/激活用户 | SUPER_ADMIN |
| `/api/admin/users` | DELETE | Body: `{ id }` | 永久删除用户 | SUPER_ADMIN |

---

### 2.10 举报与审核

| 路径 | 方法 | 请求参数 | 说明 | 权限 |
|------|------|----------|------|------|
| `/api/audit/report` | POST | Body: `{ poiId, reason, description?, userId? }` | 举报 POI | 公开（可匿名） |
| `/api/audit/reports` | GET | Query: `schoolId`, `minReportCount?` | 获取被举报 POI 列表 | ADMIN/STAFF（本校） |
| `/api/audit/resolve` | POST | Body: `{ poiId, action: "ignore" \| "delete" }` | 处理 POI 举报 | ADMIN/STAFF（本校） |
| `/api/audit/market-items` | GET | Query: `schoolId`, `minReportCount?` | 获取被举报/已隐藏集市商品 | ADMIN/STAFF（本校） |
| `/api/audit/market-resolve` | POST | Body: `{ itemId, action: "pass" \| "delete" }` | 处理集市举报 | ADMIN/STAFF（本校） |

---

### 2.11 敏感词（屏蔽词）

| 路径 | 方法 | 请求参数 | 说明 | 权限 |
|------|------|----------|------|------|
| `/api/keywords` | GET | Query: `page?`, `limit?`, `q?` | 获取屏蔽词列表 | SUPER_ADMIN |
| `/api/keywords` | POST | Body: `{ keyword, addedById }` | 添加屏蔽词 | SUPER_ADMIN |
| `/api/keywords/[id]` | DELETE | Path: `id` | 删除屏蔽词 | SUPER_ADMIN |
| `/api/keywords/bulk` | POST | Body: `{ words: string[] \| string, addedById }` | 批量添加屏蔽词 | SUPER_ADMIN |

---

### 2.12 邀请码

| 路径 | 方法 | 请求参数 | 说明 | 权限 |
|------|------|----------|------|------|
| `/api/invitation-codes` | GET | Query: `schoolId?`, `issuerId?`, `isUsed?` | 获取邀请码列表 | ADMIN/SUPER_ADMIN |
| `/api/invitation-codes` | POST | Body: `{ schoolId, role, issuerId, expiresAt? }` | 创建邀请码 | ADMIN/SUPER_ADMIN |
| `/api/invitation-codes/[id]` | DELETE | Path: `id`, Body: `{ userId }` | 删除邀请码 | 发放人或 SUPER_ADMIN |

---

### 2.13 用户

| 路径 | 方法 | 请求参数 | 说明 | 权限 |
|------|------|----------|------|------|
| `/api/users` | GET | Query: `schoolId`, `role?` | 获取学校用户列表 | 需鉴权 |

---

### 2.14 定时任务

| 路径 | 方法 | 请求参数 | 说明 | 权限 |
|------|------|----------|------|------|
| `/api/cron/market-deadlock` | GET | Header: `Authorization: Bearer ${CRON_SECRET}` | 集市死锁自动处理 | CRON_SECRET 校验 |

---

## 三、Server Actions

### 3.1 认证（auth-server-actions）

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `getAuthCookie` | - | `AuthCookieData \| null` | 读取认证 Cookie |
| `removeAuthCookie` | - | `void` | 清除认证 Cookie |
| `loginUser` | `formData: FormData` | `{ success, message?, user? }` | 登录 |
| `registerUser` | `formData: FormData` | `{ success?, message? }` 或 redirect | 注册 |
| `logoutUser` | - | redirect | 登出 |
| `requireAdmin` | - | `AuthCookieData` | 校验管理员权限 |
| `getCurrentUser` | - | `AuthCookieData \| null` | 获取当前认证用户 |
| `getMe` | - | `GetMeResult` | 获取当前用户完整信息 |

---

### 3.2 学校（school-actions）

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `getSchoolsList` | - | `SchoolListResult` | 获取激活学校列表 |
| `getSchoolById` | `schoolId: string` | `SchoolDetailResult` | 获取学校详情 |
| `detectSchoolByLocation` | `lat: number, lng: number` | `DetectSchoolResultType` | 根据经纬度检测学校 |
| `getCampuses` | `schoolId: string` | `GetCampusesResult` | 获取校区列表 |
| `createCampus` | `{ schoolId, name, boundary }` | `{ success, data?, error? }` | 创建校区 |
| `updateCampus` | `campusId, { name?, boundary? }` | `{ success, data?, error? }` | 更新校区 |
| `deleteCampus` | `campusId: string` | `{ success, error? }` | 删除校区 |
| `getSchoolsWithStats` | - | `{ success, data? }` | 获取学校列表（含统计） |
| `updateSchool` | `schoolId, { name }` | `SchoolActionResult` | 更新学校（超管） |
| `createSchool` | `{ name, schoolCode }` | `SchoolActionResult` | 创建学校（超管） |
| `updateSchoolStatus` | `schoolId, status` | `SchoolActionResult` | 更新学校状态（超管） |
| `deleteSchool` | `schoolId: string` | `SchoolActionResult` | 删除学校（超管） |

---

### 3.3 POI（poi-actions）

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `searchPOIs` | `schoolId, { q?, ongoingOnly? }?` | `POIActionResult<POISearchItem[]>` | 搜索 POI |
| `reportPOI` | `poiId, reason, description?` | `POIActionResult` | 举报 POI |
| `getPOIsBySchool` | `schoolId, options?` | `POIActionResult` | 按学校获取 POI 列表 |
| `createPOI` | `CreatePOIInput` | `POIActionResult<{ poi }>` | 创建 POI |
| `getPOIDetail` | `id: string` | `POIActionResult<{ poi }>` | 获取 POI 详情 |
| `updatePOI` | `id, UpdatePOIInput` | `POIActionResult<{ poi }>` | 更新 POI |
| `deletePOI` | `id: string` | `POIActionResult<void>` | 删除 POI |

---

### 3.4 分类（category-actions）

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `getCategoriesForFilter` | `schoolId: string` | `{ success, data?, error? }` | 获取筛选面板分类 |
| `getSchoolCategoriesForAdmin` | `schoolId, options` | `{ success, data?, pagination?, error? }` | 获取学校分类（管理员） |
| `createSchoolCategory` | `{ schoolId, name, icon? }` | `{ success, data?, error? }` | 创建学校分类 |
| `getGlobalCategories` | `params?` | `{ success, data?, pagination?, error? }` | 获取全局分类（超管） |
| `createGlobalCategory` | `{ name, icon? }` | `{ success, data?, error? }` | 创建全局分类（超管） |
| `deleteGlobalCategory` | `id: string` | `{ success, error? }` | 删除全局分类（超管） |
| `getMicroCategories` | - | `{ success, data?, error? }` | 获取便民公共设施分类 |
| `createMicroCategory` | `{ name, icon? }` | `CategoryActionResult` | 创建便民公共设施（超管） |
| `updateMicroCategory` | `id, { name?, icon? }` | `CategoryActionResult` | 更新便民公共设施（超管） |
| `deleteMicroCategory` | `id: string` | `CategoryActionResult` | 删除便民公共设施（超管） |
| `updateCategory` | `id, { name?, icon? }` | `CategoryUpdateResult` | 更新 POI 分类 |
| `updateCategoryOverride` | `categoryId, { isHidden?, customName? }` | `{ success, message?, error? }` | 更新分类覆盖 |
| `removeCategoryOverrideAction` | `categoryId: string` | `{ success, message?, error? }` | 删除分类覆盖 |
| `deleteCategory` | `id: string` | `CategoryUpdateResult` | 删除 POI 分类 |
| `getAllUniqueCategories` | `filters?` | `GetAllUniqueCategoriesResult` | 获取全量分类（超管） |

---

### 3.5 用户（user-actions）

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `getSchoolUsers` | `GetSchoolUsersParams?` | `{ success, data?, pagination?, error? }` | 获取本校用户列表 |
| `getAdminUserDetail` | `userId: string` | `{ success, data?, error? }` | 获取用户详情（管理员） |
| `adminResetUserPassword` | `userId, newPassword` | `{ success, message }` | 管理员重置密码 |
| `getAdminUsers` | `params` | `{ success, data?, pagination?, error? }` | 获取所有用户（超管） |
| `deleteUser` | `userId: string` | `{ success, message?, error? }` | 永久删除用户（超管） |
| `deactivateUser` | `userId, status` | `{ success, message }` | 停用/激活用户 |
| `getPublicProfile` | `userId: string` | `{ success, data?, error? }` | 获取公开资料 |
| `deleteMyAccount` | - | `{ success, message?, error? }` | 注销账号 |
| `getUserReputation` | `targetUserId, mode` | 委托至 market-actions | 获取用户集市声誉 |

---

### 3.6 集市（market-actions）

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `getMarketCategoriesByType` | - | `MarketActionResult<MarketCategoriesByType>` | 按交易类型获取分类 |
| `getMarketCategories` | - | `MarketActionResult<MarketCategoriesResult>` | 获取集市分类与交易类型 |
| `getTransactionTypes` | - | `{ success, data? }` | 获取交易类型 |
| `getPublicMarketItems` | `schoolId, options?` | `MarketActionResult` | 获取公开集市商品 |
| `getMarketItemDetail` | `id: string` | `MarketActionResult` | 获取商品详情 |
| `getMyMarketItems` | - | `MarketActionResult<MyMarketItemsResult>` | 获取我的集市活动 |
| `createMarketItem` | `CreateMarketItemDTO` | `MarketActionResult` | 创建商品 |
| `updateMarketItem` | `itemId, payload` | `MarketActionResult` | 更新商品 |
| `submitIntention` | `itemId, contactInfo?` | `MarketActionResult` | 提交意向 |
| `selectBuyerAndLock` | `itemId, buyerId` | `MarketActionResult` | 选定买家并锁定 |
| `getIntentions` | `itemId: string` | `MarketActionResult` | 获取意向列表 |
| `withdrawIntention` | `itemId: string` | `MarketActionResult` | 撤回意向 |
| `unlockMarketItem` | `itemId: string` | `MarketActionResult` | 解锁商品 |
| `confirmTransaction` | `itemId: string` | `MarketActionResult` | 确认交易 |
| `rateMarketTransaction` | `itemId, isPositive` | `MarketActionResult` | 评价交易 |
| `getUserReputation` | `targetUserId, mode` | `MarketActionResult` | 获取用户声誉 |
| `getMarketThumbsUpRate` | `userId: string` | `{ success, data? }` | 获取好评率 |
| `reportMarketItem` | `itemId: string` | `MarketActionResult` | 举报商品 |
| `deleteMarketItem` | `itemId: string` | `MarketActionResult` | 删除商品 |
| `adminMarketItemAction` | `itemId, action` | `MarketActionResult` | 管理员操作商品 |
| `getAdminMarketItems` | `schoolId, params` | `{ success, data?, error? }` | 管理员获取商品列表 |
| `getAdminMarketCategoriesConfig` | - | `{ success, data?, error? }` | 获取集市分类配置（超管） |

> **已移除**：`updateMarketItemStatus`、`requestMarketItem`（别名）已删除。

---

### 3.7 举报审核（audit-actions）

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `getAuditReports` | `schoolId, minReportCount?` | `AuditActionResult<ReportedPOIItem[]>` | 获取被举报 POI 列表 |
| `getAuditMarketItems` | `schoolId, minReportCount?` | `AuditActionResult<ReportedMarketItemEntry[]>` | 获取被举报集市商品 |
| `resolveAudit` | `poiId, action: "ignore" \| "delete"` | `AuditActionResult` | 处理 POI 举报 |
| `resolveMarketAudit` | `itemId, action: "pass" \| "delete"` | `AuditActionResult` | 处理集市举报 |

---

### 3.8 敏感词（keyword-actions）

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `getKeywords` | `{ page?, limit?, q? }?` | `KeywordActionResult<SensitiveWordItem[]>` | 获取屏蔽词列表 |
| `createKeyword` | `keyword: string` | `KeywordActionResult<SensitiveWordItem>` | 添加屏蔽词 |
| `bulkCreateKeywords` | `{ words: string[], addedById }` | `KeywordActionResult` | 批量添加屏蔽词 |
| `deleteKeyword` | `id: string` | `KeywordActionResult` | 删除屏蔽词 |

---

### 3.9 其他 Actions 模块

| 模块 | 主要函数 | 说明 |
|------|----------|------|
| activity-actions | `createActivity`, `updateActivity`, `deleteActivity`, `getActivitiesBySchool`, `getOngoingActivities` | 活动管理 |
| invitation-actions | `listInvitationCodes`, `createInvitationCode`, `validateInvitationCode`, `consumeInvitationCode`, `toggleInvitationCodeStatus` | 邀请码管理 |
| comment-actions | `getPOIComments`, `createComment`, `submitQuickReply`, `toggleCommentLike`, `deleteComment`, `reportComment`, `getSchoolComments`, `reviewComment` | 评论管理 |
| status-actions | `reportLiveStatus`, `getActiveStatusesBySchool`, `getActiveStatusesByPoi` | 实时状态 |
| profile-actions | `updateProfile`, `updateEmail`, `updatePassword` | 个人资料 |
| notification-actions | `getUserNotifications`, `getUserMarketNotifications`, `markAsRead`, `markAllAsRead` | 消息通知 |
| lost-found-actions | `createLostFoundEvent`, `getUserLostFoundEvents`, `checkLostFoundEvent`, `markAsFound` | 失物招领 |
| admin-actions | `getSuperAdminStats`, `getSchoolAdminStats` | 管理统计 |
| admin-analytics-actions | `getNewUsersTrend`, `getCumulativeUsersTrend`, `getNewUsersBySchool`, `getDauWauMauTrend`, `getRetentionTrend`, `getDormantTrend`, `getMarketListingsTrend`, `getMarketByType`, `getMarketBySchool`, `getCommentsTrend`, `getPoiTrend`, `getContentBySchool`, `getNotificationsTrend` | 超级管理员数据分析（时序与分布） |
| admin-report-actions | `exportReportCsv` | 超级管理员周报/月报/年报 CSV 导出 |

---

### 3.10 超级管理员统计与报表（admin-actions / admin-analytics-actions / admin-report-actions）

**`getSuperAdminStats`** 返回 `SuperAdminStats`，含用户增长、留存、集市、内容、消息、**核心率指标**（用户活跃率、集市成交/过期率、留言互动率、失物招领完成率、反馈/举报处理率）、内容健康等。

**`exportReportCsv(period: "week" | "month" | "year")`** 导出 CSV，含用户增长、留存、集市、内容、核心率指标、消息。返回 `{ success, csv, filename }`。

---

## 四、多租户与数据隔离

### 4.1 租户标识

所有业务表（除全局配置）均包含 `schoolId` 字段。查询与变更需遵循：

- **查询**：`where: { schoolId: currentSchoolId }`（超管可跨校）
- **创建**：`schoolId` 必须从认证会话注入，**禁止**信任客户端传入

### 4.2 权限矩阵

| 操作类型 | STUDENT | ADMIN | STAFF | SUPER_ADMIN |
|----------|---------|-------|-------|-------------|
| 查看本校数据 | ✓ | ✓ | ✓ | ✓ |
| 管理本校 POI/分类/校区 | ✗ | ✓ | ✓（部分） | ✓ |
| 管理本校用户 | ✗ | ✓ | ✓ | ✓ |
| 管理本校集市 | ✗ | ✓ | ✓ | ✓ |
| 全局分类/集市配置 | ✗ | ✗ | ✗ | ✓ |
| 跨校/全平台数据 | ✗ | ✗ | ✗ | ✓ |

---

## 五、注意事项

1. **Server Actions 与 redirect**：在 Server Action 的 `try...catch` 中若调用 `redirect()`，需捕获并重新抛出 `NEXT_REDIRECT` 错误。
2. **坐标系统**：地图相关接口统一使用 **GCJ-02** 坐标系。
3. **分页**：分页接口统一返回 `pagination: { total, pageCount, currentPage, limit? }`。
4. **生产环境**：部分 Route Handler（如 `/api/admin/school`、`/api/schools/[id]` 的 PUT/DELETE）建议加强鉴权与审计。

---

## 六、修订记录

| 版本 | 修订日期 | 修订内容 |
|------|----------|----------|
| v1.1 | 2026-03-11 | 新增 admin-analytics-actions、admin-report-actions；扩展 getSuperAdminStats 核心率指标 |
| v1.0 | 2026-03-10 | 初版，基于项目当前实现整理 |

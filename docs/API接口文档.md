# 校园生存指北 - API 接口文档

---

## 文档信息


| 项目   | 内容         |
| ---- | ---------- |
| 产品名称 | 校园生存指北     |
| 文档类型 | API 接口文档   |
| 当前版本 | v1.4       |
| 最后更新 | 2026-04-18 |
| 文档状态 | 与仓库 `app/api/**/route.ts` 同步 |


---

## 一、概述

### 1.1 接口架构

本项目采用 **双轨接口** 架构：

- **Route Handlers**：`/api/`* HTTP 接口，用于客户端 fetch、SWR 等场景
- **Server Actions**：`lib/*-actions.ts` 服务端函数，用于 Next.js 服务端组件、表单提交、客户端 `"use server"` 调用

优先使用 **Server Actions** 以提升可复用性与类型安全；Route Handlers 保留用于兼容现有调用或需直接 HTTP 访问的场景。

### 1.2 基础约定


| 约定项  | 说明                                                           |
| ---- | ------------------------------------------------------------ |
| 基础路径 | Route Handlers: `{BASE_URL}/api`；Server Actions 无 URL，直接导入调用 |
| 数据格式 | 请求/响应均为 JSON（除文件上传为 `multipart/form-data`）                   |
| 字符编码 | UTF-8                                                        |
| 认证方式 | HTTP Only Cookie **`campus-survival-session`**（值为 `AuthSession.sessionToken`；服务端通过 `getAuthCookie()` 解析） |


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

**实际响应字段说明：** 各 Route Handler 可能使用 **`data`、`user`、`school`、`schools`、`stats`、`users`、`invitationCodes`、`pagination`** 等与上表不完全一致的顶层字段；集成时请以对应路径的小节或源码为准。部分接口另返回 **409**（冲突）、**500**（配置缺失等）。

### 1.4 HTTP 状态码


| 状态码 | 含义       |
| --- | -------- |
| 200 | 成功       |
| 400 | 请求参数错误   |
| 401 | 未登录或认证失效 |
| 403 | 无权限      |
| 404 | 资源不存在    |
| 500 | 服务器内部错误  |
| 409 | 资源冲突（如学校代码重复） |


### 1.5 角色与权限


| 角色          | 说明                  |
| ----------- | ------------------- |
| STUDENT     | 学生                  |
| ADMIN       | 校级管理员（需绑定 schoolId） |
| STAFF       | 工作人员（需绑定 schoolId）  |
| SUPER_ADMIN | 超级管理员               |

### 1.6 Route Handler 实现规范（维护性）

- **禁止**在 `app/api/**/route.ts` 中调用会 **`redirect()`** 的 `requireAdmin()` 等 Server Action 守卫；未登录/无权限须返回 **`401` / `403` JSON**（与 `fetch` 客户端一致）。请使用 [`lib/api/guards.ts`](lib/api/guards.ts) 中的 **`requireSchoolAdminJson()`**、**`requireSuperAdminJson()`**、**`requireSessionJson()`**。
- **推荐**使用 [`lib/api/http.ts`](lib/api/http.ts) 的 **`jsonOk` / `jsonErr`** 构造响应，减少手写 `NextResponse.json` 分歧。
- **响应信封演进**：新接口或重构接口优先返回 **`data` 对象**承载业务载荷；历史接口可暂时保留顶层别名（例如 **`GET /api/schools`** 同时提供 `data.schools` 与顶层 `schools`），新集成请读 `data`。

---

## 二、Route Handlers（HTTP API）

本章节与仓库 **`app/api/**/route.ts`** 保持一致（当前共 **38** 个路由模块文件）。若下文与源码不一致，**以源码为准**。

### 2.1 认证


| 路径             | 方法  | 说明           | 权限        |
| -------------- | --- | ------------ | --------- |
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

#### 2.1.1 开发环境：种子账号（勿用于生产）

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/api/auth/seed` | POST | 初始化超管及系统学校等；**仅 `NODE_ENV !== "production"`**，否则 **403** |
| `/api/auth/seed-test-accounts` | POST | 创建测试学校/账号；**仅非 production**，否则 **403** |

---

### 2.2 学校与校区


| 路径                           | 方法     | 请求参数                         | 说明              | 权限 |
| ---------------------------- | ------ | ---------------------------- | --------------- | --- |
| `/api/schools/list`          | GET    | -                            | 激活学校列表（排除 `schoolCode=system`，`take` 200）；按客户端 IP **温和限流**（与 `getSchoolsList` 共用策略），超限 **429** | **公开** |
| `/api/schools`               | GET    | -                            | 学校列表 + 聚合统计（`getSchoolsWithStats`） | **仅 SUPER_ADMIN**；成功体为 **`{ success, data: { schools }, schools }`**（顶层 `schools` 为兼容别名，新客户端请用 `data.schools`） |
| `/api/schools/[id]`          | GET    | Path: `id`                   | 单校基本信息 | **ADMIN / STAFF / SUPER_ADMIN**；非超管仅可访问本校 `id` |
| `/api/schools/[id]`          | PUT    | Path: `id`, Body: `{ name }` | 更新学校名称 | **仅 SUPER_ADMIN** |
| `/api/schools/[id]`          | DELETE | Path: `id`                   | 删除学校（事务级联删该校多类数据） | **仅 SUPER_ADMIN** |
| `/api/schools/[id]/campuses` | GET    | Path: `id`                   | 校区列表（含 `boundary`、`center`、`labelCenter`） | **公开** |
| `/api/schools/detect`        | GET    | Query: `lat`, `lng`（GCJ-02） | 射线法 + `CampusArea` 多边形判定所属学校 | **公开** |


`**/api/schools/detect` 响应：**

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

#### 2.2.1 管理端：创建学校与统计

| 路径 | 方法 | 请求参数 | 说明 | 权限 |
| --- | --- | --- | --- | --- |
| `/api/admin/school` | POST | Body: `{ name, schoolCode }`（代码小写字母+数字） | 创建学校（无边界，后续由校区接口绘制） | **SUPER_ADMIN**；冲突 **409** |
| `/api/admin/stats` | GET | - | 全站概览：`totalUsers`、`totalSchools`（不含 system）、`todayPOIs`、`pendingReports`（POI `reportCount≥1`） | **SUPER_ADMIN** |
| `/api/admin/school/stats` | GET | Query: **`schoolId`（SUPER_ADMIN 必填）** | 本校用户/POI/待审核举报/今日 POI 等 | **ADMIN / STAFF / SUPER_ADMIN**；非超管使用会话 `schoolId` |

---

### 2.3 分类（公开）


| 路径                | 方法  | 请求参数              | 说明              | 权限  |
| ----------------- | --- | ----------------- | --------------- | --- |
| `/api/categories` | GET | Query: `schoolId` | 获取学校分类（常规 + 便民） | 公开  |


---

### 2.4 POI 搜索


| 路径                 | 方法  | 请求参数                                    | 说明     | 权限  |
| ------------------ | --- | --------------------------------------- | ------ | --- |
| `/api/pois/search` | GET | Query: **`schoolId`（必填）**, `q?`, **`ongoingOnly?`**（`true` 时仅返回有进行中活动的 POI） | 名称/别称/活动文案匹配；默认结果含 **`reportCount < 3`** 过滤（与 ongoing 分支逻辑见源码） | **公开** |


---

### 2.5 管理端 - 分类


| 路径                                    | 方法     | 请求参数                                           | 说明     | 权限                          |
| ------------------------------------- | ------ | ---------------------------------------------- | ------ | --------------------------- |
| `/api/admin/categories`               | GET    | Query: `all?`, `grouped?`, `page?`, `limit?`   | 获取学校分类 | ADMIN/STAFF（本校）             |
| `/api/admin/categories`               | POST   | Body: `{ name, icon?, isGlobal? }`             | 创建分类   | ADMIN/STAFF；全局仅 SUPER_ADMIN |
| `/api/admin/categories/[id]`          | DELETE | Path: `id`                                     | 删除分类   | ADMIN/STAFF（本校）             |
| `/api/admin/categories/[id]/override` | PATCH  | Path: `id`, Body: `{ isHidden?, customName? }` | 更新分类覆盖 | ADMIN/STAFF（本校）             |
| `/api/admin/categories/[id]/override` | DELETE | Path: `id`                                     | 删除分类覆盖 | ADMIN/STAFF（本校）             |
| `/api/admin/global-categories`        | GET    | Query: `page?`                                 | 获取全局分类 | SUPER_ADMIN                 |
| `/api/admin/global-categories`        | POST   | Body: `{ name, icon? }`                        | 创建全局分类 | SUPER_ADMIN                 |
| `/api/admin/global-categories/[id]`   | DELETE | Path: `id`                                     | 删除全局分类 | SUPER_ADMIN                 |


---

### 2.6 管理端 - 校区


| 路径                         | 方法     | 请求参数                                     | 说明     | 权限 |
| -------------------------- | ------ | ---------------------------------------- | ------ | -------------------------- |
| `/api/admin/campuses`      | GET    | Query: **`schoolId`（SUPER_ADMIN 必填）**；本校角色可省略（使用会话 `schoolId`） | 获取校区列表 | **ADMIN / STAFF / SUPER_ADMIN**（本校数据） |
| `/api/admin/campuses`      | POST   | Body: `{ schoolId?, name, boundary }`（`boundary` 为 `[[lng,lat],...]` 至少 3 点） | 创建校区 | **ADMIN / SUPER_ADMIN**；**STAFF → 403** |
| `/api/admin/campuses/[id]` | PUT    | Path: `id`, Body: `{ name?, boundary? }` | 更新校区 | **ADMIN / SUPER_ADMIN**；**STAFF → 403** |
| `/api/admin/campuses/[id]` | DELETE | Path: `id`                               | 删除校区 | **ADMIN / SUPER_ADMIN**；**STAFF → 403** |


---

### 2.7 管理端 - 集市分类


| 路径                                         | 方法     | 请求参数                                             | 说明               | 权限          |
| ------------------------------------------ | ------ | ------------------------------------------------ | ---------------- | ----------- |
| `/api/admin/market-categories`             | GET    | -                                                | 获取物品分类池 + 交易类型关联 | SUPER_ADMIN |
| `/api/admin/market-categories`             | POST   | Body: `{ name, order? }`                         | 创建物品分类           | SUPER_ADMIN |
| `/api/admin/market-categories/[id]`        | PUT    | Path: `id`, Body: `{ name?, order?, isActive? }` | 更新物品分类           | SUPER_ADMIN |
| `/api/admin/market-categories/[id]`        | DELETE | Path: `id`                                       | 删除物品分类           | SUPER_ADMIN |
| `/api/admin/market-categories/toggle-type` | POST   | Body: `{ typeId, categoryId }`                   | 切换交易类型与分类关联      | SUPER_ADMIN |


---

### 2.8 管理端 - 集市商品


| 路径                             | 方法    | 请求参数                                                                      | 说明        | 权限                      |
| ------------------------------ | ----- | ------------------------------------------------------------------------- | --------- | ----------------------- |
| `/api/admin/market/items`      | GET   | Query: `schoolId`, `search?`, `categoryId?`, `status?`, `page?`, `limit?` | 获取集市商品列表  | ADMIN/STAFF/SUPER_ADMIN |
| `/api/admin/market/items/[id]` | PATCH | Path: `id`，Body: `{ action }`，`action` 为 **`delete`** 或 **`relist`** | 管理员操作商品（下架/重上架等，业务规则见 `adminMarketItemAction`） | ADMIN / STAFF / SUPER_ADMIN（须匹配本校数据） |


---

### 2.9 管理端 - 用户


| 路径                 | 方法     | 请求参数                                                                | 说明      | 权限          |
| ------------------ | ------ | ------------------------------------------------------------------- | ------- | ----------- |
| `/api/admin/users` | GET    | Query: `role?`, `schoolId?`, `search?`, `field?`, `page?`, `limit?` | 获取用户列表  | SUPER_ADMIN |
| `/api/admin/users` | PATCH  | Body: `{ id, status }`，`status` 为 **`ACTIVE`** 或 **`INACTIVE`** | 停用/激活用户 | SUPER_ADMIN |
| `/api/admin/users` | DELETE | Body: `{ id }`                                                      | 永久删除用户  | SUPER_ADMIN |


---

### 2.10 举报与审核


| 路径                          | 方法   | 请求参数                                             | 说明            | 权限 |
| --------------------------- | ---- | ------------------------------------------------ | ------------- | --------------- |
| `/api/audit/report`         | POST | Body: `{ poiId, reason, description? }`；`reason` 枚举：`定位不准` / `信息错误` / `有害内容` | 与 Server Action **`reportPOI`** 同逻辑：须登录；用户级 + 单 POI 限流；未登录 **401**，超限 **429** | **须登录** |
| `/api/audit/reports`        | GET  | Query: **`schoolId`（必填）**, `minReportCount?`（默认 1） | 被举报 POI 列表 | **ADMIN / STAFF（本校）**；**SUPER_ADMIN → 403**（代码显式禁止超管审内容） |
| `/api/audit/resolve`        | POST | Body: `{ poiId, action }`，`action` 为 **`ignore`** 或 **`delete`** | 处理 POI 举报     | **ADMIN / STAFF**；**SUPER_ADMIN → 403** |
| `/api/audit/market-items`   | GET  | Query: **`schoolId`（必填）**, `minReportCount?` | 被举报/隐藏等集市商品列表 | **ADMIN / STAFF**；**SUPER_ADMIN → 403** |
| `/api/audit/market-resolve` | POST | Body: `{ itemId, action }`，`action` 为 **`pass`** 或 **`delete`** | 处理集市举报        | **ADMIN / STAFF**；**SUPER_ADMIN → 403** |


---

### 2.11 敏感词（屏蔽词）


| 路径                   | 方法     | 请求参数                                            | 说明      | 权限          |
| -------------------- | ------ | ----------------------------------------------- | ------- | ----------- |
| `/api/keywords`      | GET    | Query: `page?`, `limit?`, `q?`                  | 分页列表；返回 `data` + `pagination` | **SUPER_ADMIN** |
| `/api/keywords`      | POST   | Body: **`{ keyword }`** | 新增；**`addedById` 由服务端取当前登录用户**，请求体无需传 | **SUPER_ADMIN** |
| `/api/keywords/[id]` | DELETE | Path: `id`                                      | 删除屏蔽词   | **SUPER_ADMIN** |
| `/api/keywords/bulk` | POST   | Body: **`{ words }`**：`string[]` **或** 逗号/换行分隔的 **单字符串** | 批量创建；`addedById` 同为会话用户；返回 `added` / `skipped` | **SUPER_ADMIN** |


---

### 2.12 邀请码


| 路径                           | 方法     | 请求参数                                             | 说明      | 权限                |
| ---------------------------- | ------ | ------------------------------------------------ | ------- | ----------------- |
| `/api/invitation-codes`      | GET    | Query: `schoolId?`, `issuerId?`, `isUsed?`（`true`→`USED`，否则筛 `ACTIVE`） | 列表；校管仅看本校；`issuerId` 非超管时仅允许等于本人 | **ADMIN / SUPER_ADMIN**（**STAFF无此 API**） |
| `/api/invitation-codes`      | POST   | Body: **`{ schoolId, role, expiresAt? }`**；**`role` 为数字 `2`（校管）或 `3`（工作人员）**；**`createdByUserId` 为当前用户** | 生成随机码；校管仅能为本校创建 | **ADMIN / SUPER_ADMIN** |
| `/api/invitation-codes/[id]` | DELETE | Path: `id`（**硬删除**） | 作废 | **发放人本人或 SUPER_ADMIN** |


---

### 2.13 用户


| 路径           | 方法  | 请求参数                       | 说明       | 权限  |
| ------------ | --- | -------------------------- | -------- | --- |
| `/api/users` | GET | Query: **`schoolId`（SUPER_ADMIN 必填）**, `role?`（可选，数字角色） | 本校用户简要列表（`id/nickname/role/createdAt`）；非超管强制使用会话 `schoolId` | **ADMIN / STAFF / SUPER_ADMIN** |


---

### 2.14 定时任务


| 路径                          | 方法  | 请求参数                                           | 说明       | 权限             |
| --------------------------- | --- | ---------------------------------------------- | -------- | -------------- |
| `/api/cron/market-deadlock` | GET | Header: **`Authorization: Bearer ${CRON_SECRET}`**（**必填**，与是否配置密钥一致：已配置则必须匹配） | 集市死锁/自动解锁等（`processMarketDeadlocks`） | 未配置 **`CRON_SECRET`**：`production` → **500**，非生产 → **401**；已配置但 Header 不匹配 → **401** |


---

## 三、Server Actions

### 3.1 认证（auth-server-actions）


| 函数                 | 参数                   | 返回                                  | 说明          |
| ------------------ | -------------------- | ----------------------------------- | ----------- |
| `getAuthCookie`    | -                    | `AuthCookieData | null`             | 读取认证 Cookie |
| `removeAuthCookie` | -                    | `void`                              | 清除认证 Cookie |
| `loginUser`        | `formData: FormData` | `{ success, message?, user? }`      | 登录          |
| `registerUser`     | `formData: FormData` | `{ success?, message? }` 或 redirect | 注册          |
| `logoutUser`       | -                    | redirect                            | 登出          |
| `requireAdmin`     | -                    | `AuthCookieData`                    | 校验管理员权限     |
| `getCurrentUser`   | -                    | `AuthCookieData | null`             | 获取当前认证用户    |
| `getMe`            | -                    | `GetMeResult`                       | 获取当前用户完整信息  |


---

### 3.2 学校（school-actions）


| 函数                       | 参数                               | 返回                           | 说明          |
| ------------------------ | -------------------------------- | ---------------------------- | ----------- |
| `getSchoolsList`         | -                                | `SchoolListResult`           | 获取激活学校列表（**公开**；按 IP 温和限流，超限 `success: false`） |
| `getSchoolById`          | `schoolId: string`               | `SchoolDetailResult`         | 获取学校详情      |
| `detectSchoolByLocation` | `lat: number, lng: number`       | `DetectSchoolResultType`     | 根据经纬度检测学校   |
| `getCampuses`            | `schoolId: string`               | `GetCampusesResult`          | 获取校区列表      |
| `createCampus`           | `{ schoolId, name, boundary }`   | `{ success, data?, error? }` | 创建校区        |
| `updateCampus`           | `campusId, { name?, boundary? }` | `{ success, data?, error? }` | 更新校区        |
| `deleteCampus`           | `campusId: string`               | `{ success, error? }`        | 删除校区        |
| `getSchoolsWithStats`    | -                                | `{ success, data? }`         | 获取学校列表（含统计） |
| `updateSchool`           | `schoolId, { name }`             | `SchoolActionResult`         | 更新学校（超管）    |
| `createSchool`           | `{ name, schoolCode }`           | `SchoolActionResult`         | 创建学校（超管）    |
| `updateSchoolStatus`     | `schoolId, status`               | `SchoolActionResult`         | 更新学校状态（超管）  |
| `deleteSchool`           | `schoolId: string`               | `SchoolActionResult`         | 删除学校（超管）    |


---

### 3.3 POI（poi-actions）


| 函数                | 参数                                | 返回                                 | 说明           |
| ----------------- | --------------------------------- | ---------------------------------- | ------------ |
| `searchPOIs`      | `schoolId, { q?, ongoingOnly? }?` | `POIActionResult<POISearchItem[]>` | 搜索 POI       |
| `reportPOI`       | `poiId, reason, description?`     | `POIActionResult`                  | 举报 POI（**须登录**；用户级/单 POI 限流，与 `POST /api/audit/report` 一致） |
| `getPOIsBySchool` | `schoolId, options?`              | `POIActionResult`                  | 按学校获取 POI 列表 |
| `createPOI`       | `CreatePOIInput`                  | `POIActionResult<{ poi }>`         | 创建 POI       |
| `getPOIDetail`    | `id: string`                      | `POIActionResult<{ poi }>`         | 获取 POI 详情    |
| `updatePOI`       | `id, UpdatePOIInput`              | `POIActionResult<{ poi }>`         | 更新 POI       |
| `deletePOI`       | `id: string`                      | `POIActionResult<void>`            | 删除 POI       |


---

### 3.4 分类（category-actions）


| 函数                             | 参数                                       | 返回                                        | 说明           |
| ------------------------------ | ---------------------------------------- | ----------------------------------------- | ------------ |
| `getCategoriesForFilter`       | `schoolId: string`                       | `{ success, data?, error? }`              | 获取筛选面板分类     |
| `getSchoolCategoriesForAdmin`  | `schoolId, options`                      | `{ success, data?, pagination?, error? }` | 获取学校分类（管理员）  |
| `createSchoolCategory`         | `{ schoolId, name, icon? }`              | `{ success, data?, error? }`              | 创建学校分类       |
| `getGlobalCategories`          | `params?`                                | `{ success, data?, pagination?, error? }` | 获取全局分类（超管）   |
| `createGlobalCategory`         | `{ name, icon? }`                        | `{ success, data?, error? }`              | 创建全局分类（超管）   |
| `deleteGlobalCategory`         | `id: string`                             | `{ success, error? }`                     | 删除全局分类（超管）   |
| `getMicroCategories`           | -                                        | `{ success, data?, error? }`              | 获取便民公共设施分类   |
| `createMicroCategory`          | `{ name, icon? }`                        | `CategoryActionResult`                    | 创建便民公共设施（超管） |
| `updateMicroCategory`          | `id, { name?, icon? }`                   | `CategoryActionResult`                    | 更新便民公共设施（超管） |
| `deleteMicroCategory`          | `id: string`                             | `CategoryActionResult`                    | 删除便民公共设施（超管） |
| `updateCategory`               | `id, { name?, icon? }`                   | `CategoryUpdateResult`                    | 更新 POI 分类    |
| `updateCategoryOverride`       | `categoryId, { isHidden?, customName? }` | `{ success, message?, error? }`           | 更新分类覆盖       |
| `removeCategoryOverrideAction` | `categoryId: string`                     | `{ success, message?, error? }`           | 删除分类覆盖       |
| `deleteCategory`               | `id: string`                             | `CategoryUpdateResult`                    | 删除 POI 分类    |
| `getAllUniqueCategories`       | `filters?`                               | `GetAllUniqueCategoriesResult`            | 获取全量分类（超管）   |


---

### 3.5 用户（user-actions）


| 函数                       | 参数                      | 返回                                        | 说明          |
| ------------------------ | ----------------------- | ----------------------------------------- | ----------- |
| `getSchoolUsers`         | `GetSchoolUsersParams?` | `{ success, data?, pagination?, error? }` | 获取本校用户列表    |
| `getAdminUserDetail`     | `userId: string`        | `{ success, data?, error? }`              | 获取用户详情（管理员） |
| `adminResetUserPassword` | `userId, newPassword`   | `{ success, message }`                    | 管理员重置密码     |
| `getAdminUsers`          | `params`                | `{ success, data?, pagination?, error? }` | 获取所有用户（超管）  |
| `deleteUser`             | `userId: string`        | `{ success, message?, error? }`           | 永久删除用户（超管）  |
| `deactivateUser`         | `userId, status`        | `{ success, message }`                    | 停用/激活用户     |
| `getPublicProfile`       | `userId: string`        | `{ success, data?, error? }`              | 获取公开资料      |
| `deleteMyAccount`        | -                       | `{ success, message?, error? }`           | 注销账号        |
| `getUserReputation`      | `targetUserId, mode`    | 委托至 market-actions                        | 获取用户集市声誉    |


---

### 3.6 集市（market-actions）


| 函数                               | 参数                     | 返回                                           | 说明           |
| -------------------------------- | ---------------------- | -------------------------------------------- | ------------ |
| `getMarketCategoriesByType`      | -                      | `MarketActionResult<MarketCategoriesByType>` | 按交易类型获取分类    |
| `getMarketCategories`            | -                      | `MarketActionResult<MarketCategoriesResult>` | 获取集市分类与交易类型  |
| `getTransactionTypes`            | -                      | `{ success, data? }`                         | 获取交易类型       |
| `getPublicMarketItems`           | `schoolId, options?`   | `MarketActionResult`                         | 获取公开集市商品     |
| `getMarketItemDetail`            | `id: string`           | `MarketActionResult`                         | 获取商品详情       |
| `getMyMarketItems`               | -                      | `MarketActionResult<MyMarketItemsResult>`    | 获取我的集市活动     |
| `createMarketItem`               | `CreateMarketItemDTO`  | `MarketActionResult`                         | 创建商品         |
| `updateMarketItem`               | `itemId, payload`      | `MarketActionResult`                         | 更新商品         |
| `submitIntention`                | `itemId, contactInfo?` | `MarketActionResult`                         | 提交意向         |
| `selectBuyerAndLock`             | `itemId, buyerId`      | `MarketActionResult`                         | 选定买家并锁定      |
| `getIntentions`                  | `itemId: string`       | `MarketActionResult`                         | 获取意向列表       |
| `withdrawIntention`              | `itemId: string`       | `MarketActionResult`                         | 撤回意向         |
| `unlockMarketItem`               | `itemId: string`       | `MarketActionResult`                         | 解锁商品         |
| `confirmTransaction`             | `itemId: string`       | `MarketActionResult`                         | 确认交易         |
| `rateMarketTransaction`          | `itemId, isPositive`   | `MarketActionResult`                         | 评价交易         |
| `getUserReputation`              | `targetUserId, mode`   | `MarketActionResult`                         | 获取用户声誉       |
| `getMarketThumbsUpRate`          | `userId: string`       | `{ success, data? }`                         | 获取好评率        |
| `reportMarketItem`               | `itemId: string`       | `MarketActionResult`                         | 举报商品         |
| `deleteMarketItem`               | `itemId: string`       | `MarketActionResult`                         | 删除商品         |
| `adminMarketItemAction`          | `itemId, action`       | `MarketActionResult`                         | 管理员操作商品      |
| `getAdminMarketItems`            | `schoolId, params`     | `{ success, data?, error? }`                 | 管理员获取商品列表    |
| `getAdminMarketCategoriesConfig` | -                      | `{ success, data?, error? }`                 | 获取集市分类配置（超管） |


> **已移除**：`updateMarketItemStatus`、`requestMarketItem`（别名）已删除。

---

### 3.7 举报审核（audit-actions）


| 函数                    | 参数                                   | 返回                                             | 说明           |
| --------------------- | ------------------------------------ | ---------------------------------------------- | ------------ |
| `getAuditReports`     | `schoolId, minReportCount?`          | `AuditActionResult<ReportedPOIItem[]>`         | 获取被举报 POI 列表 |
| `getAuditMarketItems` | `schoolId, minReportCount?`          | `AuditActionResult<ReportedMarketItemEntry[]>` | 获取被举报集市商品    |
| `resolveAudit`        | `poiId, action: "ignore" | "delete"` | `AuditActionResult`                            | 处理 POI 举报    |
| `resolveMarketAudit`  | `itemId, action: "pass" | "delete"`  | `AuditActionResult`                            | 处理集市举报       |


---

### 3.8 敏感词（keyword-actions）


| 函数                   | 参数                               | 返回                                         | 说明      |
| -------------------- | -------------------------------- | ------------------------------------------ | ------- |
| `getKeywords`        | `{ page?, limit?, q? }?`         | `KeywordActionResult<SensitiveWordItem[]>` | 获取屏蔽词列表 |
| `createKeyword`      | `keyword: string`                | `KeywordActionResult<SensitiveWordItem>`   | 添加屏蔽词   |
| `bulkCreateKeywords` | `{ words: string[] }`（`addedById` 由服务端使用当前用户） | `KeywordActionResult`                      | 批量添加屏蔽词 |
| `deleteKeyword`      | `id: string`                     | `KeywordActionResult`                      | 删除屏蔽词   |


---

### 3.9 其他 Actions 模块


| 模块                      | 主要函数                                                                                                                                                                                                                                                                                  | 说明                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| activity-actions        | `createActivity`, `updateActivity`, `deleteActivity`, `getActivitiesBySchool`, `getOngoingActivities`                                                                                                                                                                                 | 活动管理                 |
| invitation-actions      | `listInvitationCodes`, `createInvitationCode`, `validateInvitationCode`, `consumeInvitationCode`, `toggleInvitationCodeStatus`                                                                                                                                                        | 邀请码管理                |
| comment-actions         | `getPOIComments`, `createComment`, `submitQuickReply`, `toggleCommentLike`, `deleteComment`, `reportComment`, `getSchoolComments`, `reviewComment`                                                                                                                                    | 评论管理                 |
| status-actions          | `reportLiveStatus`, `getActiveStatusesBySchool`, `getActiveStatusesByPoi`                                                                                                                                                                                                             | 实时状态                 |
| profile-actions         | `updateProfile`, `updateEmail`, `updatePassword`                                                                                                                                                                                                                                      | 个人资料                 |
| notification-actions    | `getUserNotifications`, `getUserMarketNotifications`, `markAsRead`, `markAllAsRead`                                                                                                                                                                                                   | 消息通知                 |
| lost-found-actions      | `createLostFoundEvent`, `getUserLostFoundEvents`, `checkLostFoundEvent`, `markAsFound`                                                                                                                                                                                                | 失物招领                 |
| admin-actions           | `getSuperAdminStats`, `getSchoolAdminStats`                                                                                                                                                                                                                                           | 管理统计                 |
| admin-analytics-actions | `getNewUsersTrend`, `getCumulativeUsersTrend`, `getNewUsersBySchool`, `getDauWauMauTrend`, `getRetentionTrend`, `getDormantTrend`, `getMarketListingsTrend`, `getMarketByType`, `getMarketBySchool`, `getCommentsTrend`, `getPoiTrend`, `getContentBySchool`, `getNotificationsTrend` | 超级管理员数据分析（时序与分布）     |
| admin-report-actions    | `exportReportCsv`                                                                                                                                                                                                                                                                     | 超级管理员周报/月报/年报 CSV 导出 |


---

### 3.10 超级管理员统计与报表（admin-actions / admin-analytics-actions / admin-report-actions）

`**getSuperAdminStats`** 返回 `SuperAdminStats`，含用户增长、留存、集市、内容、消息、**核心率指标**（用户活跃率、集市成交/过期率、留言互动率、失物招领完成率、反馈/举报处理率）、内容健康等。

`**exportReportCsv(period: "week" | "month" | "year")`** 导出 CSV，含用户增长、留存、集市、内容、核心率指标、消息。返回 `{ success, csv, filename }`。

---

## 四、多租户与数据隔离

### 4.1 租户标识

**默认：** 校区业务表含 `schoolId`，查询 `where: { schoolId: currentSchoolId }`（超管跨校须显式）；创建时从会话注入，**禁止**信任客户端随意传 `schoolId`。

**例外（以 `prisma/schema.prisma` 为准）：** 如 **`Feedback`**、全局 **`MarketCategory`** / **`MarketTransactionType`** 等不按校租户隔离；集成前请查模型定义。

### 4.2 权限矩阵


| 操作类型           | STUDENT | ADMIN | STAFF | SUPER_ADMIN |
| -------------- | ------- | ----- | ----- | ----------- |
| 查看本校数据         | ✓       | ✓     | ✓     | ✓           |
| 管理本校 POI/分类/校区 | ✗       | ✓     | ✓（部分） | ✓           |
| 管理本校用户         | ✗       | ✓     | ✓     | ✓           |
| 管理本校集市         | ✗       | ✓     | ✓     | ✓           |
| 全局分类/集市配置      | ✗       | ✗     | ✗     | ✓           |
| 跨校/全平台数据       | ✗       | ✗     | ✗     | ✓           |


---

## 五、注意事项

1. **Server Actions 与 redirect**：在 Server Action 的 `try...catch` 中若调用 `redirect()`，需捕获并重新抛出 `NEXT_REDIRECT` 错误。
2. **坐标系统**：地图相关接口统一使用 **GCJ-02** 坐标系。
3. **分页**：分页接口常见 `pagination: { total, pageCount, currentPage, ... }`（字段名以各接口实现为准）。
4. **审核 API**：`/api/audit/reports`、`resolve`、`market-items`、`market-resolve` 对 **SUPER_ADMIN** 返回 **403**，与产品「超管不参与本校内容审核」一致。
5. **开发专用**：`/api/auth/seed`、`/api/auth/seed-test-accounts` 仅在非 `production` 可用。
6. **中间件**：后台页面中间件通过携带 Cookie 请求 **`GET /api/auth/me`** 做角色校验，改动鉴权逻辑时需与 **`getAuthCookie()`** 保持一致。
7. **Cron**：本地与线上均须在环境变量中配置 **`CRON_SECRET`**，调用时携带 **`Authorization: Bearer <CRON_SECRET>`**。

---

## 六、修订记录


| 版本   | 修订日期       | 修订内容                                                                        |
| ---- | ---------- | --------------------------------------------------------------------------- |
| v1.4 | 2026-04-18 | Cron 全环境 Bearer；`reportPOI` / `POST /api/audit/report` 须登录与限流；`getSchoolsList` 与 `GET /api/schools/list` IP 限流；`GET /api/auth/me` 对停用用户防御处理；多处管理/审核/关键词 API 统一 `lib/api/guards` |
| v1.3 | 2026-04-18 | §1.6 Route Handler 规范；`lib/api/http`、`lib/api/guards`；分类/校区 API 改为 JSON 鉴权；`GET /api/schools` 增加 `data.schools`信封；`admin/users` 查询类型与 Zod 校验 |
| v1.2 | 2026-04-18 | 与当前 **38** 个 Route Handler 对齐：Cookie 名、`/api/schools` 与 `[id]` 权限、新增 `/api/admin/school` 与统计接口、屏蔽词/邀请码请求体、审核接口超管限制、POI 搜索与校区 STAFF 权限、cron 环境行为、种子路由说明；§4.1 租户例外 |
| v1.1 | 2026-03-11 | 新增 admin-analytics-actions、admin-report-actions；扩展 getSuperAdminStats 核心率指标 |
| v1.0 | 2026-03-10 | 初版，基于项目当前实现整理                                                               |



# Scripts 目录说明

## 数据库 Schema（唯一来源）

**`prisma/schema.prisma` 是数据库结构的唯一权威来源。**

同步本地或开发库：

```bash
npm run db:push
```

请勿再使用已删除的手工 SQL 建表脚本。历史上 `add-square-post-fields.sql` 与 Prisma 定义不一致（缺少 `scope` 列及 `@@index([scope])`），已于 2026-05 废弃并移除。

### `square_posts` 表

以 `prisma/schema.prisma` 中 `SquarePost` / `PostScope` 为准，包含：

- `scope`（`PostScope` enum，`INTRA` | `INTER`，默认 `INTRA`）
- `like_count`、`comment_count` 等计数列
- 索引：`school_id`、`user_id`、`created_at`、`is_hidden`、`is_reviewed`、`report_count`、`scope`

若库中已有旧版 `square_posts`（无 `scope`），执行 `npm run db:push` 即可补齐缺失列与索引。

生产环境变更策略：当前项目使用 `db push`；未来若引入 Prisma Migrate，迁移文件亦须与 `schema.prisma` 保持一致。

## 一次性数据迁移脚本

| 脚本 | 命令 | 用途 |
|------|------|------|
| `migrate-campus-label-center.ts` | `npm run migrate:label-center` | 校区标签中心点迁移 |
| `migrate-invitation-code-expires-at.ts` | `npm run migrate:invitation-expires` | 邀请码过期时间迁移 |
| `verify-market-content-shielding.ts` | `tsx scripts/verify-market-content-shielding.ts` | 集市内容屏蔽校验（运维） |

新增脚本请在本表登记，并说明是否可重复执行、是否需备份。

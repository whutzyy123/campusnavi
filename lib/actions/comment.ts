/**
 * 留言 Server Actions 兼容层（canonical 导入路径）
 *
 * 请从 `@/lib/actions/comment` 导入；本文件仅重导出 `./comment/index`。
 * 实际 Server Actions 在 `lib/actions/comment/*.ts` 子模块中声明 `"use server"`。
 * 共用类型见 `lib/comment/types.ts`。
 */

export * from "./comment/index";

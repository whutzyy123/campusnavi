/**
 * 数据库 User.role（Int）与应用层角色字符串的单一映射。
 * 与 Prisma schema 注释一致：1学生、2 校管、3 工作人员、4 超管。
 */

export type AppRole = "STUDENT" | "ADMIN" | "STAFF" | "SUPER_ADMIN";

const DB_TO_APP: Record<number, AppRole> = {
  1: "STUDENT",
  2: "ADMIN",
  3: "STAFF",
  4: "SUPER_ADMIN",
};

const APP_TO_DB: Record<AppRole, number> = {
  STUDENT: 1,
  ADMIN: 2,
  STAFF: 3,
  SUPER_ADMIN: 4,
};

/** 注册表单等使用的应用层角色（不含超管自助注册） */
export type RegisterableAppRole = "STUDENT" | "ADMIN" | "STAFF";

/** 未映射的 DB 值返回 null，由调用方清会话或拒绝登录，避免静默当成学生 */
export function dbRoleToAppRole(role: number): AppRole | null {
  return DB_TO_APP[role] ?? null;
}

export function appRoleToDbRole(role: AppRole): number {
  return APP_TO_DB[role];
}

/** 注册：STUDENT / ADMIN / STAFF → DB Int */
export function registerableRoleToDbRole(role: RegisterableAppRole): number {
  return APP_TO_DB[role];
}

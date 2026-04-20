/**
 * 多租户本校校验：与 lib/poi-actions 等「SUPER_ADMIN 可跨校」语义一致。
 * - SUPER_ADMIN：不因本校与资源 schoolId 不一致而拒绝。
 * - schoolId 为 null 的会话：不因本校校验拒绝（保留历史行为）。
 * - 否则仅当会话 schoolId 与资源 schoolId 一致时允许。
 */

export type SchoolScopedPrincipal = {
  role: string;
  schoolId: string | null;
};

/**
 * @returns true 表示应拒绝访问（跨校且无跨校权限）
 */
export function deniedBySchoolTenant(
  auth: SchoolScopedPrincipal,
  resourceSchoolId: string | null
): boolean {
  if (auth.role === "SUPER_ADMIN") return false;
  if (auth.schoolId == null) return false;
  return auth.schoolId !== resourceSchoolId;
}

export function canAccessSchoolScopedResource(
  auth: SchoolScopedPrincipal,
  resourceSchoolId: string | null
): boolean {
  return !deniedBySchoolTenant(auth, resourceSchoolId);
}

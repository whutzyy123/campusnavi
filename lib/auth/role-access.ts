export type UserRole = "STUDENT" | "ADMIN" | "STAFF" | "SUPER_ADMIN";

export function hasAdminAccess(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "STAFF" || role === "SUPER_ADMIN";
}

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === "SUPER_ADMIN";
}

export function getAdminHrefByRole(role: string | null | undefined): string {
  return isSuperAdmin(role) ? "/super-admin" : "/admin";
}


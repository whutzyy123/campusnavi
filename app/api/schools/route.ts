import { getSchoolsWithStats } from "@/lib/school-actions";
import { jsonErr, jsonOk } from "@/lib/api/http";
import { requireSuperAdminJson, isAuthError } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

/**
 * GET /api/schools
 * 获取所有学校列表（带聚合数据，用于超级管理员后台）
 * 使用 getSchoolsWithStats，确保 0 用户的学校也会返回
 */
export async function GET() {
  try {
    const authResult = await requireSuperAdminJson();
    if (isAuthError(authResult)) return authResult;

    const result = await getSchoolsWithStats();

    if (!result.success) {
      return jsonErr(result.error ?? "服务器错误", 500);
    }

    const schools = result.data;
    /** 推荐读取 `data.schools`；`schools` 为兼容旧客户端的顶层别名 */
    return jsonOk({ data: { schools }, schools });
  } catch (error) {
    console.error("获取学校列表失败:", error);
    return jsonErr(
      "服务器内部错误",
      500,
      error instanceof Error ? error.message : "未知错误"
    );
  }
}

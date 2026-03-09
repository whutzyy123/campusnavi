import { NextResponse } from "next/server";
import { getSchoolsWithStats } from "@/lib/school-actions";

/**
 * GET /api/schools
 * 获取所有学校列表（带聚合数据，用于超级管理员后台）
 * 使用 getSchoolsWithStats，确保 0 用户的学校也会返回
 */
export async function GET() {
  try {
    const result = await getSchoolsWithStats();

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      schools: result.data,
    });
  } catch (error) {
    console.error("获取学校列表失败:", error);
    return NextResponse.json(
      {
        success: false,
        message: "服务器内部错误",
        error: error instanceof Error ? error.message : "未知错误",
      },
      { status: 500 }
    );
  }
}


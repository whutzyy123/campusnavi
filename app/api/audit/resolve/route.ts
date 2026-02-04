import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/audit/resolve
 * 管理员处理举报
 * 
 * 请求体：
 * {
 *   poiId: string,
 *   action: "ignore" | "delete", // ignore: 忽略举报（重置计数）, delete: 删除 POI
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { poiId, action } = body;

    // 验证必填字段
    if (!poiId || !action) {
      return NextResponse.json(
        { success: false, message: "缺少必填字段：poiId, action" },
        { status: 400 }
      );
    }

    // 验证操作类型
    if (!["ignore", "delete"].includes(action)) {
      return NextResponse.json(
        { success: false, message: "无效的操作类型，必须是 ignore 或 delete" },
        { status: 400 }
      );
    }

    // 验证 POI 是否存在
    const poi = await prisma.pOI.findUnique({
      where: { id: poiId },
      select: {
        id: true,
        schoolId: true,
        reportCount: true,
      },
    });

    if (!poi) {
      return NextResponse.json(
        { success: false, message: "POI 不存在" },
        { status: 404 }
      );
    }

    // 执行操作
    if (action === "ignore") {
      // 忽略举报：重置 reportCount
      await prisma.pOI.update({
        where: { id: poiId },
        data: {
          reportCount: 0,
        },
      });

      return NextResponse.json({
        success: true,
        message: "已忽略举报，POI 已恢复显示",
      });
    } else if (action === "delete") {
      // 删除 POI（级联删除相关数据）
      await prisma.pOI.delete({
        where: { id: poiId },
      });

      return NextResponse.json({
        success: true,
        message: "POI 已永久删除",
      });
    }
  } catch (error) {
    console.error("处理举报失败:", error);
    return NextResponse.json(
      {
        success: false,
        message: "服务器内部错误",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}


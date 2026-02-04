import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthCookie } from "@/lib/auth-server-actions";

// 删除留言：仅作者本人 / 校管理员 / 超级管理员
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthCookie();
    if (!auth) {
      return NextResponse.json(
        { success: false, message: "未登录用户无权删除留言" },
        { status: 401 }
      );
    }

    const { id } = params;

    const comment = await prisma.comment.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        schoolId: true,
        reportCount: true,
        replies: {
          select: { id: true },
        },
      },
    });

    if (!comment) {
      return NextResponse.json(
        { success: false, message: "留言不存在" },
        { status: 404 }
      );
    }

    const isAuthor = comment.userId === auth.userId;
    const isSchoolAdminOrStaff =
      (auth.role === "ADMIN" || auth.role === "STAFF") &&
      !!auth.schoolId &&
      auth.schoolId === comment.schoolId;
    const isSuperAdmin = auth.role === "SUPER_ADMIN";

    if (!isAuthor && !isSchoolAdminOrStaff && !isSuperAdmin) {
      return NextResponse.json(
        { success: false, message: "无权删除该留言" },
        { status: 403 }
      );
    }

    // 区分用户自删和管理员删除
    if (isAuthor) {
      // 用户自己删除：如果未被举报，物理删除；如果已被举报，软删除但标记为已处理
      if (comment.reportCount === 0) {
        // 未被举报，物理删除（不会出现在审核列表中）
        await prisma.comment.delete({
          where: { id: comment.id },
        });
      } else {
        // 已被举报，软删除但标记为已处理（管理员仍可看到，但知道用户已自删）
        await prisma.comment.update({
          where: { id: comment.id },
          data: {
            content: "[该留言已删除]",
            isHidden: true,
            // 保持 reportCount 不变，让管理员知道曾经被举报过
          },
        });
      }
    } else {
      // 管理员删除：物理删除违规留言
      // 子回复的 parentId 会被设置为 null（onDelete: SetNull），不会丢失数据
      await prisma.comment.delete({
        where: { id: comment.id },
      });
    }

    return NextResponse.json({
      success: true,
      message: "留言已删除",
    });
  } catch (error) {
    console.error("删除留言失败:", error);
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



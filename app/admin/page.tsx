import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-server-actions";
import { prisma } from "@/lib/prisma";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/card";
import { Users, MapPin, AlertTriangle, PlusCircle } from "lucide-react";

/**
 * 校级管理员中央控制台（Server Component）
 * 从 HTTP Only Cookie 读取认证信息，验证权限后显示统计数据
 */
export default async function AdminDashboard() {
  // 验证管理员权限（如果未授权会重定向）
  const authData = await requireAdmin();

  if (!authData.schoolId) {
    // 超级管理员不应该访问这个页面
    redirect("/super-admin");
  }

  // 获取学校统计数据
  let stats = null;
  try {
    const [totalUsers, totalPOIs, pendingReports, todayPOIs] = await Promise.all([
      // 本校用户总数（排除超级管理员）
      prisma.user.count({
        where: {
          schoolId: authData.schoolId,
          role: {
            not: 4, // 排除超级管理员
          },
        },
      }),
      // 本校 POI 总数
      prisma.pOI.count({
        where: {
          schoolId: authData.schoolId,
        },
      }),
      // 待审核举报数（reportCount >= 1）
      prisma.pOI.count({
        where: {
          schoolId: authData.schoolId,
          reportCount: {
            gte: 1,
          },
        },
      }),
      // 今日新增 POI 数
      (async () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return prisma.pOI.count({
          where: {
            schoolId: authData.schoolId,
            createdAt: {
              gte: today,
            },
          },
        });
      })(),
    ]);

    // 获取学校名称
    const school = await prisma.school.findUnique({
      where: { id: authData.schoolId },
      select: { name: true },
    });

    stats = {
      schoolName: school?.name || "未知学校",
      totalUsers,
      totalPOIs,
      pendingReports,
      todayPOIs,
    };
  } catch (error) {
    console.error("获取统计数据失败:", error);
    // 即使获取统计数据失败，也显示页面
  }

  return (
    <AdminLayout>
      <div className="p-6 lg:p-8">
        {/* 欢迎卡片 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            欢迎回来
          </h1>
          <p className="mt-2 text-gray-600">
            {stats?.schoolName
              ? `这里是 ${stats.schoolName} 的管理控制台`
              : "管理控制台"}
          </p>
        </div>

        {/* 统计卡片 */}
        {stats && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {/* 用户数 */}
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">本校用户数</p>
                  <p className="mt-2 text-3xl font-bold text-gray-900">
                    {stats.totalUsers}
                  </p>
                </div>
                <div className="rounded-full bg-blue-100 p-3">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </Card>

            {/* POI 总数 */}
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">POI 总数</p>
                  <p className="mt-2 text-3xl font-bold text-gray-900">
                    {stats.totalPOIs}
                  </p>
                </div>
                <div className="rounded-full bg-green-100 p-3">
                  <MapPin className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </Card>

            {/* 待审核举报数 */}
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">待审核举报</p>
                  <p className="mt-2 text-3xl font-bold text-gray-900">
                    {stats.pendingReports}
                  </p>
                </div>
                <div className="rounded-full bg-orange-100 p-3">
                  <AlertTriangle className="h-6 w-6 text-orange-600" />
                </div>
              </div>
            </Card>

            {/* 今日新增 POI */}
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">今日新增 POI</p>
                  <p className="mt-2 text-3xl font-bold text-gray-900">
                    {stats.todayPOIs}
                  </p>
                </div>
                <div className="rounded-full bg-purple-100 p-3">
                  <PlusCircle className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* 快速操作提示 */}
        <div className="mt-8 rounded-lg bg-blue-50 border border-blue-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            快速开始
          </h2>
          <p className="text-sm text-gray-600">
            使用左侧导航栏访问各个功能模块：POI 管理、团队管理、举报审核等。
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}

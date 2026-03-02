import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-server-actions";
import { getSchoolAdminStats } from "@/lib/admin-actions";
import { prisma } from "@/lib/prisma";
import { AdminLayout } from "@/components/admin-layout";
import { AdminDashboardContent } from "@/components/admin/admin-dashboard-content";

/**
 * 校级管理员中央控制台
 * 聚焦：校园活力 & 日常运营
 * Staff：简化版，侧重审核与 POI 维护
 */
export default async function AdminDashboard() {
  const authData = await requireAdmin();

  if (!authData.schoolId) {
    redirect("/super-admin");
  }

  const schoolId = authData.schoolId as string;
  const isStaff = authData.role === "STAFF";

  let stats = null;
  let schoolName = "管理控制台";
  let userNickname = "管理员";

  try {
    const [result, school, user] = await Promise.all([
      getSchoolAdminStats(schoolId),
      prisma.school.findUnique({
        where: { id: schoolId },
        select: { name: true },
      }),
      prisma.user.findUnique({
        where: { id: authData.userId },
        select: { nickname: true },
      }),
    ]);
    if (result.success && result.data) stats = result.data;
    schoolName = school?.name ?? schoolName;
    userNickname = user?.nickname ?? userNickname;
  } catch (err) {
    console.error("获取统计数据失败:", err);
  }

  const isNewSchool =
    stats &&
    stats.campusUsers === 0 &&
    stats.poiCount.official + stats.poiCount.userContributed === 0;

  return (
    <AdminLayout>
      <AdminDashboardContent
        stats={stats}
        schoolName={schoolName}
        userNickname={userNickname}
        isStaff={isStaff}
        isNewSchool={!!isNewSchool}
      />
    </AdminLayout>
  );
}

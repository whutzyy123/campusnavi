import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth-server-actions";
import { getOngoingActivities } from "@/lib/activity-actions";
import { ActivitiesListClient } from "@/components/activity/activities-list-client";
import { ActivityListSkeleton } from "@/components/activity/activity-card";
import { EmptyState } from "@/components/empty-state";
import { CalendarDays } from "lucide-react";

async function ActivitiesList() {
  const user = await getCurrentUser();
  const schoolId = user?.schoolId ?? null;

  if (!schoolId) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="请先登录"
        description="登录并选择学校后即可查看校园活动"
      />
    );
  }

  const result = await getOngoingActivities(schoolId);

  if (!result.success) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="加载失败"
        description={result.error ?? "请稍后重试"}
      />
    );
  }

  const activities = result.data ?? [];

  if (activities.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="无正在进行的活动"
        description="当前没有进行中的校园活动，一会再来看看吧"
      />
    );
  }

  return <ActivitiesListClient activities={activities} />;
}

export default function ActivitiesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-[#1A1A1B]">校园活动</h1>
      <Suspense fallback={<ActivityListSkeleton count={6} />}>
        <ActivitiesList />
      </Suspense>
    </div>
  );
}

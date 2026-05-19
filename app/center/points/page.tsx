"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { PageHeader, PageHeaderLayout } from "@/components/shared/page-header";
import { PageLoading } from "@/components/ui/page-state";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/use-auth-store";
import { dailyCheckIn, getDailyCheckInStatus } from "@/lib/actions/points";
import { notify } from "@/lib/ui/notify";
import { cn } from "@/lib/core/utils";
import { Coins, History, TrendingUp, Gift, CheckCircle2 } from "lucide-react";

function PointsContent() {
  const { currentUser, setUser } = useAuthStore();
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);

  const points = currentUser?.points ?? 0;

  const loadCheckInStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const result = await getDailyCheckInStatus();
      if (result.success && result.data) {
        setCheckedInToday(result.data.checkedInToday);
        const user = useAuthStore.getState().currentUser;
        if (user && result.data.points !== user.points) {
          setUser({ ...user, points: result.data.points });
        }
      }
    } finally {
      setStatusLoading(false);
    }
  }, [setUser]);

  useEffect(() => {
    if (!currentUser?.id) return;
    void loadCheckInStatus();
  }, [currentUser?.id, loadCheckInStatus]);

  const handleCheckIn = async () => {
    if (checkedInToday || checkingIn) return;

    setCheckingIn(true);
    try {
      const result = await dailyCheckIn();
      if (result.success && result.data) {
        setCheckedInToday(true);
        if (currentUser) {
          setUser({ ...currentUser, points: result.data.points });
        }
        notify.success(`签到成功，+${result.data.reward} 积分`);
      } else {
        if (result.error === "今日已签到") {
          setCheckedInToday(true);
        }
        notify.error(result.error ?? "签到失败");
      }
    } catch {
      notify.error("签到失败，请稍后重试");
    } finally {
      setCheckingIn(false);
    }
  };

  return (
    <PageHeaderLayout header={<PageHeader title="我的积分" backHref="/center" />}>
      {/* 积分总览卡片 */}
      <div className="rounded-xl border border-[#EDEFF1] border-t-[3px] border-t-[#FF4500] bg-white p-6 shadow-sm mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 shrink-0 rounded-xl bg-gradient-to-br from-[#FF4500] to-[#FF6B3D] flex items-center justify-center shadow-md shadow-[#FF4500]/20">
              <Coins className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#7C7C7C]">当前积分</p>
              <p className="text-3xl font-bold text-[#1A1A1B] tracking-tight">{points}</p>
            </div>
          </div>

          <Button
            type="button"
            onClick={handleCheckIn}
            loading={checkingIn}
            disabled={checkedInToday || statusLoading}
            className={cn(
              "shrink-0 rounded-xl px-5 py-2.5",
              checkedInToday &&
                "border border-[#EDEFF1] bg-[#F6F7F8] text-[#7C7C7C] hover:bg-[#F6F7F8] disabled:opacity-100"
            )}
            variant={checkedInToday ? "secondary" : "primary"}
          >
            {!checkingIn && checkedInToday ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : null}
            {checkedInToday ? "已签到" : "签到 +5"}
          </Button>
        </div>
      </div>

      {/* 积分说明 */}
      <div className="rounded-xl border border-[#EDEFF1] bg-white p-5 shadow-sm mb-6">
        <h2 className="text-base font-semibold text-[#1A1A1B] mb-3">积分获取方式</h2>
        <div className="space-y-3">
          {[
            { icon: History, label: "每日签到", desc: "每日签到可获得 5 积分，每个账号每天限一次" },
            { icon: TrendingUp, label: "活跃行为", desc: "发布留言、参与集市交易等可获得积分" },
            { icon: Gift, label: "系统奖励", desc: "完成特定任务或参与活动可获得额外积分" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FFE5DD]/60 text-[#FF4500]">
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1A1A1B]">{item.label}</p>
                  <p className="text-xs text-[#7C7C7C]">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 积分记录 — 预留区域 */}
      <div className="rounded-xl border border-[#EDEFF1] bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-[#1A1A1B] mb-3">积分记录</h2>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#F6F7F8]">
            <History className="h-6 w-6 text-[#7C7C7C]" />
          </div>
          <p className="text-sm font-medium text-[#7C7C7C]">积分记录功能即将上线</p>
          <p className="text-xs text-[#7C7C7C] mt-1">敬请期待</p>
        </div>
      </div>
    </PageHeaderLayout>
  );
}

export default function PointsPage() {
  return (
    <AuthGuard requiredRole="STUDENT">
      <Suspense fallback={<PageLoading className="flex min-h-[50vh] items-center justify-center" />}>
        <PointsContent />
      </Suspense>
    </AuthGuard>
  );
}

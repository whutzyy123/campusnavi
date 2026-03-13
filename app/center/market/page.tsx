"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { useAuthStore } from "@/store/use-auth-store";
import { useSchoolStore } from "@/store/use-school-store";
import { MarketTransactionDashboard } from "@/components/market/market-transaction-dashboard";
import { MarketSchoolList } from "@/components/market/market-school-list";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Store, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

type MarketTab = "browse" | "my";

function MarketPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser } = useAuthStore();
  const { activeSchool, inspectedSchool, schools } = useSchoolStore();

  const openItemId = searchParams.get("openItemId");
  const view = searchParams.get("view");
  const tabParam = searchParams.get("tab");

  const initialTab: MarketTab =
    tabParam === "my"
      ? "my"
      : tabParam === "browse"
        ? "browse"
        : openItemId && (view === "buying" || view === "selling")
          ? "my"
          : "browse";
  const [activeTab, setActiveTab] = useState<MarketTab>(initialTab);

  const schoolId =
    currentUser?.schoolId ??
    (inspectedSchool || activeSchool)?.id ??
    null;
  const schoolName =
    (inspectedSchool || activeSchool)?.name ??
    (schoolId ? schools.find((s) => s.id === schoolId)?.name : null) ??
    null;

  const handleTabChange = (tab: MarketTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    if (tab === "browse") {
      params.delete("openItemId");
      params.delete("view");
    }
    router.replace(`/center/market?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col">
      <div className="mx-auto w-full max-w-4xl flex-shrink-0 px-4 pt-8 pb-4 md:max-w-6xl">
        <h1 className="text-2xl font-bold text-[#1A1A1B]">生存集市</h1>
        <p className="mt-1 text-sm text-[#7C7C7C]">
          {activeTab === "browse"
            ? "浏览校园商品，发布闲置或表达意向"
            : "管理我的发布与交易"}
        </p>

        {/* 双 Tab 导航 */}
        <div className="mt-6 flex gap-1 rounded-xl bg-[#EDEFF1] p-1">
          <button
            onClick={() => handleTabChange("browse")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
              activeTab === "browse"
                ? "bg-white text-[#FF4500] shadow-sm"
                : "text-[#7C7C7C] hover:text-[#1A1A1B]"
            )}
          >
            <Store className="h-4 w-4" />
            校园集市
          </button>
          <button
            onClick={() => handleTabChange("my")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
              activeTab === "my"
                ? "bg-white text-[#FF4500] shadow-sm"
                : "text-[#7C7C7C] hover:text-[#1A1A1B]"
            )}
          >
            <ShoppingBag className="h-4 w-4" />
            我的交易
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === "browse" ? (
          <MarketSchoolList
            schoolId={schoolId}
            schoolName={schoolName}
            currentUser={currentUser}
            initialOpenItemId={activeTab === "browse" ? openItemId : null}
          />
        ) : (
          <MarketTransactionDashboard
            currentUser={currentUser}
            schoolId={currentUser?.schoolId}
            initialOpenItemId={activeTab === "my" ? openItemId : null}
            initialView={view === "buying" ? "buying" : view === "selling" ? "selling" : null}
          />
        )}
      </div>
    </div>
  );
}

export default function MarketPage() {
  return (
    <AuthGuard requiredRole="STUDENT">
      <div className="min-h-[calc(100vh-64px)] bg-[#F6F7F8]">
        <Suspense
          fallback={
            <LoadingSpinner className="flex min-h-[50vh] items-center justify-center" />
          }
        >
          <MarketPageContent />
        </Suspense>
      </div>
    </AuthGuard>
  );
}

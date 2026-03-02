"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/use-auth-store";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/badge";
import { AlertTriangle, Trash2, RotateCcw, ShoppingBag, MapPin } from "lucide-react";
import toast from "react-hot-toast";

interface ReportedPOI {
  id: string;
  name: string;
  category: string;
  description: string | null;
  lat: number;
  lng: number;
  reportCount: number;
  isOfficial: boolean;
  schoolId: string;
  schoolName: string;
  createdAt: string;
}

interface ReportedMarketItem {
  id: string;
  title: string;
  description: string;
  typeId: number;
  transactionType: { id: number; name: string; code: string } | null;
  status: string;
  reportCount: number;
  isHidden: boolean;
  expiresAt: string;
  createdAt: string;
  user: { id: string; nickname: string | null; email: string };
  category: { id: string; name: string };
  poi: { id: string; name: string };
  images: string[];
  price: number | null;
}

type AuditTab = "poi" | "market";

/**
 * 管理员举报审核后台
 * 功能：POI 举报、生存集市举报
 */
export default function AuditPage() {
  const { currentUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<AuditTab>("poi");

  const [reportedPOIs, setReportedPOIs] = useState<ReportedPOI[]>([]);
  const [marketItems, setMarketItems] = useState<ReportedMarketItem[]>([]);
  const [isLoadingPOI, setIsLoadingPOI] = useState(true);
  const [isLoadingMarket, setIsLoadingMarket] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingMarketId, setProcessingMarketId] = useState<string | null>(null);

  const schoolId = currentUser?.schoolId;

  useEffect(() => {
    const fetchReportedPOIs = async () => {
      if (!schoolId) return;
      setIsLoadingPOI(true);
      try {
        const response = await fetch(`/api/audit/reports?schoolId=${schoolId}&minReportCount=1`);
        const data = await response.json();
        if (data.success) setReportedPOIs(data.pois ?? []);
        else toast.error(data.message || "获取举报列表失败");
      } catch (e) {
        toast.error("获取举报列表失败");
      } finally {
        setIsLoadingPOI(false);
      }
    };
    fetchReportedPOIs();
  }, [schoolId]);

  useEffect(() => {
    if (activeTab !== "market" || !schoolId) return;
    const fetchMarketItems = async () => {
      setIsLoadingMarket(true);
      try {
        const response = await fetch(`/api/audit/market-items?schoolId=${schoolId}&minReportCount=1`);
        const data = await response.json();
        if (data.success) setMarketItems(data.data ?? []);
        else toast.error(data.message || "获取集市举报列表失败");
      } catch (e) {
        toast.error("获取集市举报列表失败");
      } finally {
        setIsLoadingMarket(false);
      }
    };
    fetchMarketItems();
  }, [activeTab, schoolId]);

  const handleResolvePOI = async (poiId: string, action: "ignore" | "delete") => {
    if (processingId) return;
    setProcessingId(poiId);
    try {
      const response = await fetch("/api/audit/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poiId, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "处理失败");
      toast.success(data.message || "处理成功");
      setReportedPOIs((prev) => prev.filter((p) => p.id !== poiId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "处理失败，请重试");
    } finally {
      setProcessingId(null);
    }
  };

  const handleResolveMarket = async (itemId: string, action: "pass" | "delete") => {
    if (processingMarketId) return;
    setProcessingMarketId(itemId);
    try {
      const response = await fetch("/api/audit/market-resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "处理失败");
      toast.success(data.message || "处理成功");
      setMarketItems((prev) => prev.filter((m) => m.id !== itemId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "处理失败，请重试");
    } finally {
      setProcessingMarketId(null);
    }
  };

  return (
    <AuthGuard requiredRole="ADMIN">
      <AdminLayout>
        <div className="p-6">
          <Card title="举报审核">
            <div className="mb-4 flex gap-2 border-b border-gray-200">
              <button
                onClick={() => setActiveTab("poi")}
                className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "poi"
                    ? "border-[#FF4500] text-[#FF4500]"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                }`}
              >
                <MapPin className="h-4 w-4" />
                POI 举报
              </button>
              <button
                onClick={() => setActiveTab("market")}
                className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "market"
                    ? "border-[#FF4500] text-[#FF4500]"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                }`}
              >
                <ShoppingBag className="h-4 w-4" />
                生存集市
              </button>
            </div>

            {activeTab === "poi" && (
              <>
                {isLoadingPOI ? (
                  <div className="flex justify-center py-12">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF4500] border-t-transparent" />
                  </div>
                ) : reportedPOIs.length === 0 ? (
                  <EmptyState
                    icon={AlertTriangle}
                    title="暂无举报"
                    description="当前没有需要审核的 POI 举报"
                  />
                ) : (
                  <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
                    {reportedPOIs.map((poi) => (
                      <div
                        key={poi.id}
                        className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-gray-900">{poi.name}</h3>
                          <Badge variant="error">被举报 {poi.reportCount} 次</Badge>
                          {poi.reportCount >= 3 && (
                            <Badge variant="warning">已自动隐藏</Badge>
                          )}
                        </div>
                        <div className="my-2 h-px bg-gray-100" />
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <span className="font-medium">分类：</span>
                          <Badge variant="info">{poi.category}</Badge>
                        </div>
                        {poi.description && (
                          <>
                            <div className="my-2 h-px bg-gray-100" />
                            <div className="text-sm text-gray-600">
                              <span className="font-medium">描述：</span>
                              <p className="mt-1 text-gray-500">{poi.description}</p>
                            </div>
                          </>
                        )}
                        <div className="my-2 h-px bg-gray-100" />
                        <div className="text-xs text-gray-500">
                          坐标：{poi.lat.toFixed(6)}, {poi.lng.toFixed(6)}
                        </div>
                        <div className="my-2 h-px bg-gray-100" />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleResolvePOI(poi.id, "ignore")}
                            disabled={processingId === poi.id}
                            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            {processingId === poi.id ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                            忽略举报
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`确定要永久删除 POI "${poi.name}" 吗？此操作不可恢复。`)) {
                                handleResolvePOI(poi.id, "delete");
                              }
                            }}
                            disabled={processingId === poi.id}
                            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {processingId === poi.id ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                            删除 POI
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === "market" && (
              <>
                {isLoadingMarket ? (
                  <div className="flex justify-center py-12">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF4500] border-t-transparent" />
                  </div>
                ) : marketItems.length === 0 ? (
                  <EmptyState
                    icon={ShoppingBag}
                    title="暂无举报"
                    description="当前没有需要审核的生存集市举报"
                  />
                ) : (
                  <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
                    {marketItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
                          <Badge variant="error">被举报 {item.reportCount} 次</Badge>
                          {item.isHidden && (
                            <Badge variant="warning">已自动隐藏</Badge>
                          )}
                        </div>
                        <div className="my-2 h-px bg-gray-100" />
                        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                          <Badge variant="info">{item.category?.name ?? "—"}</Badge>
                          <span>发布者：{item.user?.nickname ?? item.user?.email ?? "—"}</span>
                          <span>地点：{item.poi?.name ?? "—"}</span>
                        </div>
                        {item.description && (
                          <>
                            <div className="my-2 h-px bg-gray-100" />
                            <p className="line-clamp-2 text-sm text-gray-500">{item.description}</p>
                          </>
                        )}
                        <div className="my-2 h-px bg-gray-100" />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleResolveMarket(item.id, "pass")}
                            disabled={processingMarketId === item.id}
                            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            {processingMarketId === item.id ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                            通过
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`确定要删除商品「${item.title}」吗？此操作不可恢复，发布者将收到通知。`)) {
                                handleResolveMarket(item.id, "delete");
                              }
                            }}
                            disabled={processingMarketId === item.id}
                            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {processingMarketId === item.id ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}

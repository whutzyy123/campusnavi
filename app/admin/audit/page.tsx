"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/use-auth-store";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { AlertTriangle, X, Trash2, RotateCcw } from "lucide-react";
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

/**
 * 管理员举报审核后台
 * 功能：查看被举报的 POI，处理举报（忽略或删除）
 */
export default function AuditPage() {
  const { currentUser } = useAuthStore();
  const [reportedPOIs, setReportedPOIs] = useState<ReportedPOI[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const schoolId = currentUser?.schoolId;

  // 加载被举报的 POI 列表
  useEffect(() => {
    const fetchReportedPOIs = async () => {
      if (!schoolId) return;

      setIsLoading(true);
      try {
        const response = await fetch(`/api/audit/reports?schoolId=${schoolId}&minReportCount=1`);
        const data = await response.json();
        if (data.success) {
          setReportedPOIs(data.pois);
        } else {
          toast.error(data.message || "获取举报列表失败");
        }
      } catch (error) {
        console.error("获取举报列表失败:", error);
        toast.error("获取举报列表失败");
      } finally {
        setIsLoading(false);
      }
    };

    fetchReportedPOIs();
  }, [schoolId]);

  // 处理举报
  const handleResolve = async (poiId: string, action: "ignore" | "delete") => {
    if (processingId) return; // 防止重复点击

    setProcessingId(poiId);

    try {
      const response = await fetch("/api/audit/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          poiId,
          action,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "处理失败");
      }

      toast.success(data.message || "处理成功");
      // 刷新列表
      setReportedPOIs((prev) => prev.filter((poi) => poi.id !== poiId));
    } catch (error) {
      console.error("处理举报失败:", error);
      toast.error(error instanceof Error ? error.message : "处理失败，请重试");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <AuthGuard requiredRole="ADMIN">
      <AdminLayout>
        <div className="p-6">
          <Card title="举报审核">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
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
                    className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-900">{poi.name}</h3>
                        <Badge variant="error">被举报 {poi.reportCount} 次</Badge>
                        {poi.reportCount >= 3 && (
                          <Badge variant="warning">已自动隐藏</Badge>
                        )}
                      </div>
                      <Separator />
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="font-medium">分类：</span>
                        <Badge variant="info">{poi.category}</Badge>
                      </div>
                      {poi.description && (
                        <>
                          <Separator />
                          <div className="text-sm text-gray-600">
                            <span className="font-medium">描述：</span>
                            <p className="mt-1 text-gray-500">{poi.description}</p>
                          </div>
                        </>
                      )}
                      <Separator />
                      <div className="text-xs text-gray-500">
                        坐标：{poi.lat.toFixed(6)}, {poi.lng.toFixed(6)}
                      </div>
                      <Separator />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleResolve(poi.id, "ignore")}
                          disabled={processingId === poi.id}
                          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {processingId === poi.id ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-transparent"></div>
                          ) : (
                            <RotateCcw className="h-4 w-4" />
                          )}
                          忽略举报
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`确定要永久删除 POI "${poi.name}" 吗？此操作不可恢复。`)) {
                              handleResolve(poi.id, "delete");
                            }
                          }}
                          disabled={processingId === poi.id}
                          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {processingId === poi.id ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          删除 POI
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}


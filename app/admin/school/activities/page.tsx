"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/store/use-auth-store";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { AdminPageContainer } from "@/components/admin/admin-page-container";
import { ListPageScaffold } from "@/components/admin/list-page-scaffold";
import { EmptyState } from "@/components/empty-state";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/table";
import { StatusBadge } from "@/components/status-badge";
import { ActivityEditDialog } from "@/components/activity-edit-dialog";
import { Button } from "@/components/ui/button";
import { openConfirm } from "@/components/ui/confirm-dialog";
import { PageError, PageLoading } from "@/components/ui/page-state";
import {
  getActivitiesBySchool,
  deleteActivity,
  type ActivityWithPOI,
} from "@/lib/actions/activity";
import { getActivityStatus } from "@/types/activity";
import { formatDateTime, truncateText } from "@/lib/core/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { CalendarDays, Plus, Pencil, Trash2 } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { TableActions } from "@/components/ui/table-actions";

type FilterMode = "active" | "expired" | "all";

export default function ActivitiesManagementPage() {
  const { currentUser } = useAuthStore();
  const [activities, setActivities] = useState<ActivityWithPOI[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>("active");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);
  const [showDialog, setShowDialog] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ActivityWithPOI | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const schoolId = currentUser?.schoolId ?? "";

  const fetchActivities = useCallback(async () => {
    if (!schoolId) return;
    setIsLoading(true);
    setListError(null);
    try {
      const result = await getActivitiesBySchool();
      if (result.success && result.data) {
        setActivities(result.data);
      } else {
        setActivities([]);
        setListError(result.error ?? "获取活动列表失败");
      }
    } catch {
      setActivities([]);
      setListError("获取活动列表失败，请稍后重试");
    } finally {
      setIsLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const now = new Date();
  const filteredActivities = activities.filter((a) => {
    const endAt = new Date(a.endAt);
    if (filterMode === "active") {
      if (endAt <= now) return false;
    } else if (filterMode === "expired") {
      if (endAt > now) return false;
    }
    const q = debouncedSearch.trim().toLowerCase();
    if (q && !a.title.toLowerCase().includes(q) && !(a.description || "").toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });

  const handleCreate = () => {
    setEditingActivity(null);
    setShowDialog(true);
  };

  const handleEdit = (a: ActivityWithPOI) => {
    setEditingActivity(a);
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingActivity(null);
  };

  const handleDelete = (id: string) => {
    openConfirm({
      title: "删除活动",
      description: "确定要删除此活动吗？此操作不可恢复。",
      variant: "danger",
      confirmText: "删除",
      onConfirm: async () => {
        setActionLoading(id);
        const toastId = notify.loading("正在删除...");
        try {
          const result = await deleteActivity(id);
          if (result.success) {
            notify.success("活动已删除", { id: toastId });
            await fetchActivities();
          } else {
            notify.error(result.error ?? "删除失败", { id: toastId });
            throw new Error("delete_failed");
          }
        } catch (err) {
          if (err instanceof Error && err.message === "delete_failed") throw err;
          notify.error("删除失败", { id: toastId });
          throw err;
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  return (
    <AuthGuard requiredRole="ADMIN" requireSchoolId>
      <AdminLayout>
        <AdminPageContainer
          title="活动管理"
          description="管理本校 POI 关联的校内活动与事件"
          scrollKey={`${filterMode}-${debouncedSearch}`}
          headerActions={
            <Button type="button" onClick={handleCreate}>
              <Plus className="h-4 w-4" />
              新建活动
            </Button>
          }
        >
          <ListPageScaffold
            filters={
              <AdminFilterBar
                search={{
                  value: searchInput,
                  onChange: setSearchInput,
                  placeholder: "搜索活动标题或描述...",
                }}
                filters={[
                  {
                    value: filterMode,
                    onChange: (v) => setFilterMode(v as FilterMode),
                    label: "状态",
                    options: [
                      { value: "active", label: "进行中" },
                      { value: "expired", label: "已过期" },
                      { value: "all", label: "全部" },
                    ],
                  },
                ]}
              />
            }
          >
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-white shadow">
              <div className="custom-scrollbar h-full min-h-0 overflow-y-auto p-6">
                {listError ? (
                  <PageError description={listError} onRetry={fetchActivities} />
                ) : isLoading ? (
                  <PageLoading className="flex justify-center py-12" />
                ) : filteredActivities.length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title={activities.length === 0 ? "暂无活动" : "没有符合条件的活动"}
                    description={
                      activities.length === 0
                        ? "点击「新建活动」创建第一个活动"
                        : "尝试切换筛选条件"
                    }
                    action={
                      activities.length === 0
                        ? { label: "新建活动", onClick: handleCreate }
                        : undefined
                    }
                  />
                ) : (
                  <div className="w-full min-w-0 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[140px]">标题</TableHead>
                          <TableHead className="min-w-[120px]">关联 POI</TableHead>
                          <TableHead responsiveHide="sm" className="min-w-[90px]">
                            状态
                          </TableHead>
                          <TableHead responsiveHide="lg" className="min-w-[120px]">
                            开始时间
                          </TableHead>
                          <TableHead responsiveHide="lg" className="min-w-[120px]">
                            结束时间
                          </TableHead>
                          <TableHead className="min-w-[80px] text-right">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredActivities.map((a) => {
                          const isExpired = new Date(a.endAt) <= now;
                          const activityStatus = getActivityStatus(a, now);
                          return (
                            <TableRow key={a.id} className={isExpired ? "bg-gray-50" : ""}>
                              <TableCell className="max-w-[200px]">
                                <span
                                  className="block truncate font-medium text-gray-900"
                                  title={a.title}
                                >
                                  {truncateText(a.title, 40)}
                                </span>
                              </TableCell>
                              <TableCell className="max-w-[160px]">
                                <span
                                  className="block truncate text-sm text-gray-700"
                                  title={a.poi.name}
                                >
                                  {a.poi.name}
                                </span>
                              </TableCell>
                              <TableCell responsiveHide="sm">
                                <StatusBadge
                                  domain="activity"
                                  status={
                                    activityStatus === "ONGOING"
                                      ? "ongoing"
                                      : activityStatus === "UPCOMING"
                                        ? "upcoming"
                                        : "expired"
                                  }
                                />
                              </TableCell>
                              <TableCell className="text-sm text-gray-600" responsiveHide="lg">
                                {formatDateTime(a.startAt)}
                              </TableCell>
                              <TableCell className="text-sm text-gray-600" responsiveHide="lg">
                                {formatDateTime(a.endAt)}
                              </TableCell>
                              <TableCell
                                className="text-right"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <TableActions
                                  disabled={actionLoading === a.id}
                                  items={[
                                    {
                                      label: "编辑/详情",
                                      icon: Pencil,
                                      onClick: () => handleEdit(a),
                                    },
                                    "separator",
                                    {
                                      label: "删除",
                                      icon: Trash2,
                                      onClick: () => handleDelete(a.id),
                                      variant: "destructive",
                                    },
                                  ]}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          </ListPageScaffold>
        </AdminPageContainer>

        <ActivityEditDialog
          activity={editingActivity}
          schoolId={schoolId}
          isOpen={showDialog}
          onClose={handleCloseDialog}
          onSave={fetchActivities}
        />
      </AdminLayout>
    </AuthGuard>
  );
}

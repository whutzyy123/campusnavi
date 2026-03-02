"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/use-auth-store";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/card";
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
import {
  getActivitiesBySchool,
  deleteActivity,
  type ActivityItem,
} from "@/lib/activity-actions";
import { formatDateTime, truncateText } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { CalendarDays, Plus, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { TableActions } from "@/components/ui/table-actions";

type ActivityListItem = ActivityItem & { poiName: string };

type FilterMode = "active" | "expired" | "all";

export default function ActivitiesManagementPage() {
  const { currentUser } = useAuthStore();
  const [activities, setActivities] = useState<ActivityListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<FilterMode>("active");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);
  const [showDialog, setShowDialog] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ActivityListItem | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const schoolId = currentUser?.schoolId ?? "";

  const fetchActivities = async () => {
    setIsLoading(true);
    try {
      const result = await getActivitiesBySchool();
      if (result.success && result.data) {
        setActivities(result.data as ActivityListItem[]);
      } else {
        toast.error(result.error ?? "获取活动列表失败");
      }
    } catch (err) {
      toast.error("获取活动列表失败");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (schoolId) {
      fetchActivities();
    }
  }, [schoolId]);

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

  const handleEdit = (a: ActivityListItem) => {
    setEditingActivity(a);
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingActivity(null);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("确定要删除此活动吗？此操作不可恢复。")) return;

    setActionLoading(id);
    const toastId = toast.loading("正在删除...");
    try {
      const result = await deleteActivity(id);
      if (result.success) {
        toast.success("活动已删除", { id: toastId });
        await fetchActivities();
      } else {
        toast.error(result.error ?? "删除失败", { id: toastId });
      }
    } catch (err) {
      toast.error("删除失败", { id: toastId });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <AuthGuard requiredRole="ADMIN" requireSchoolId>
      <AdminLayout>
        <div className="p-4 lg:p-6">
          <Card
            title="活动管理"
            description="管理本校 POI 关联的校内活动与事件"
            action={
              <button
                onClick={handleCreate}
                className="flex items-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                新建活动
              </button>
            }
          >
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
              className="mb-4"
            />

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF4500] border-t-transparent" />
              </div>
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
                      <TableHead responsiveHide="sm" className="min-w-[90px]">状态</TableHead>
                      <TableHead responsiveHide="lg" className="min-w-[120px]">开始时间</TableHead>
                      <TableHead responsiveHide="lg" className="min-w-[120px]">结束时间</TableHead>
                      <TableHead className="min-w-[80px] text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredActivities.map((a) => {
                      const isExpired = new Date(a.endAt) <= now;
                      return (
                        <TableRow
                          key={a.id}
                          className={isExpired ? "bg-gray-50" : ""}
                        >
                          <TableCell className="max-w-[200px]">
                            <span className="block truncate font-medium text-gray-900" title={a.title}>
                              {truncateText(a.title, 40)}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[160px]">
                            <span className="block truncate text-sm text-gray-700" title={a.poiName}>
                              {a.poiName}
                            </span>
                          </TableCell>
                          <TableCell responsiveHide="sm">
                            <StatusBadge domain="activity" status={isExpired ? "expired" : "active"} />
                          </TableCell>
                          <TableCell className="text-sm text-gray-600" responsiveHide="lg">
                            {formatDateTime(a.startAt)}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600" responsiveHide="lg">
                            {formatDateTime(a.endAt)}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <TableActions
                              disabled={actionLoading === a.id}
                              items={[
                                { label: "编辑/详情", icon: Pencil, onClick: () => handleEdit(a) },
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
          </Card>

          <ActivityEditDialog
            activity={editingActivity}
            schoolId={schoolId}
            isOpen={showDialog}
            onClose={handleCloseDialog}
            onSave={fetchActivities}
          />
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}

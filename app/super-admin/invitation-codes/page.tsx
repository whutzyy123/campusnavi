"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useAuthStore } from "@/store/use-auth-store";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import {
  Copy,
  Plus,
  Filter,
  Play,
  CalendarPlus,
  Ban,
  RotateCcw,
  X,
} from "lucide-react";
import { formatDateTimeDisplay } from "@/lib/utils";
import { TableActions } from "@/components/ui/table-actions";
import toast from "react-hot-toast";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/table";
import { GenerateCodeModal } from "@/components/invitation-code-generate-modal";
import {
  listInvitationCodes,
  toggleCodeStatus,
  toggleInvitationCodeStatus,
  deleteCode,
  extendInvitationCode,
  type InvitationCodeListItem,
} from "@/lib/invitation-actions";

interface School {
  id: string;
  name: string;
  schoolCode: string;
}

const EXTEND_DAYS_OPTIONS = [7, 30, 90];

function ExtendValidityDialog({
  codeId,
  onClose,
  onSuccess,
  disabled,
}: {
  codeId: string;
  onClose: () => void;
  onSuccess: (days: number) => Promise<void>;
  disabled?: boolean;
}) {
  const [selectedDays, setSelectedDays] = useState(7);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onSuccess(selectedDays);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-modal-overlay flex items-center justify-center bg-black/50">
      <div className="modal-container max-w-sm">
        <div className="modal-header flex items-center justify-between px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">延长有效期</h3>
          <button
            onClick={onClose}
            disabled={disabled || loading}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="modal-body px-6 py-4">
          <p className="mb-4 text-sm text-gray-600">选择要延长的天数：</p>
          <div className="flex gap-2">
            {EXTEND_DAYS_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDays(d)}
                className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  selectedDays === d
                    ? "border-[#FF4500] bg-[#FF4500]/10 text-[#FF4500]"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                {d} 天
              </button>
            ))}
          </div>
        </div>
        <div className="modal-footer flex gap-3 p-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 rounded-lg bg-[#FF4500] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#FF4500]/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "延长中..." : "确认延长"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 超级管理员后台 - 邀请码管理页面
 * 功能：查看所有邀请码、生成邀请码、筛选、激活/停用、删除
 */
export default function InvitationCodesManagementPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <InvitationCodesManagementPageContent />
    </Suspense>
  );
}

function InvitationCodesManagementPageContent() {
  const searchParams = useSearchParams();
  const { currentUser } = useAuthStore();
  const [invitationCodes, setInvitationCodes] = useState<InvitationCodeListItem[]>([]);
  const [filteredCodes, setFilteredCodes] = useState<InvitationCodeListItem[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [filterSchool, setFilterSchool] = useState(() => searchParams.get("school") || "");
  const [filterType, setFilterType] = useState(() => searchParams.get("type") || "");
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get("status") || "");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [extendDialog, setExtendDialog] = useState<{ open: boolean; codeId: string | null }>({ open: false, codeId: null });

  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";

  // 同步筛选器到 URL，便于分享/书签
  useEffect(() => {
    const params = new URLSearchParams();
    if (filterSchool) params.set("school", filterSchool);
    if (filterType) params.set("type", filterType);
    if (filterStatus) params.set("status", filterStatus);
    const qs = params.toString();
    const newUrl = qs ? `?${qs}` : window.location.pathname;
    if (window.location.search !== (qs ? `?${qs}` : "")) {
      window.history.replaceState(null, "", newUrl);
    }
  }, [filterSchool, filterType, filterStatus]);

  // 加载学校列表
  useEffect(() => {
    const fetchSchools = async () => {
      try {
        const res = await fetch("/api/schools");
        const data = await res.json();
        if (data.success) setSchools(data.schools);
      } catch (error) {
        console.error("获取学校列表失败:", error);
      }
    };
    fetchSchools();
  }, []);

  // 加载邀请码列表
  const fetchCodes = useCallback(async () => {
    try {
      // "已过期" 需请求 ACTIVE 再在客户端筛选
      const apiStatus =
        filterStatus === "EXPIRED"
          ? ("ACTIVE" as const)
          : (filterStatus as "ACTIVE" | "USED" | "DISABLED" | "DEACTIVATED") || undefined;

      const result = await listInvitationCodes({
        schoolId: filterSchool || undefined,
        type: (filterType as "ADMIN" | "STAFF") || undefined,
        status: apiStatus,
      });
      if (result.success && result.data) {
        setInvitationCodes(result.data);
        const filtered =
          filterStatus === "EXPIRED"
            ? result.data.filter(
                (ic) =>
                  ic.status === "ACTIVE" &&
                  ic.expiresAt &&
                  new Date(ic.expiresAt) < new Date()
              )
            : result.data;
        setFilteredCodes(filtered);
      }
    } catch (error) {
      console.error("获取邀请码列表失败:", error);
    }
  }, [filterSchool, filterType, filterStatus]);

  useEffect(() => {
    fetchCodes();
  }, [fetchCodes]);

  const handleToggleStatus = async (codeId: string, newStatus: "ACTIVE" | "DISABLED" | "DEACTIVATED" | "USED") => {
    setActionLoading(codeId);
    const loadingMsg =
      newStatus === "ACTIVE" ? "正在激活..." : newStatus === "DEACTIVATED" ? "正在停用..." : newStatus === "USED" ? "正在启用..." : "正在停用...";
    const toastId = toast.loading(loadingMsg);
    try {
      const result =
        newStatus === "DEACTIVATED" || newStatus === "USED"
          ? await toggleInvitationCodeStatus(codeId)
          : await toggleCodeStatus(codeId, newStatus);
      if (result.success) {
        toast.success(result.message ?? "操作成功", { id: toastId });
        await fetchCodes();
      } else {
        toast.error(result.message || "操作失败", { id: toastId });
      }
    } catch (error) {
      toast.error("操作失败", { id: toastId });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (codeId: string) => {
    if (!window.confirm("确定要撤销此邀请码吗？撤销后将从系统中永久删除，不可恢复。")) return;

    setActionLoading(codeId);
    const toastId = toast.loading("正在删除...");
    try {
      const result = await deleteCode(codeId);
      if (result.success) {
        toast.success(result.message ?? "操作成功", { id: toastId });
        await fetchCodes();
      } else {
        toast.error(result.message || "删除失败", { id: toastId });
      }
    } catch (error) {
      toast.error("删除失败", { id: toastId });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("邀请码已复制到剪贴板");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  const handleExtend = async (codeId: string, days: number = 7) => {
    setActionLoading(codeId);
    const toastId = toast.loading("正在延长有效期...");
    try {
      const result = await extendInvitationCode(codeId, days);
      if (result.success) {
        toast.success(result.message ?? "操作成功", { id: toastId });
        await fetchCodes();
      } else {
        toast.error(result.message || "延长失败", { id: toastId });
      }
    } catch {
      toast.error("延长失败", { id: toastId });
    } finally {
      setActionLoading(null);
    }
  };

  if (!isSuperAdmin) {
    return (
      <AuthGuard requiredRole="SUPER_ADMIN">
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-gray-600">加载中...</p>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard requiredRole="SUPER_ADMIN">
      <AdminLayout>
        <div className="p-6">
          <Card
            title="邀请码管理"
            action={
              <button
                onClick={() => setShowGenerateModal(true)}
                className="flex items-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#FF4500]/90"
              >
                <Plus className="h-4 w-4" />
                生成邀请码
              </button>
            }
          >
            {/* 筛选器 */}
            <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">筛选：</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">学校：</label>
                <select
                  value={filterSchool}
                  onChange={(e) => setFilterSchool(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                >
                  <option value="">全部</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">类型：</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                >
                  <option value="">全部</option>
                  <option value="ADMIN">校级管理员</option>
                  <option value="STAFF">工作人员</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">状态：</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                >
                  <option value="">全部</option>
                  <option value="ACTIVE">未使用</option>
                  <option value="EXPIRED">已过期</option>
                  <option value="DISABLED">已撤销</option>
                  <option value="USED">已使用</option>
                  <option value="DEACTIVATED">已停用(关联用户)</option>
                </select>
              </div>
            </div>

            {filteredCodes.length === 0 ? (
              <EmptyState
                icon={Copy}
                title="暂无邀请码"
                description={
                  invitationCodes.length === 0
                    ? "还没有生成任何邀请码"
                    : "没有符合条件的邀请码"
                }
              />
            ) : (
              <div className="w-full overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>邀请码</TableHead>
                      <TableHead className="w-[90px]">类型</TableHead>
                      <TableHead>目标学校</TableHead>
                      <TableHead className="w-[80px]">状态</TableHead>
                      <TableHead className="w-[140px]">有效期至</TableHead>
                      <TableHead className="w-[90px]">创建人</TableHead>
                      <TableHead className="max-w-[180px]">使用人</TableHead>
                      <TableHead className="w-[100px]">创建日期</TableHead>
                      <TableHead className="w-[72px] text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCodes.map((ic) => (
                      <TableRow key={ic.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="rounded bg-gray-100 px-2 py-1 text-xs font-mono font-medium text-gray-900">
                              {ic.code}
                            </code>
                            <button
                              onClick={() => handleCopyCode(ic.code)}
                              className="text-gray-400 hover:text-gray-600"
                              title="复制"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge domain="user" status={ic.type} />
                        </TableCell>
                        <TableCell className="max-w-[160px] text-sm text-gray-700">
                          <div className="truncate" title={ic.schoolName}>
                            {ic.schoolName}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge domain="invitation" status={ic.status} />
                        </TableCell>
                        <TableCell className="text-sm">
                          {ic.expiresAt ? (
                            (() => {
                              const expired =
                                ic.status === "ACTIVE" &&
                                new Date(ic.expiresAt) < new Date();
                              return (
                                <span className={expired ? "text-red-600" : "text-gray-600"}>
                                  {formatDateTimeDisplay(ic.expiresAt)}
                                  {expired && (
                                    <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                                      已过期
                                    </span>
                                  )}
                                </span>
                              );
                            })()
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">{ic.createdByName}</TableCell>
                        <TableCell className="max-w-[180px] text-sm text-gray-600">
                          <div className="truncate" title={ic.usedByEmail || "-"}>
                            {ic.usedByEmail || "-"}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {new Date(ic.createdAt).toLocaleDateString("zh-CN", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          <TableActions
                            disabled={actionLoading === ic.id}
                            items={(() => {
                              if (ic.status === "USED") {
                                if (!ic.usedByUserId) {
                                  return [{ label: "无操作", onClick: () => {}, disabled: true }];
                                }
                                return [
                                  {
                                    label: "停用",
                                    icon: Ban,
                                    onClick: () => handleToggleStatus(ic.id, "DEACTIVATED"),
                                    variant: "destructive",
                                  },
                                ];
                              }
                              if (ic.status === "DEACTIVATED") {
                                return [
                                  {
                                    label: "启用",
                                    icon: RotateCcw,
                                    onClick: () => handleToggleStatus(ic.id, "USED"),
                                  },
                                ];
                              }
                              if (ic.status === "ACTIVE") {
                                return [
                                  {
                                    label: "延长",
                                    icon: CalendarPlus,
                                    onClick: () => setExtendDialog({ open: true, codeId: ic.id }),
                                  },
                                  "separator",
                                  {
                                    label: "撤销",
                                    icon: Ban,
                                    onClick: () => handleDelete(ic.id),
                                    variant: "destructive",
                                  },
                                ];
                              }
                              if (ic.status === "DISABLED") {
                                return [
                                  {
                                    label: "激活",
                                    icon: Play,
                                    onClick: () => handleToggleStatus(ic.id, "ACTIVE"),
                                  },
                                ];
                              }
                              return [];
                            })()}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          <GenerateCodeModal
            isOpen={showGenerateModal}
            onClose={() => setShowGenerateModal(false)}
            schools={schools}
            onSuccess={fetchCodes}
            allowDurationChoice
          />

          {/* 延长有效期弹窗 */}
          {extendDialog.open && extendDialog.codeId && (
            <ExtendValidityDialog
              codeId={extendDialog.codeId}
              onClose={() => setExtendDialog({ open: false, codeId: null })}
              onSuccess={async (days) => {
                await handleExtend(extendDialog.codeId!, days);
                setExtendDialog({ open: false, codeId: null });
              }}
              disabled={!!actionLoading}
            />
          )}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}

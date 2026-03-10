"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useAuthStore } from "@/store/use-auth-store";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import {
  Users,
  Plus,
  Copy,
  UserCheck,
  Play,
  Ban,
  RotateCcw,
  CalendarPlus,
  X,
  Info,
} from "lucide-react";
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
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import { formatDate, formatDateTimeDisplay } from "@/lib/utils";
import { GenerateCodeModal } from "@/components/invitation-code-generate-modal";
import {
  listInvitationCodes,
  toggleCodeStatus,
  toggleInvitationCodeStatus,
  deleteCode,
  extendInvitationCode,
  type InvitationCodeListItem,
} from "@/lib/invitation-actions";
import { getSchoolUsers } from "@/lib/user-actions";
import { getSchoolsList } from "@/lib/school-actions";

interface StaffMember {
  id: string;
  email: string;
  nickname: string;
  role: number;
  createdAt: string;
}

interface School {
  id: string;
  name: string;
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
 * 校级管理后台 - 团队管理模块
 * 功能：查看本校 STAFF 列表、生成校内邀请码
 */
export default function TeamManagementPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <TeamManagementPageContent />
    </Suspense>
  );
}

function TeamManagementPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser } = useAuthStore();
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [invitationCodes, setInvitationCodes] = useState<InvitationCodeListItem[]>([]);
  const [filteredInvitationCodes, setFilteredInvitationCodes] = useState<InvitationCodeListItem[]>([]);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [schools, setSchools] = useState<School[]>([]);
  const [activeTab, setActiveTab] = useState<"staff" | "invitations">(
    (searchParams.get("tab") as "staff" | "invitations") || "staff"
  );
  const [filterStatus, setFilterStatus] = useState(searchParams.get("status") || "");
  const [filterType, setFilterType] = useState(searchParams.get("type") || "");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [extendDialog, setExtendDialog] = useState<{ open: boolean; codeId: string | null }>({ open: false, codeId: null });

  const schoolId = currentUser?.schoolId;

  // 从 URL 初始化 tab
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "staff" || tab === "invitations") setActiveTab(tab);
  }, [searchParams]);

  // 同步 tab 和筛选器到 URL
  const updateUrl = (tab: string, type?: string, status?: string) => {
    const params = new URLSearchParams();
    params.set("tab", tab);
    if (type) params.set("type", type);
    if (status) params.set("status", status);
    router.replace(`/admin/team?${params.toString()}`, { scroll: false });
  };

  // 加载 STAFF 列表
  useEffect(() => {
    if (!schoolId) return;

    const fetchStaff = async () => {
      try {
        const result = await getSchoolUsers({ role: "STAFF" });
        if (result.success && result.data) {
          setStaffMembers(
            result.data.map((u) => ({
              id: u.id,
              email: u.email ?? "",
              nickname: u.nickname ?? "",
              role: u.roleNumber,
              createdAt: u.createdAt,
            }))
          );
        }
      } catch (error) {
        console.error("获取 STAFF 列表失败:", error);
      }
    };

    fetchStaff();
  }, [schoolId]);

  // 加载学校列表（用于 GenerateCodeModal）
  useEffect(() => {
    if (!schoolId) return;
    const fetchSchools = async () => {
      try {
        const result = await getSchoolsList();
        if (result.success && result.data) {
          const all = result.data.map((s) => ({ id: s.id, name: s.name }));
          setSchools(all.filter((s) => s.id === schoolId));
        }
      } catch (error) {
        console.error("获取学校列表失败:", error);
      }
    };
    fetchSchools();
  }, [schoolId]);

  // 加载邀请码列表
  const fetchInvitationCodes = useCallback(async () => {
    if (!schoolId) return;

    try {
      const apiStatus =
        filterStatus === "EXPIRED"
          ? ("ACTIVE" as const)
          : (filterStatus as "ACTIVE" | "USED" | "DISABLED" | "DEACTIVATED") || undefined;

      const result = await listInvitationCodes({
        schoolId,
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
        setFilteredInvitationCodes(filtered);
      }
    } catch (error) {
      console.error("获取邀请码列表失败:", error);
    }
  }, [schoolId, filterType, filterStatus]);

  useEffect(() => {
    fetchInvitationCodes();
  }, [fetchInvitationCodes]);

  const handleCopyInvitationCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("邀请码已复制到剪贴板");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

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
        await fetchInvitationCodes();
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
        await fetchInvitationCodes();
      } else {
        toast.error(result.message || "删除失败", { id: toastId });
      }
    } catch (error) {
      toast.error("删除失败", { id: toastId });
    } finally {
      setActionLoading(null);
    }
  };

  const handleExtend = async (codeId: string, days: number = 7) => {
    setActionLoading(codeId);
    const toastId = toast.loading("正在延长有效期...");
    try {
      const result = await extendInvitationCode(codeId, days);
      if (result.success) {
        toast.success(result.message ?? "操作成功", { id: toastId });
        await fetchInvitationCodes();
      } else {
        toast.error(result.message || "延长失败", { id: toastId });
      }
    } catch {
      toast.error("延长失败", { id: toastId });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <AdminLayout>
      <div className="p-6">
        {/* 标签页 */}
        <div className="mb-6 flex gap-4 border-b border-gray-200">
          <button
            onClick={() => {
              setActiveTab("staff");
              updateUrl("staff");
            }}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "staff"
                ? "border-b-2 border-[#FF4500] text-[#FF4500]"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              工作人员
            </div>
          </button>
          <button
            onClick={() => {
              setActiveTab("invitations");
              updateUrl("invitations", filterType || undefined, filterStatus || undefined);
            }}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "invitations"
                ? "border-b-2 border-[#FF4500] text-[#FF4500]"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              邀请码管理
            </div>
          </button>
        </div>

        {/* 工作人员列表 */}
        {activeTab === "staff" && (
          <Card
            title="校内工作人员列表"
            action={
              <button
                onClick={() => setShowGenerateModal(true)}
                className="flex items-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                生成邀请码
              </button>
            }
          >
            {staffMembers.length === 0 ? (
              <EmptyState
                icon={Users}
                title="暂无工作人员"
                description="点击「生成邀请码」邀请工作人员加入"
                action={{
                  label: "生成邀请码",
                  onClick: () => setShowGenerateModal(true),
                }}
              />
            ) : (
              <div className="divide-y divide-gray-200">
                {staffMembers.map((staff) => (
                  <div
                    key={staff.id}
                    className="flex items-center justify-between py-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFE5DD]">
                        <Users className="h-5 w-5 text-[#FF4500]" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">
                          {staff.nickname}
                        </div>
                        <div className="text-sm text-gray-500">
                          {staff.email}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(staff.createdAt).toLocaleDateString("zh-CN")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* 邀请码列表 */}
        {activeTab === "invitations" && (
          <Card
            title="邀请码管理"
            action={
              <button
                onClick={() => setShowGenerateModal(true)}
                className="flex items-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                生成新邀请码
              </button>
            }
          >
            {/* 提示：已过期邀请码说明 */}
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                已过期的邀请码无法用于注册，需先点击操作菜单中的「延长」恢复有效期。已使用的邀请码状态不受过期时间影响。
              </span>
            </div>

            {/* 筛选器 */}
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <AdminFilterBar
                filters={[
                  {
                    label: "类型",
                    value: filterType,
                    onChange: (v) => {
                      setFilterType(v);
                      updateUrl("invitations", v || undefined, filterStatus || undefined);
                    },
                    options: [
                      { value: "", label: "全部" },
                      { value: "ADMIN", label: "校级管理员" },
                      { value: "STAFF", label: "工作人员" },
                    ],
                  },
                  {
                    label: "状态",
                    value: filterStatus,
                    onChange: (v) => {
                      setFilterStatus(v);
                      updateUrl("invitations", filterType || undefined, v || undefined);
                    },
                    options: [
                      { value: "", label: "全部" },
                      { value: "ACTIVE", label: "未使用" },
                      { value: "EXPIRED", label: "已过期" },
                      { value: "DISABLED", label: "已撤销" },
                      { value: "USED", label: "已使用" },
                      { value: "DEACTIVATED", label: "已停用(关联用户)" },
                    ],
                  },
                ]}
              />
            </div>

            {filteredInvitationCodes.length === 0 ? (
              <EmptyState
                icon={UserCheck}
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
                      <TableHead className="w-[90px]" responsiveHide="sm">类型</TableHead>
                      <TableHead responsiveHide="sm">目标学校</TableHead>
                      <TableHead className="w-[80px]" responsiveHide="sm">状态</TableHead>
                      <TableHead className="w-[140px]" responsiveHide="sm">
                        <span className="inline-flex items-center gap-1">
                          有效期至
                          <span
                            className="cursor-help text-gray-400"
                            title="已过期的邀请码无法用于注册，需先点击「延长」恢复有效期"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </span>
                        </span>
                      </TableHead>
                      <TableHead className="w-[90px]" responsiveHide="sm">创建人</TableHead>
                      <TableHead className="max-w-[180px]" responsiveHide="sm">使用人</TableHead>
                      <TableHead className="w-[100px]" responsiveHide="lg">创建日期</TableHead>
                      <TableHead className="w-[72px] text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvitationCodes.map((ic) => (
                      <TableRow key={ic.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="rounded bg-gray-100 px-2 py-1 text-xs font-mono font-medium text-gray-900">
                              {ic.code}
                            </code>
                            <button
                              onClick={() => handleCopyInvitationCode(ic.code)}
                              className="text-gray-400 hover:text-gray-600"
                              title="复制"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell responsiveHide="sm">
                          <StatusBadge domain="user" status={ic.type} />
                        </TableCell>
                        <TableCell className="max-w-[160px] text-sm text-gray-700" responsiveHide="sm">
                          <div className="truncate" title={ic.schoolName}>
                            {ic.schoolName}
                          </div>
                        </TableCell>
                        <TableCell responsiveHide="sm">
                          <StatusBadge domain="invitation" status={ic.status} />
                        </TableCell>
                        <TableCell className="text-sm" responsiveHide="sm">
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
                        <TableCell className="text-sm text-gray-600" responsiveHide="sm">{ic.createdByName}</TableCell>
                        <TableCell className="max-w-[180px] text-sm text-gray-600" responsiveHide="sm">
                          <div className="truncate" title={ic.usedByEmail || "-"}>
                            {ic.usedByEmail || "-"}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500" responsiveHide="lg">
                          {formatDate(ic.createdAt)}
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
        )}

        <GenerateCodeModal
          isOpen={showGenerateModal}
          onClose={() => setShowGenerateModal(false)}
          schools={schools.length > 0 ? schools : schoolId ? [{ id: schoolId, name: "当前学校" }] : []}
          fixedSchoolId={schoolId ?? undefined}
          staffOnly
          onSuccess={fetchInvitationCodes}
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
  );
}
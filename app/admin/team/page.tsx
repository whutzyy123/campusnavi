"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/use-auth-store";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import {
  Users,
  Plus,
  Copy,
  Check,
  X,
  UserCheck,
  MoreVertical,
  Clock,
  Ban,
  Filter,
} from "lucide-react";
import toast from "react-hot-toast";
import { Badge } from "@/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/table";

interface StaffMember {
  id: string;
  email: string;
  nickname: string;
  role: number;
  createdAt: string;
}

interface InvitationCode {
  id: string;
  code: string;
  role: number;
  roleName: string;
  schoolId: string;
  schoolName: string;
  issuerId: string | null;
  issuerName: string;
  isUsed: boolean;
  usedBy: string | null;
  usedByName: string | null;
  usedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  status: "unused" | "used" | "expired";
}

/**
 * 校级管理后台 - 团队管理模块
 * 功能：查看本校 STAFF 列表、生成校内邀请码
 */
export default function TeamManagementPage() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const router = useRouter();
  const { currentUser } = useAuthStore();
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [invitationCodes, setInvitationCodes] = useState<InvitationCode[]>([]);
  const [filteredInvitationCodes, setFilteredInvitationCodes] = useState<
    InvitationCode[]
  >([]);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"staff" | "invitations">("staff");

  // 邀请码筛选和操作状态
  const [invitationFilterStatus, setInvitationFilterStatus] = useState<string>(
    "all"
  );
  const [invitationActionMenuOpen, setInvitationActionMenuOpen] = useState<
    string | null
  >(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isExtending, setIsExtending] = useState(false);

  const schoolId = currentUser?.schoolId;

  // #region agent log
  useEffect(() => {
    fetch("http://127.0.0.1:7242/ingest/b472256d-1378-49e8-89eb-a68106acb0f4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "team-page-initial",
        hypothesisId: "H1",
        location: "app/admin/team/page.tsx:initial-state",
        message: "TeamManagementPage mounted with current user context",
        data: {
          hasUser: !!currentUser,
          role: currentUser?.role ?? null,
          schoolId: schoolId ?? null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }, [currentUser, schoolId]); // 将 fetch 放入 useEffect 以避免渲染副作用
  // #endregion agent log

  // 加载 STAFF 列表
  useEffect(() => {
    if (!schoolId) return;

    const fetchStaff = async () => {
      try {
        const response = await fetch(`/api/users?schoolId=${schoolId}&role=3`);
        const data = await response.json();
        if (data.success) {
          setStaffMembers(data.users);
        }
      } catch (error) {
        console.error("获取 STAFF 列表失败:", error);
      }
    };

    fetchStaff();
  }, [schoolId]);

  // 加载邀请码列表
  const fetchInvitationCodes = async () => {
    if (!schoolId || !currentUser?.id) return;

    try {
      const response = await fetch(
        `/api/invitation-codes?schoolId=${schoolId}&issuerId=${currentUser.id}`
      );
      const data = await response.json();
      if (data.success) {
        setInvitationCodes(data.invitationCodes);
        setFilteredInvitationCodes(data.invitationCodes);
      }
    } catch (error) {
      console.error("获取邀请码列表失败:", error);
    }
  };

  useEffect(() => {
    fetchInvitationCodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, currentUser?.id]);

  // 筛选邀请码
  useEffect(() => {
    let filtered = [...invitationCodes];
    if (invitationFilterStatus !== "all") {
      filtered = filtered.filter((ic) => ic.status === invitationFilterStatus);
    }
    setFilteredInvitationCodes(filtered);
  }, [invitationCodes, invitationFilterStatus]);

  // 生成邀请码
  const handleGenerateCode = async () => {
    if (!schoolId || !currentUser) {
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch("/api/invitation-codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schoolId,
          role: 3, // STAFF (校内工作人员)
          issuerId: currentUser.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "生成失败");
      }

      setGeneratedCode(data.invitationCode.code);
      toast.success("邀请码生成成功！");
      await fetchInvitationCodes();
    } catch (error) {
      console.error("生成邀请码失败:", error);
      toast.error(error instanceof Error ? error.message : "生成失败");
    } finally {
      setIsGenerating(false);
    }
  };

  // 复制邀请码
  const handleCopyCode = () => {
    if (generatedCode) {
      navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      toast.success("邀请码已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 复制邀请码（表格中的）
  const handleCopyInvitationCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("邀请码已复制到剪贴板");
  };

  // 作废邀请码
  const handleRevokeInvitationCode = async (invitationCodeId: string) => {
    if (!currentUser) return;

    setIsRevoking(true);
    const toastId = toast.loading("正在作废邀请码...");

    try {
      const response = await fetch(
        `/api/invitation-codes/${invitationCodeId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: currentUser.id }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "作废失败");
      }

      toast.success("邀请码已作废", { id: toastId });
      setInvitationActionMenuOpen(null);
      await fetchInvitationCodes();
    } catch (error) {
      console.error("作废邀请码失败:", error);
      toast.error((error as Error).message || "作废失败", { id: toastId });
    } finally {
      setIsRevoking(false);
    }
  };

  // 延长邀请码有效期
  const handleExtendInvitationCode = async (invitationCodeId: string) => {
    if (!currentUser) {
      return;
    }

    setIsExtending(true);
    const toastId = toast.loading("正在延长有效期...");

    try {
      const response = await fetch(
        `/api/invitation-codes/${invitationCodeId}/extend`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: currentUser.id }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "延长失败");
      }

      toast.success("有效期已延长7天", { id: toastId });
      setInvitationActionMenuOpen(null);
      await fetchInvitationCodes();
    } catch (error) {
      console.error("延长有效期失败:", error);
      toast.error((error as Error).message || "延长失败", { id: toastId });
    } finally {
      setIsExtending(false);
    }
  };

  return (
    <AdminLayout>
      <div className="p-6">
        {/* 标签页 */}
        <div className="mb-6 flex gap-4 border-b border-gray-200">
          <button
            onClick={() => setActiveTab("staff")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "staff"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              工作人员
            </div>
          </button>
          <button
            onClick={() => setActiveTab("invitations")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "invitations"
                ? "border-b-2 border-blue-600 text-blue-600"
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
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
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
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                        <Users className="h-5 w-5 text-blue-600" />
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
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                生成新邀请码
              </button>
            }
          >
            {/* 筛选器 */}
            <div className="mb-4 flex flex-wrap gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">
                  筛选：
                </span>
              </div>

              {/* 状态筛选 */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">状态：</label>
                <select
                  value={invitationFilterStatus}
                  onChange={(e) => setInvitationFilterStatus(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="all">全部</option>
                  <option value="unused">未使用</option>
                  <option value="used">已使用</option>
                  <option value="expired">已过期</option>
                </select>
              </div>
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
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">邀请码</TableHead>
                      <TableHead className="w-[100px]">状态</TableHead>
                      <TableHead className="w-[120px]">使用人</TableHead>
                      <TableHead className="w-[140px]">创建日期</TableHead>
                      <TableHead className="w-[140px]">过期日期</TableHead>
                      <TableHead className="w-[100px] text-right">
                        操作
                      </TableHead>
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
                              title="复制邀请码"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell>
                          {ic.status === "used" ? (
                            <Badge variant="success">已使用</Badge>
                          ) : ic.status === "expired" ? (
                            <Badge variant="error">已过期</Badge>
                          ) : (
                            <Badge variant="default">未使用</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {ic.usedByName || "-"}
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {new Date(ic.createdAt).toLocaleDateString("zh-CN", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {ic.expiresAt
                            ? new Date(ic.expiresAt).toLocaleDateString(
                                "zh-CN",
                                {
                                  year: "numeric",
                                  month: "2-digit",
                                  day: "2-digit",
                                }
                              )
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="relative">
                            <button
                              onClick={() =>
                                setInvitationActionMenuOpen(
                                  invitationActionMenuOpen === ic.id
                                    ? null
                                    : ic.id
                                )
                              }
                              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                            {invitationActionMenuOpen === ic.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() =>
                                    setInvitationActionMenuOpen(null)
                                  }
                                />
                                <div className="absolute right-0 top-full z-50 mt-2 w-40 rounded-lg border border-gray-200 bg-white shadow-lg">
                                  <div className="p-1">
                                    {ic.status === "unused" && (
                                      <>
                                        <button
                                          onClick={() =>
                                            handleExtendInvitationCode(ic.id)
                                          }
                                          disabled={isExtending}
                                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          <Clock className="h-4 w-4" />
                                          延长7天
                                        </button>
                                        <div className="my-1 h-px bg-gray-200"></div>
                                        <button
                                          onClick={() =>
                                            handleRevokeInvitationCode(ic.id)
                                          }
                                          disabled={isRevoking}
                                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          <Ban className="h-4 w-4" />
                                          作废
                                        </button>
                                      </>
                                    )}
                                    {ic.status !== "unused" && (
                                      <div className="px-3 py-2 text-xs text-gray-500">
                                        无可用操作
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        )}

        {/* 生成邀请码弹窗 */}
        {showGenerateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  生成工作人员邀请码
                </h3>
                <button
                  onClick={() => {
                    setShowGenerateModal(false);
                    setGeneratedCode("");
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  <p>此邀请码用于邀请校内工作人员（STAFF）加入您的团队</p>
                  <p className="mt-1 text-xs">
                    工作人员可以协助您管理 POI 数据
                  </p>
                </div>

                {generatedCode && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                    <div className="mb-2 text-sm font-medium text-green-800">
                      邀请码生成成功！
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded bg-white px-3 py-2 font-mono text-lg font-bold text-gray-900">
                        {generatedCode}
                      </code>
                      <button
                        onClick={handleCopyCode}
                        className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
                      >
                        {copied ? (
                          <>
                            <Check className="h-4 w-4" />
                            已复制
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4" />
                            复制
                          </>
                        )}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-green-700">
                      请妥善保管此邀请码，分发给需要邀请的工作人员
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowGenerateModal(false);
                      setGeneratedCode("");
                    }}
                    className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    关闭
                  </button>
                  <button
                    onClick={handleGenerateCode}
                    disabled={isGenerating}
                    className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isGenerating ? "生成中..." : "生成邀请码"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
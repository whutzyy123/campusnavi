"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/use-auth-store";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Copy, Plus, MoreVertical, Clock, Ban, Filter, X, Check } from "lucide-react";
import toast from "react-hot-toast";
import { Badge } from "@/components/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/table";

interface School {
  id: string;
  name: string;
  schoolCode: string;
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
 * 超级管理员后台 - 邀请码管理页面
 * 功能：查看所有邀请码、生成邀请码、筛选、延长有效期、作废
 */
export default function InvitationCodesManagementPage() {
  const { currentUser } = useAuthStore();
  const [invitationCodes, setInvitationCodes] = useState<InvitationCode[]>([]);
  const [filteredInvitationCodes, setFilteredInvitationCodes] = useState<InvitationCode[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<string>("");
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string>("");
  const [copied, setCopied] = useState(false);
  
  // 邀请码筛选和操作状态
  const [invitationFilterSchool, setInvitationFilterSchool] = useState<string>("");
  const [invitationFilterStatus, setInvitationFilterStatus] = useState<string>("all");
  const [invitationActionMenuOpen, setInvitationActionMenuOpen] = useState<string | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isExtending, setIsExtending] = useState(false);

  // 检查是否为超级管理员
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";

  // 加载学校列表
  useEffect(() => {
    const fetchSchools = async () => {
      try {
        const response = await fetch("/api/schools");
        const data = await response.json();
        if (data.success) {
          setSchools(data.schools);
        }
      } catch (error) {
        console.error("获取学校列表失败:", error);
      }
    };

    fetchSchools();
  }, []);

  // 加载邀请码列表
  const fetchInvitationCodes = async () => {
    try {
      const response = await fetch("/api/invitation-codes");
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
  }, []);

  // 筛选邀请码
  useEffect(() => {
    let filtered = [...invitationCodes];

    // 按学校筛选
    if (invitationFilterSchool) {
      filtered = filtered.filter((ic) => ic.schoolId === invitationFilterSchool);
    }

    // 按状态筛选
    if (invitationFilterStatus !== "all") {
      filtered = filtered.filter((ic) => ic.status === invitationFilterStatus);
    }

    setFilteredInvitationCodes(filtered);
  }, [invitationCodes, invitationFilterSchool, invitationFilterStatus]);

  // 生成邀请码
  const handleGenerateCode = async () => {
    if (!selectedSchool || !currentUser) {
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
          schoolId: selectedSchool,
          role: 2, // 校级管理员
          issuerId: currentUser.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "生成失败");
      }

      setGeneratedCode(data.invitationCode.code);
      toast.success("邀请码生成成功！");
      // 刷新邀请码列表
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

  // 复制邀请码（从表格）
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
      const response = await fetch(`/api/invitation-codes/${invitationCodeId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: currentUser.id }),
      });

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
    if (!currentUser) return;

    setIsExtending(true);
    const toastId = toast.loading("正在延长有效期...");

    try {
      const response = await fetch(`/api/invitation-codes/${invitationCodeId}/extend`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: currentUser.id }),
      });

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
                生成管理员邀请码
              </button>
            }
          >
            {/* 筛选器 */}
            <div className="mb-4 flex flex-wrap gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">筛选：</span>
              </div>
              
              {/* 学校筛选（仅超级管理员可见） */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">所属学校：</label>
                <select
                  value={invitationFilterSchool}
                  onChange={(e) => setInvitationFilterSchool(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">全部学校</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
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
                icon={Copy}
                title="暂无邀请码"
                description={invitationCodes.length === 0 ? "还没有生成任何邀请码" : "没有符合条件的邀请码"}
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">邀请码</TableHead>
                      <TableHead className="w-[120px]">授权角色</TableHead>
                      <TableHead className="w-[150px]">所属学校</TableHead>
                      <TableHead className="w-[100px]">状态</TableHead>
                      <TableHead className="w-[120px]">发放人</TableHead>
                      <TableHead className="w-[120px]">使用人</TableHead>
                      <TableHead className="w-[140px]">创建日期</TableHead>
                      <TableHead className="w-[140px]">过期日期</TableHead>
                      <TableHead className="w-[100px] text-right">操作</TableHead>
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
                          <Badge variant={ic.role === 2 ? "info" : "default"}>
                            {ic.roleName}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-700">{ic.schoolName}</TableCell>
                        <TableCell>
                          {ic.status === "used" ? (
                            <Badge variant="success">已使用</Badge>
                          ) : ic.status === "expired" ? (
                            <Badge variant="error">已过期</Badge>
                          ) : (
                            <Badge variant="default">未使用</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">{ic.issuerName}</TableCell>
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
                            ? new Date(ic.expiresAt).toLocaleDateString("zh-CN", {
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                              })
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="relative">
                            <button
                              onClick={() =>
                                setInvitationActionMenuOpen(
                                  invitationActionMenuOpen === ic.id ? null : ic.id
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
                                  onClick={() => setInvitationActionMenuOpen(null)}
                                />
                                <div className="absolute right-0 top-full z-50 mt-2 w-40 rounded-lg border border-gray-200 bg-white shadow-lg">
                                  <div className="p-1">
                                    {ic.status === "unused" && (
                                      <>
                                        <button
                                          onClick={() => handleExtendInvitationCode(ic.id)}
                                          disabled={isExtending}
                                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          <Clock className="h-4 w-4" />
                                          延长7天
                                        </button>
                                        <div className="my-1 h-px bg-gray-200"></div>
                                        <button
                                          onClick={() => handleRevokeInvitationCode(ic.id)}
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

          {/* 生成邀请码弹窗 */}
          {showGenerateModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">生成管理员邀请码</h3>
                  <button
                    onClick={() => {
                      setShowGenerateModal(false);
                      setSelectedSchool("");
                      setGeneratedCode("");
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      选择学校 <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedSchool}
                      onChange={(e) => setSelectedSchool(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="">请选择学校</option>
                      {schools.map((school) => (
                        <option key={school.id} value={school.id}>
                          {school.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {generatedCode && (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                      <div className="mb-2 text-sm font-medium text-green-800">邀请码生成成功！</div>
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
                        请妥善保管此邀请码，分发给该校的主管理员
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowGenerateModal(false);
                        setSelectedSchool("");
                        setGeneratedCode("");
                      }}
                      className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleGenerateCode}
                      disabled={isGenerating || !selectedSchool}
                      className="flex-1 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#FF4500]/90 disabled:cursor-not-allowed disabled:opacity-50"
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
    </AuthGuard>
  );
}

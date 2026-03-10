"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuthStore } from "@/store/use-auth-store";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Building2, Plus, MoreVertical, Edit, Power, PowerOff, Trash2, Save, X, Check, Copy, ArrowUpDown } from "lucide-react";
import toast from "react-hot-toast";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/table";
import {
  getSchoolsWithStats,
  getSchoolById,
  updateSchool,
  updateSchoolStatus,
  deleteSchool,
  createSchool,
} from "@/lib/school-actions";
import { createInvitationCode } from "@/lib/invitation-actions";

interface School {
  id: string;
  name: string;
  schoolCode: string;
  isActive: boolean;
  userCount: number;
  poiCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 超级管理员后台 - 学校管理页面
 * 功能：查看所有学校、新增学校、编辑学校、停用/激活、删除学校
 */
export default function SchoolsManagementPage() {
  const { currentUser } = useAuthStore();
  const [schools, setSchools] = useState<School[]>([]);
  const [isLoadingSchools, setIsLoadingSchools] = useState(true);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [editName, setEditName] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  
  // 新增学校模态框相关状态
  const [showCreateSchoolModal, setShowCreateSchoolModal] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState("");
  const [newSchoolCode, setNewSchoolCode] = useState("");
  const [isCreatingSchool, setIsCreatingSchool] = useState(false);
  const [createdSchoolId, setCreatedSchoolId] = useState<string | null>(null);
  const [showGenerateInviteAfterCreate, setShowGenerateInviteAfterCreate] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // 表格排序：'userCount' | 'poiCount' | null（默认按 API 返回顺序）
  const [sortBy, setSortBy] = useState<"userCount" | "poiCount" | null>(null);
  const [sortDesc, setSortDesc] = useState(true);

  // 检查是否为超级管理员
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";

  // 获取学校列表的函数（可重复调用）
  const fetchSchools = async () => {
    setIsLoadingSchools(true);
    try {
      const result = await getSchoolsWithStats();
      if (result.success && result.data) {
        setSchools(result.data);
      } else if (!result.success) {
        toast.error(result.error || "获取学校列表失败");
      }
    } catch (error) {
      console.error("获取学校列表失败:", error);
      toast.error("获取学校列表失败");
    } finally {
      setIsLoadingSchools(false);
    }
  };

  // 加载学校列表
  useEffect(() => {
    fetchSchools();
  }, []);

  // 切换学校状态（停用/激活）- 使用 Server Action
  const handleToggleStatus = async (schoolId: string, isActive: boolean) => {
    const actionText = isActive ? "激活" : "停用";
    const toastId = toast.loading(`正在${actionText}学校...`);

    const status = isActive ? "ACTIVE" : "INACTIVE";
    const result = await updateSchoolStatus(schoolId, status);

    if (result.success) {
      toast.success(`学校已${actionText}`, { id: toastId });
      setActionMenuOpen(null);
      setDropdownPosition(null);
      await fetchSchools();
    } else {
      toast.error(result.error || "操作失败", { id: toastId });
    }
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingSchool || !editName.trim()) {
      toast.error("学校名称不能为空");
      return;
    }

    const toastId = toast.loading("正在更新学校信息...");

    try {
      const result = await updateSchool(editingSchool.id, { name: editName.trim() });
      if (!result.success) {
        throw new Error(result.error || "更新失败");
      }

      toast.success("学校信息更新成功", { id: toastId });
      setShowEditModal(false);
      setEditingSchool(null);
      setEditName("");

      await fetchSchools();
    } catch (error) {
      console.error("更新学校信息失败:", error);
      toast.error((error as Error).message || "更新失败", { id: toastId });
    }
  };

  // 创建学校
  const handleCreateSchool = async () => {
    if (!newSchoolName.trim() || !newSchoolCode.trim()) {
      toast.error("请填写学校名称和代码");
      return;
    }

    setIsCreatingSchool(true);

    try {
      const result = await createSchool({
        name: newSchoolName.trim(),
        schoolCode: newSchoolCode.trim(),
      });
      if (!result.success) {
        throw new Error(result.error || "创建失败");
      }

      toast.success("学校创建成功！");
      setCreatedSchoolId(result.data?.id ?? null);
      setShowGenerateInviteAfterCreate(true);

      await fetchSchools();
    } catch (error) {
      console.error("创建学校失败:", error);
      toast.error((error as Error).message || "创建失败");
    } finally {
      setIsCreatingSchool(false);
    }
  };

  // 在创建学校后生成邀请码
  const handleGenerateInviteAfterCreate = async () => {
    if (!createdSchoolId || !currentUser) {
      return;
    }

    setIsGenerating(true);

    try {
      const result = await createInvitationCode(createdSchoolId, "ADMIN", 7);
      if (!result.success) {
        throw new Error(result.message || result.error || "生成失败");
      }

      setGeneratedCode(result.data?.code ?? "");
      toast.success("邀请码生成成功！");
    } catch (error) {
      console.error("生成邀请码失败:", error);
      toast.error((error as Error).message || "生成失败");
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

  // 关闭新增学校模态框
  const handleCloseCreateSchoolModal = () => {
    setShowCreateSchoolModal(false);
    setNewSchoolName("");
    setNewSchoolCode("");
    setCreatedSchoolId(null);
    setShowGenerateInviteAfterCreate(false);
    setGeneratedCode("");
  };

  // 删除学校 - 使用 confirm() 确认后调用 Server Action
  const handleDeleteSchool = async (school: School) => {
    const confirmed = window.confirm(
      `确定要彻底删除学校「${school.name}」(代码: ${school.schoolCode}) 吗？\n\n此操作将永久删除该校及其所有关联数据（用户、POI、邀请码等），且不可恢复。`
    );
    if (!confirmed) return;

    const toastId = toast.loading("正在删除学校...");
    setActionMenuOpen(null);

    const result = await deleteSchool(school.id);

    if (result.success) {
      toast.success("学校已永久删除", { id: toastId });
      await fetchSchools();
    } else {
      toast.error(result.error || "删除失败", { id: toastId });
    }
  };

  // 排序后的学校列表（兼容 userCount/poiCount 为 undefined 的旧数据）
  const sortedSchools = [...schools].sort((a, b) => {
    if (!sortBy) return 0;
    const aVal = (a[sortBy] ?? 0) as number;
    const bVal = (b[sortBy] ?? 0) as number;
    return sortDesc ? bVal - aVal : aVal - bVal;
  });

  const handleSort = (column: "userCount" | "poiCount") => {
    if (sortBy === column) {
      setSortDesc((d) => !d);
    } else {
      setSortBy(column);
      setSortDesc(true);
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
            title="所有注册学校"
            action={
              <button
                onClick={() => {
                  setShowCreateSchoolModal(true);
                  setNewSchoolName("");
                  setNewSchoolCode("");
                  setCreatedSchoolId(null);
                  setShowGenerateInviteAfterCreate(false);
                }}
                className="flex items-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#FF4500]/90"
              >
                <Plus className="h-4 w-4" />
                新增学校
              </button>
            }
          >
            {isLoadingSchools ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF4500] border-t-transparent"></div>
              </div>
            ) : schools.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="暂无学校数据"
                description="系统中还没有注册的学校，请先创建学校"
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">学校名称</TableHead>
                      <TableHead className="w-[120px]">唯一代码</TableHead>
                      <TableHead className="w-[100px]">状态</TableHead>
                      <TableHead className="w-[100px] text-center">
                        <button
                          type="button"
                          onClick={() => handleSort("userCount")}
                          className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900"
                        >
                          用户数
                          <ArrowUpDown className="h-3.5 w-3.5" />
                        </button>
                      </TableHead>
                      <TableHead className="w-[100px] text-center">
                        <button
                          type="button"
                          onClick={() => handleSort("poiCount")}
                          className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900"
                        >
                          POI 数
                          <ArrowUpDown className="h-3.5 w-3.5" />
                        </button>
                      </TableHead>
                      <TableHead className="w-[120px]">创建日期</TableHead>
                      <TableHead className="w-[100px] text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedSchools.map((school) => (
                      <TableRow key={school.id}>
                        <TableCell className="font-medium">{school.name}</TableCell>
                        <TableCell>
                          <code className="rounded bg-gray-100 px-2 py-1 text-xs font-mono text-gray-800">
                            {school.schoolCode}
                          </code>
                        </TableCell>
                        <TableCell>
                          <StatusBadge domain="school" status={school.isActive} />
                        </TableCell>
                        <TableCell
                          className={`text-center ${(school.userCount ?? 0) === 0 ? "text-gray-500" : ""}`}
                        >
                          {school.userCount ?? 0}
                        </TableCell>
                        <TableCell
                          className={`text-center ${(school.poiCount ?? 0) === 0 ? "text-gray-500" : ""}`}
                        >
                          {school.poiCount ?? 0}
                        </TableCell>
                        <TableCell>
                          {new Date(school.createdAt).toLocaleDateString("zh-CN", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                if (actionMenuOpen === school.id) {
                                  setActionMenuOpen(null);
                                  setDropdownPosition(null);
                                } else {
                                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                  setDropdownPosition({
                                    top: rect.bottom + 4,
                                    left: rect.right - 176,
                                  });
                                  setActionMenuOpen(school.id);
                                }
                              }}
                              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                              aria-haspopup="true"
                              aria-expanded={actionMenuOpen === school.id}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                            {actionMenuOpen === school.id &&
                              dropdownPosition &&
                              typeof document !== "undefined" &&
                              createPortal(
                                <>
                                  <div
                                    className="fixed inset-0 z-modal-overlay"
                                    onClick={() => {
                                      setActionMenuOpen(null);
                                      setDropdownPosition(null);
                                    }}
                                    aria-hidden="true"
                                  />
                                  <div
                                    className="fixed z-tooltip-popover w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                                    style={{
                                      top: dropdownPosition.top,
                                      left: dropdownPosition.left,
                                    }}
                                  >
                                    <button
                                      onClick={() => {
                                        setEditingSchool(school);
                                        setEditName(school.name);
                                        setShowEditModal(true);
                                        setActionMenuOpen(null);
                                        setDropdownPosition(null);
                                      }}
                                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
                                    >
                                      <Edit className="h-4 w-4" />
                                      编辑学校
                                    </button>
                                    {school.isActive ? (
                                      <button
                                        onClick={() => handleToggleStatus(school.id, false)}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                                      >
                                        <PowerOff className="h-4 w-4" />
                                        停用账户
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleToggleStatus(school.id, true)}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-green-600 transition-colors hover:bg-green-50"
                                      >
                                        <Power className="h-4 w-4" />
                                        激活账户
                                      </button>
                                    )}
                                    <div className="my-1 h-px bg-gray-200" />
                                    <button
                                      onClick={() => handleDeleteSchool(school)}
                                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      彻底删除
                                    </button>
                                  </div>
                                </>,
                                document.body
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

          {/* 编辑学校弹窗 */}
          {showEditModal && editingSchool && (
            <div className="fixed inset-0 z-modal-overlay modal-overlay bg-black/50">
              <div className="modal-container max-w-md p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">编辑学校信息</h3>
                  <button
                    onClick={() => {
                      setShowEditModal(false);
                      setEditingSchool(null);
                      setEditName("");
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      学校名称 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="请输入学校名称"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                    />
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                    <div className="font-medium">唯一代码：</div>
                    <code className="mt-1 block font-mono text-gray-800">{editingSchool.schoolCode}</code>
                    <div className="mt-1 text-xs text-gray-500">唯一代码创建后不可修改</div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowEditModal(false);
                        setEditingSchool(null);
                        setEditName("");
                      }}
                      className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      className="flex-1 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#FF4500]/90"
                    >
                      保存
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 新增学校模态框 */}
          {showCreateSchoolModal && (
            <div className="fixed inset-0 z-modal-overlay modal-overlay bg-black/50">
              <div className="modal-container max-w-md p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">新增学校</h3>
                    <p className="text-sm text-gray-500">创建学校账号，边界由 School Admin 在 CampusArea 中配置</p>
                  </div>
                  <button
                    onClick={handleCloseCreateSchoolModal}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {showGenerateInviteAfterCreate && createdSchoolId ? (
                  /* 创建成功后的邀请码生成步骤 */
                  <div className="space-y-4">
                    <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-green-800">
                        <Check className="h-5 w-5" />
                        学校创建成功！
                      </div>
                      <p className="text-xs text-green-700">
                        现在可以为该学校生成管理员邀请码
                      </p>
                    </div>

                    {generatedCode ? (
                      <div className="rounded-lg border border-[#FF4500]/30 bg-[#FFE5DD] p-4">
                        <div className="mb-2 text-sm font-medium text-[#FF4500]">邀请码生成成功！</div>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 rounded bg-white px-3 py-2 font-mono text-lg font-bold text-gray-900">
                            {generatedCode}
                          </code>
                          <button
                            onClick={handleCopyCode}
                            className="flex items-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
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
                        <p className="mt-2 text-xs text-[#FF4500]">
                          请妥善保管此邀请码，分发给该校的主管理员
                        </p>
                      </div>
                    ) : (
                      <button
                        onClick={handleGenerateInviteAfterCreate}
                        disabled={isGenerating}
                        className="w-full rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#FF4500]/90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isGenerating ? "生成中..." : "生成管理员邀请码"}
                      </button>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={handleCloseCreateSchoolModal}
                        className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        完成
                      </button>
                      <button
                        onClick={() => {
                          setShowGenerateInviteAfterCreate(false);
                          setCreatedSchoolId(null);
                          setGeneratedCode("");
                          setNewSchoolName("");
                          setNewSchoolCode("");
                        }}
                        className="flex-1 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#FF4500]/90"
                      >
                        继续创建
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 创建学校表单 */
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        学校名称 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newSchoolName}
                        onChange={(e) => setNewSchoolName(e.target.value)}
                        placeholder="例如：北京大学"
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        唯一代码 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newSchoolCode}
                        onChange={(e) => setNewSchoolCode(e.target.value.toLowerCase())}
                        placeholder="例如：pku"
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                      />
                      <p className="mt-1 text-xs text-gray-500">唯一代码创建后不可修改</p>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={handleCloseCreateSchoolModal}
                        className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleCreateSchool}
                        disabled={isCreatingSchool || !newSchoolName.trim() || !newSchoolCode.trim()}
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#FF4500]/90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isCreatingSchool ? (
                          <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                            创建中...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" />
                            创建学校
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}

"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useAuthStore } from "@/store/use-auth-store";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Users, Ban, Key, Filter, X, Trash2, AlertTriangle, Info } from "lucide-react";
import { TableActions } from "@/components/ui/table-actions";
import toast from "react-hot-toast";
import { StatusBadge } from "@/components/status-badge";
import { SearchInput } from "@/components/shared/search-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/table";
import { PaginationControls } from "@/components/ui/pagination-controls";
import {
  getAdminUserDetail,
  adminResetUserPassword,
  getAdminUsers,
  deactivateUser,
  deleteUser,
  type AdminUserDetail,
} from "@/lib/user-actions";
import { AdminUserDetailModal } from "@/components/admin/admin-user-detail-modal";
import { ResetPasswordModal } from "@/components/admin/reset-password-modal";
import { getSchoolsList } from "@/lib/school-actions";

interface User {
  id: string;
  nickname: string | null;
  email: string | null;
  role: string;
  roleNumber: number;
  schoolId: string | null;
  schoolName: string;
  schoolCode: string | null;
  createdAt: string;
  status: string;
}

/**
 * 超级管理员后台 - 用户管理页面
 * 功能：查看所有注册用户、筛选、治理操作
 */
export default function UserManagementPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <UserManagementPageContent />
    </Suspense>
  );
}

function UserManagementPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState<{
    total: number;
    pageCount: number;
    currentPage: number;
  } | null>(null);
  
  // 筛选器状态
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [schoolFilter, setSchoolFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [searchField, setSearchField] = useState<"nickname" | "email">("nickname");
  const [schools, setSchools] = useState<Array<{ id: string; name: string }>>([]);
  
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPatching, setIsPatching] = useState(false);
  const [selectedUserForView, setSelectedUserForView] = useState<User | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [profileDetail, setProfileDetail] = useState<AdminUserDetail | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [selectedUserForReset, setSelectedUserForReset] = useState<User | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  // 加载学校列表（用于筛选器）
  useEffect(() => {
    const fetchSchools = async () => {
      try {
        const result = await getSchoolsList();
        if (result.success && result.data) {
          setSchools(result.data.map((s) => ({ id: s.id, name: s.name })));
        }
      } catch (error) {
        console.error("获取学校列表失败:", error);
      }
    };

    fetchSchools();
  }, []);

  // 加载用户列表
  const fetchUsers = useCallback(async () => {
    if (!currentUser?.id) return;

    setIsLoading(true);
    try {
      const currentPage = parseInt(searchParams.get("page") || "1", 10);
      const result = await getAdminUsers({
        page: currentPage,
        limit: 10,
        role: roleFilter !== "all" ? roleFilter : undefined,
        schoolId: schoolFilter !== "all" ? schoolFilter : undefined,
        search: debouncedSearchQuery.trim() || undefined,
        field: searchField,
      });
      if (result.success && result.data) {
        setUsers(result.data);
        setPagination(result.pagination || null);
      } else {
        toast.error(result.error || "获取用户列表失败");
      }
    } catch (error) {
      console.error("获取用户列表失败:", error);
      toast.error(error instanceof Error ? error.message : "获取用户列表失败");
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.id, roleFilter, schoolFilter, debouncedSearchQuery, searchField, searchParams]);

  // 当筛选条件、搜索关键词或分页变化时，重新加载用户列表
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // 停用/激活账户
  const handleToggleStatus = async (user: User) => {
    if (!currentUser?.id) return;
    if (user.id === currentUser.id) {
      toast.error("不能操作自己的账户");
      return;
    }

    const newStatus = user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setIsPatching(true);

    try {
      const result = await deactivateUser(user.id, newStatus);
      if (!result.success) {
        throw new Error(result.message || "操作失败");
      }
      toast.success(result.message || (newStatus === "ACTIVE" ? "已激活" : "已停用"));
      await fetchUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setIsPatching(false);
    }
  };

  // 删除用户
  const handleDeleteUser = async () => {
    if (!deleteTarget || !currentUser?.id) return;
    const isConfirmed =
      (deleteTarget.email && deleteConfirm.trim() === deleteTarget.email) ||
      (deleteTarget.nickname && deleteConfirm.trim() === deleteTarget.nickname) ||
      (deleteTarget.id && deleteConfirm.trim() === deleteTarget.id);
    if (!isConfirmed) {
      toast.error("请输入正确的邮箱、昵称或用户ID以确认删除");
      return;
    }

    setIsDeleting(true);
    try {
      const result = await deleteUser(deleteTarget.id);
      if (!result.success) {
        throw new Error(result.message || "删除失败");
      }
      toast.success(result.message || "用户已永久删除");
      setDeleteTarget(null);
      setDeleteConfirm("");
      await fetchUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleResetPassword = (user: User) => {
    setSelectedUserForReset(user);
    setIsResetModalOpen(true);
  };

  const closeResetModal = () => {
    setIsResetModalOpen(false);
    setSelectedUserForReset(null);
  };

  const handleResetPasswordConfirm = async (userId: string, newPassword: string) => {
    const result = await adminResetUserPassword(userId, newPassword);
    if (result.success) {
      const nickname = selectedUserForReset?.nickname || selectedUserForReset?.email || "该用户";
      toast.success(`已为 ${nickname} 重置密码成功`);
      closeResetModal();
    } else {
      toast.error(result.message);
    }
    return result;
  };

  // 查看资料（只读）
  const handleViewDetails = (user: User) => {
    setSelectedUserForView(user);
    setIsViewModalOpen(true);
    setProfileDetail(null);
    setProfileLoading(true);
    getAdminUserDetail(user.id).then((result) => {
      if (result.success && result.data) {
        setProfileDetail(result.data);
      } else {
        toast.error(result.error || "获取资料失败");
        closeViewModal();
      }
    }).catch(() => {
      toast.error("获取资料失败");
      closeViewModal();
    }).finally(() => {
      setProfileLoading(false);
    });
  };

  const closeViewModal = () => {
    setIsViewModalOpen(false);
    setSelectedUserForView(null);
    setProfileDetail(null);
  };

  return (
    <AuthGuard requiredRole="SUPER_ADMIN">
      <AdminLayout>
        <div className="flex flex-col h-full p-4 md:p-6 gap-4">
          {/* Header Section */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900">全局用户管理</h2>
            <p className="mt-1 text-sm text-gray-500">查看和管理所有注册用户</p>
          </div>

          {/* Filter Bar Card */}
          <Card className="flex-shrink-0">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">筛选：</span>
              </div>

              {/* 搜索框 */}
              <div className="flex items-center gap-2">
                <select
                  value={searchField}
                  onChange={(e) => setSearchField(e.target.value as "nickname" | "email")}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                >
                  <option value="nickname">按昵称搜索</option>
                  <option value="email">按邮箱搜索</option>
                </select>
                <SearchInput
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder={searchField === "nickname" ? "输入昵称..." : "输入邮箱..."}
                  minWidth="w-64"
                />
              </div>

              {/* 角色筛选 */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">角色：</label>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                >
                  <option value="all">全部</option>
                  <option value="STUDENT">学生</option>
                  <option value="ADMIN">校级管理员</option>
                  <option value="STAFF">工作人员</option>
                  <option value="SUPER_ADMIN">超级管理员</option>
                </select>
              </div>

              {/* 学校筛选 */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">所属学校：</label>
                <select
                  value={schoolFilter}
                  onChange={(e) => setSchoolFilter(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                >
                  <option value="all">全部</option>
                  <option value="null">系统</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 清除筛选 */}
              {(roleFilter !== "all" || schoolFilter !== "all" || searchQuery.trim()) && (
                <button
                  onClick={() => {
                    setRoleFilter("all");
                    setSchoolFilter("all");
                    setSearchQuery("");
                    setSearchField("nickname");
                    // 重置到第一页
                    const params = new URLSearchParams(searchParams.toString());
                    params.delete("page");
                    router.push(`/super-admin/users?${params.toString()}`);
                  }}
                  className="ml-auto flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50"
                >
                  <X className="h-3.5 w-3.5" />
                  清除筛选
                </button>
              )}
            </div>
          </Card>

          {/* Table Container */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <div className="h-full min-h-0 rounded-lg bg-white shadow overflow-hidden flex flex-col">
              <div className="h-full min-h-0 overflow-y-auto custom-scrollbar p-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF4500] border-t-transparent"></div>
                </div>
              ) : users.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="暂无用户数据"
                  description="没有符合条件的用户"
                />
              ) : (
                <>
                  <div className="h-full min-h-0 flex flex-col overflow-hidden">
                    <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-auto custom-scrollbar">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-white shadow-sm [&_tr]:border-b [&_tr]:border-gray-200">
                      <TableRow>
                        <TableHead>用户昵称</TableHead>
                        <TableHead>电子邮箱</TableHead>
                        <TableHead className="w-[100px]">用户角色</TableHead>
                        <TableHead>所属学校</TableHead>
                        <TableHead className="w-[100px]">注册日期</TableHead>
                        <TableHead className="w-[80px]">状态</TableHead>
                        <TableHead className="w-[72px] text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="min-w-0 max-w-[180px] font-medium">
                            <div className="truncate" title={user.nickname ?? undefined}>
                              {user.nickname ?? "—"}
                            </div>
                          </TableCell>
                          <TableCell className="min-w-0 max-w-[200px] text-sm text-gray-600">
                            <div className="truncate" title={user.email ?? undefined}>
                              {user.email ?? "—"}
                            </div>
                          </TableCell>
                          <TableCell><StatusBadge domain="user" status={user.role} /></TableCell>
                          <TableCell className="min-w-0 max-w-[160px] text-sm text-gray-600">
                            <div className="truncate" title={user.schoolName}>
                              {user.schoolName}
                              {user.schoolCode && (
                                <span className="ml-1 text-xs text-gray-400">
                                  ({user.schoolCode})
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {new Date(user.createdAt).toLocaleDateString("zh-CN", {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                            })}
                          </TableCell>
                          <TableCell>
                            <StatusBadge domain="user" status={user.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <TableActions
                              disabled={isPatching}
                              items={[
                                {
                                  label: "查看资料",
                                  icon: Info,
                                  onClick: () => handleViewDetails(user),
                                },
                                {
                                  label: "重置密码",
                                  icon: Key,
                                  onClick: () => handleResetPassword(user),
                                  disabled: user.id === currentUser?.id,
                                },
                                "separator",
                                {
                                  label: user.status === "ACTIVE" ? "停用账户" : "激活账户",
                                  icon: Ban,
                                  onClick: () => handleToggleStatus(user),
                                  disabled: user.id === currentUser?.id,
                                },
                                "separator",
                                {
                                  label: "永久删除",
                                  icon: Trash2,
                                  onClick: () => setDeleteTarget(user),
                                  variant: "destructive",
                                  disabled: user.id === currentUser?.id,
                                },
                              ]}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                      </Table>
                    </div>
                    {/* 分页控件 */}
                    {pagination && pagination.total > 0 && (
                      <div className="flex-shrink-0 flex justify-center border-t border-gray-100 py-4">
                        <PaginationControls
                        total={pagination.total}
                          pageCount={pagination.pageCount}
                          currentPage={pagination.currentPage}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
              </div>
            </div>
          </div>

          {/* 删除确认弹窗 */}
          {deleteTarget && (
            <div className="fixed inset-0 z-modal-overlay modal-overlay bg-black/50">
              <div className="modal-container max-w-md p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                    <AlertTriangle className="h-6 w-6 text-red-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">永久删除用户</h3>
                    <p className="text-sm text-gray-500">此操作不可逆</p>
                  </div>
                </div>
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-medium text-red-800">
                    确定要删除用户 <strong>{deleteTarget.nickname || deleteTarget.email || deleteTarget.id}</strong> 吗？
                  </p>
                  <p className="mt-2 text-xs text-red-700">
                    将同时删除其留言、点赞等关联数据
                  </p>
                </div>
                <div className="mb-4">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    请输入邮箱或昵称以确认：
                  </label>
                  <input
                    type="text"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder={deleteTarget.email || deleteTarget.nickname || ""}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
                    autoFocus
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setDeleteTarget(null);
                      setDeleteConfirm("");
                    }}
                    disabled={isDeleting}
                    className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleDeleteUser}
                    disabled={
                      isDeleting ||
                      !(
                        (deleteTarget.email && deleteConfirm.trim() === deleteTarget.email) ||
                        (deleteTarget.nickname && deleteConfirm.trim() === deleteTarget.nickname) ||
                        (deleteTarget.id && deleteConfirm.trim() === deleteTarget.id)
                      )
                    }
                    className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isDeleting ? "删除中..." : "确认删除"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 重置密码弹窗 */}
          <ResetPasswordModal
            isOpen={isResetModalOpen}
            onClose={closeResetModal}
            userId={selectedUserForReset?.id ?? ""}
            userNickname={selectedUserForReset?.nickname}
            onReset={handleResetPasswordConfirm}
          />

          {/* 查看资料弹窗（只读） */}
          <AdminUserDetailModal
            isOpen={isViewModalOpen}
            onClose={closeViewModal}
            userId={selectedUserForView?.id ?? ""}
            displayName={selectedUserForView?.nickname}
            profileDetail={profileDetail}
            isLoading={profileLoading}
          />
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}


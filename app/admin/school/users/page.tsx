"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDebounce } from "@/hooks/use-debounce";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Users2, Ban, Key, Info, RotateCcw } from "lucide-react";
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
import { AdminUserDetailModal } from "@/components/admin/admin-user-detail-modal";
import { ResetPasswordModal } from "@/components/admin/reset-password-modal";
import {
  getSchoolUsers,
  getAdminUserDetail,
  adminResetUserPassword,
  deactivateUser,
  type SchoolUserListItem,
  type AdminUserDetail,
} from "@/lib/user-actions";
import { useAuthStore } from "@/store/use-auth-store";
import { formatDate } from "@/lib/utils";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export default function SchoolUsersPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <SchoolUsersPageContent />
    </Suspense>
  );
}

function SchoolUsersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser } = useAuthStore();
  const [users, setUsers] = useState<SchoolUserListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState<{
    total: number;
    pageCount: number;
    currentPage: number;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [roleFilter, setRoleFilter] = useState("");
  const currentPage = parseInt(searchParams.get("page") || "1", 10);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // View detail modal
  const [selectedUserForView, setSelectedUserForView] = useState<SchoolUserListItem | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [profileDetail, setProfileDetail] = useState<AdminUserDetail | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Reset password modal
  const [selectedUserForReset, setSelectedUserForReset] = useState<SchoolUserListItem | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getSchoolUsers({
        page: currentPage,
        limit: 10,
        search: debouncedSearch.trim() || undefined,
        role: (roleFilter as "STUDENT" | "ADMIN" | "STAFF") || undefined,
      });
      if (result.success && result.data) {
        setUsers(result.data);
        setPagination(result.pagination ?? null);
      } else {
        toast.error(result.error || "获取用户列表失败");
      }
    } catch (error) {
      console.error("获取用户列表失败:", error);
      toast.error("获取用户列表失败");
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, debouncedSearch, roleFilter]);

  // 筛选条件变化时重置到第一页（跳过首次挂载）
  const prevFiltersRef = useRef({ search: "", role: "" });
  useEffect(() => {
    const prev = prevFiltersRef.current;
    const changed = prev.search !== debouncedSearch || prev.role !== roleFilter;
    prevFiltersRef.current = { search: debouncedSearch, role: roleFilter };
    if (changed) {
      router.replace("/admin/school/users", { scroll: false });
    }
  }, [debouncedSearch, roleFilter, router]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleViewDetails = (user: SchoolUserListItem) => {
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

  const handleResetPassword = (user: SchoolUserListItem) => {
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
      router.refresh();
      await fetchUsers();
    } else {
      toast.error(result.message);
    }
    return result;
  };

  const handleToggleStatus = async (user: SchoolUserListItem) => {
    if (user.id === currentUser?.id) {
      toast.error("不能操作自己的账户");
      return;
    }
    const newStatus = user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setActionLoading(user.id);
    const toastId = toast.loading(newStatus === "ACTIVE" ? "正在激活..." : "正在停用...");
    try {
      const result = await deactivateUser(user.id, newStatus);
      if (result.success) {
        toast.success(result.message, { id: toastId });
        router.refresh();
        await fetchUsers();
      } else {
        toast.error(result.message, { id: toastId });
      }
    } catch {
      toast.error("操作失败", { id: toastId });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <AdminLayout>
      <div className="p-6">
        <Card title="本校用户管理" description="查看和管理本校注册用户">
          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <AdminFilterBar
              search={{
                value: searchQuery,
                onChange: setSearchQuery,
                placeholder: "按昵称搜索...",
              }}
              filters={[
                {
                  label: "角色",
                  value: roleFilter,
                  onChange: setRoleFilter,
                  options: [
                    { value: "", label: "全部" },
                    { value: "STUDENT", label: "学生" },
                    { value: "ADMIN", label: "校级管理员" },
                    { value: "STAFF", label: "工作人员" },
                  ],
                },
              ]}
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF4500] border-t-transparent" />
            </div>
          ) : users.length === 0 ? (
            <EmptyState
              icon={Users2}
              title="暂无用户"
              description="没有符合条件的用户"
            />
          ) : (
            <>
              <div className="w-full overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>昵称</TableHead>
                      <TableHead className="w-[100px]">角色</TableHead>
                      <TableHead responsiveHide="sm">邮箱</TableHead>
                      <TableHead className="w-[80px]" responsiveHide="sm">状态</TableHead>
                      <TableHead className="w-[100px]" responsiveHide="lg">注册日期</TableHead>
                      <TableHead className="w-[72px] text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          <div className="truncate max-w-[160px]" title={user.nickname ?? ""}>
                            {user.nickname ?? "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge domain="user" status={user.role} />
                        </TableCell>
                        <TableCell responsiveHide="sm" className="text-sm text-gray-600">
                          <div className="truncate max-w-[180px]" title={user.email ?? ""}>
                            {user.email ?? "—"}
                          </div>
                        </TableCell>
                        <TableCell responsiveHide="sm">
                          <StatusBadge domain="user" status={user.status} />
                        </TableCell>
                        <TableCell responsiveHide="lg" className="text-sm text-gray-500">
                          {formatDate(user.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <TableActions
                            disabled={actionLoading === user.id}
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
                                icon: user.status === "ACTIVE" ? Ban : RotateCcw,
                                onClick: () => handleToggleStatus(user),
                                disabled: user.id === currentUser?.id,
                                variant: user.status === "ACTIVE" ? "destructive" : undefined,
                              },
                            ]}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {pagination && pagination.total > 0 && (
                <div className="mt-6 flex justify-center">
                  <PaginationControls
                    total={pagination.total}
                    pageCount={pagination.pageCount}
                    currentPage={pagination.currentPage}
                  />
                </div>
              )}
            </>
          )}
        </Card>

        <AdminUserDetailModal
          isOpen={isViewModalOpen}
          onClose={closeViewModal}
          userId={selectedUserForView?.id ?? ""}
          displayName={selectedUserForView?.nickname}
          profileDetail={profileDetail}
          isLoading={profileLoading}
          hideSchoolName
        />

        <ResetPasswordModal
          isOpen={isResetModalOpen}
          onClose={closeResetModal}
          userId={selectedUserForReset?.id ?? ""}
          userNickname={selectedUserForReset?.nickname}
          onReset={handleResetPasswordConfirm}
        />
      </div>
    </AdminLayout>
  );
}

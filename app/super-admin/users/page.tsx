"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/use-auth-store";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Users, MoreVertical, Ban, Key, Filter, X, Search } from "lucide-react";
import toast from "react-hot-toast";
import { Badge } from "@/components/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/table";
import { PaginationControls } from "@/components/ui/pagination-controls";

interface User {
  id: string;
  nickname: string;
  email: string;
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
  const [searchField, setSearchField] = useState<"nickname" | "email">("nickname");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>("");
  const [schools, setSchools] = useState<Array<{ id: string; name: string }>>([]);
  
  // 操作菜单状态
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  
  // 防抖定时器引用
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 加载学校列表（用于筛选器）
  useEffect(() => {
    const fetchSchools = async () => {
      try {
        const response = await fetch("/api/schools/list");
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

  // 防抖处理搜索输入
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery]);

  // 加载用户列表
  const fetchUsers = async () => {
    if (!currentUser?.id) return;

    setIsLoading(true);
    try {
      // 从 URL 获取分页参数
      const currentPage = parseInt(searchParams.get("page") || "1", 10);
      
      // 构建查询参数
      const params = new URLSearchParams();
      params.append("userId", currentUser.id);
      params.append("page", currentPage.toString());
      params.append("limit", "10");
      
      if (roleFilter !== "all") {
        params.append("role", roleFilter);
      }
      
      if (schoolFilter !== "all") {
        params.append("schoolId", schoolFilter);
      }
      
      if (debouncedSearchQuery.trim()) {
        params.append("search", debouncedSearchQuery.trim());
        params.append("field", searchField);
      }

      const response = await fetch(`/api/admin/users?${params.toString()}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || "获取用户列表失败");
      }

      if (data.success) {
        setUsers(data.data || []);
        setPagination(data.pagination || null);
      }
    } catch (error) {
      console.error("获取用户列表失败:", error);
      toast.error(error instanceof Error ? error.message : "获取用户列表失败");
    } finally {
      setIsLoading(false);
    }
  };

  // 当筛选条件、搜索关键词或分页变化时，重新加载用户列表
  useEffect(() => {
    fetchUsers();
  }, [currentUser?.id, roleFilter, schoolFilter, debouncedSearchQuery, searchField, searchParams]);

  // 获取角色 Badge 样式
  const getRoleBadge = (role: string) => {
    switch (role) {
      case "SUPER_ADMIN":
        return <Badge variant="error">超级管理员</Badge>;
      case "ADMIN":
        return <Badge variant="warning">校级管理员</Badge>;
      case "STAFF":
        return <Badge variant="info">工作人员</Badge>;
      case "STUDENT":
        return <Badge variant="default">学生</Badge>;
      default:
        return <Badge variant="default">{role}</Badge>;
    }
  };

  // 停用账户（UI 操作，仅提示）
  const handleFreezeAccount = (user: User) => {
    toast.error("停用账户功能暂未实现", {
      icon: "🔒",
    });
    setActionMenuOpen(null);
  };

  // 重置密码（UI 操作，仅提示）
  const handleResetPassword = (user: User) => {
    toast.error("重置密码功能暂未实现", {
      icon: "🔑",
    });
    setActionMenuOpen(null);
  };

  return (
    <AuthGuard requiredRole="SUPER_ADMIN">
      <AdminLayout>
        <div className="p-6">
          <Card
            title="全局用户管理"
            description="查看和管理所有注册用户"
          >
            {/* 筛选器 */}
            <div className="mb-6 flex flex-wrap gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">筛选：</span>
              </div>

              {/* 搜索框 */}
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-gray-500" />
                <select
                  value={searchField}
                  onChange={(e) => setSearchField(e.target.value as "nickname" | "email")}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="nickname">按昵称搜索</option>
                  <option value="email">按邮箱搜索</option>
                </select>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={searchField === "nickname" ? "输入昵称..." : "输入邮箱..."}
                  className="w-64 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              {/* 角色筛选 */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">角色：</label>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
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
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
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

            {/* 数据表格 - 固定高度区域 */}
            <div className="min-h-[500px] flex flex-col">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
                </div>
              ) : users.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="暂无用户数据"
                  description="没有符合条件的用户"
                />
              ) : (
                <>
                  <div className="flex-1 overflow-x-auto">
                    <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[150px]">用户昵称</TableHead>
                        <TableHead className="w-[200px]">电子邮箱</TableHead>
                        <TableHead className="w-[120px]">用户角色</TableHead>
                        <TableHead className="w-[150px]">所属学校</TableHead>
                        <TableHead className="w-[120px]">注册日期</TableHead>
                        <TableHead className="w-[100px]">状态</TableHead>
                        <TableHead className="w-[100px] text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">{user.nickname}</TableCell>
                          <TableCell className="text-sm text-gray-600">{user.email}</TableCell>
                          <TableCell>{getRoleBadge(user.role)}</TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {user.schoolName}
                            {user.schoolCode && (
                              <span className="ml-2 text-xs text-gray-400">
                                ({user.schoolCode})
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {new Date(user.createdAt).toLocaleDateString("zh-CN", {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                            })}
                          </TableCell>
                          <TableCell>
                            {user.status === "active" ? (
                              <Badge variant="success">正常</Badge>
                            ) : (
                              <Badge variant="error">已停用</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="relative">
                              <button
                                onClick={() =>
                                  setActionMenuOpen(actionMenuOpen === user.id ? null : user.id)
                                }
                                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                              {actionMenuOpen === user.id && (
                                <>
                                  <div
                                    className="fixed inset-0 z-10"
                                    onClick={() => setActionMenuOpen(null)}
                                  />
                                  <div className="absolute right-0 top-full z-50 mt-2 w-40 rounded-lg border border-gray-200 bg-white shadow-lg">
                                    <div className="p-1">
                                      <button
                                        onClick={() => handleFreezeAccount(user)}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
                                      >
                                        <Ban className="h-4 w-4" />
                                        停用账户
                                      </button>
                                      <div className="my-1 h-px bg-gray-200"></div>
                                      <button
                                        onClick={() => handleResetPassword(user)}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-blue-600 transition-colors hover:bg-blue-50"
                                      >
                                        <Key className="h-4 w-4" />
                                        重置密码
                                      </button>
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
                  {/* 分页控件 */}
                  {pagination && pagination.total > 0 && (
                    <div className="mt-6 flex justify-center pb-8">
                      <PaginationControls
                        total={pagination.total}
                        pageCount={pagination.pageCount}
                        currentPage={pagination.currentPage}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}


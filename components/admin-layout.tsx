/**
 * 管理员后台布局组件
 * 包含侧边栏、面包屑导航、主内容区
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/use-auth-store";
import {
  LayoutDashboard,
  Map,
  PlusCircle,
  Users,
  Users2,
  AlertTriangle,
  Settings,
  Menu,
  X,
  ChevronRight,
  Tags,
  Building2,
  KeyRound,
  CalendarDays,
  ShoppingBag,
  MessageSquare,
  LogOut,
  Loader2,
} from "lucide-react";
import toast from "react-hot-toast";

interface AdminLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
  /** 审核相关：仅 ADMIN/STAFF，明确排除 SUPER_ADMIN */
  auditOnly?: boolean;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, initializeAuth, isInitialized, isLoggingOut } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 加载当前用户信息（使用统一的初始化逻辑）
  
  useEffect(() => {
    // 如果还未初始化，调用统一的初始化函数
    if (!isInitialized) {
      initializeAuth();
    }
  }, [isInitialized, initializeAuth]);

  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  const isAdmin = currentUser?.role === "ADMIN" || isSuperAdmin;

  // 导航菜单项
  const navItems: NavItem[] = [
    {
      name: "控制台",
      href: "/admin",
      icon: LayoutDashboard,
      roles: ["ADMIN", "STAFF"], // 校级管理员和工作人员
    },
    {
      name: "POI 管理",
      href: "/admin/school/pois",
      icon: PlusCircle,
      roles: ["ADMIN"], // 仅校级管理员，超级管理员不应介入具体学校的内容运营
    },
    {
      name: "分类管理",
      href: "/admin/school/categories",
      icon: Tags,
      roles: ["ADMIN", "STAFF"], // 校级管理员和校内工作人员
    },
    {
      name: "校区管理",
      href: "/admin/school/campuses",
      icon: Building2,
      roles: ["ADMIN"], // 仅校级管理员，STAFF 不可见
    },
    {
      name: "活动管理",
      href: "/admin/school/activities",
      icon: CalendarDays,
      roles: ["ADMIN", "STAFF"],
    },
    {
      name: "生存集市",
      href: "/admin/school/market",
      icon: ShoppingBag,
      roles: ["ADMIN", "STAFF"],
    },
    {
      name: "留言管理",
      href: "/admin/school/comments",
      icon: MessageSquare,
      roles: ["ADMIN", "STAFF"],
    },
    {
      name: "团队管理",
      href: "/admin/team",
      icon: Users,
      roles: ["ADMIN"], // 只有校级管理员，超级管理员不需要
    },
    {
      name: "用户管理",
      href: "/admin/school/users",
      icon: Users2,
      roles: ["ADMIN"],
    },
    {
      name: "举报审核",
      href: "/admin/audit",
      icon: AlertTriangle,
      roles: ["ADMIN", "STAFF"],
      auditOnly: true,
    },
    {
      name: "留言审核",
      href: "/admin/audit/comments",
      icon: AlertTriangle,
      roles: ["ADMIN", "STAFF"],
      auditOnly: true,
    },
  ];

  // 超级管理员专用菜单
  const superAdminItems: NavItem[] = [
    {
      name: "系统看板",
      href: "/super-admin",
      icon: Settings,
      roles: ["SUPER_ADMIN"],
    },
    {
      name: "学校管理",
      href: "/super-admin/schools",
      icon: Building2,
      roles: ["SUPER_ADMIN"],
    },
    {
      name: "邀请码管理",
      href: "/super-admin/invitation-codes",
      icon: KeyRound,
      roles: ["SUPER_ADMIN"],
    },
    {
      name: "用户管理",
      href: "/super-admin/users",
      icon: Users,
      roles: ["SUPER_ADMIN"],
    },
    {
      name: "全局分类管理",
      href: "/super-admin/categories",
      icon: Tags,
      roles: ["SUPER_ADMIN"],
    },
    {
      name: "集市分类管理",
      href: "/super-admin/categories/market",
      icon: ShoppingBag,
      roles: ["SUPER_ADMIN"],
    },
    {
      name: "屏蔽词管理",
      href: "/super-admin/keywords",
      icon: AlertTriangle,
      roles: ["SUPER_ADMIN"],
    },
  ];

  // 过滤菜单项（根据角色）
  const filteredNavItems = [
    ...(isSuperAdmin ? superAdminItems : []),
    ...navItems.filter((item) => {
      if (item.auditOnly && currentUser?.role === "SUPER_ADMIN") return false;
      if (!item.roles) return true;
      return item.roles.includes(currentUser?.role || "");
    }),
  ];

  // 生成面包屑
  const getBreadcrumbs = () => {
    const paths = pathname.split("/").filter(Boolean);
    const breadcrumbs = [{ name: "首页", href: "/" }];

    if (paths[0] === "admin") {
      breadcrumbs.push({ name: "管理后台", href: "/admin" });
      if (paths.length === 1) {
        // 控制台页面
        breadcrumbs.push({ name: "控制台", href: "/admin" });
      } else if (paths[1] === "school") {
        if (paths[2] === "pois") {
          breadcrumbs.push({ name: "POI 管理", href: "/admin/school/pois" });
        } else if (paths[2] === "categories") {
          breadcrumbs.push({ name: "分类管理", href: "/admin/school/categories" });
        } else if (paths[2] === "campuses") {
          breadcrumbs.push({ name: "校区管理", href: "/admin/school/campuses" });
        } else if (paths[2] === "activities") {
          breadcrumbs.push({ name: "活动管理", href: "/admin/school/activities" });
        } else if (paths[2] === "market") {
          breadcrumbs.push({ name: "生存集市", href: "/admin/school/market" });
        } else if (paths[2] === "comments") {
          breadcrumbs.push({ name: "留言管理", href: "/admin/school/comments" });
        } else if (paths[2] === "users") {
          breadcrumbs.push({ name: "用户管理", href: "/admin/school/users" });
        }
      } else if (paths[1] === "team") {
        breadcrumbs.push({ name: "团队管理", href: "/admin/team" });
      } else if (paths[1] === "audit") {
        breadcrumbs.push({ name: "举报审核", href: "/admin/audit" });
      }
      } else if (paths[0] === "super-admin") {
        breadcrumbs.push({ name: "超级管理员", href: "/super-admin" });
        if (paths[1] === "schools") {
          breadcrumbs.push({ name: "学校管理", href: "/super-admin/schools" });
        } else if (paths[1] === "invitation-codes") {
          breadcrumbs.push({ name: "邀请码管理", href: "/super-admin/invitation-codes" });
        } else if (paths[1] === "users") {
          breadcrumbs.push({ name: "用户管理", href: "/super-admin/users" });
        } else if (paths[1] === "categories") {
          if (paths[2] === "market") {
            breadcrumbs.push({ name: "全局分类管理", href: "/super-admin/categories" });
            breadcrumbs.push({ name: "集市分类管理", href: "/super-admin/categories/market" });
          } else if (paths[2] === "all") {
            breadcrumbs.push({ name: "全局分类管理", href: "/super-admin/categories" });
            breadcrumbs.push({ name: "全量分类监控", href: "/super-admin/categories/all" });
          } else {
            breadcrumbs.push({ name: "全局分类管理", href: "/super-admin/categories" });
          }
        } else if (paths[1] === "keywords") {
          breadcrumbs.push({ name: "屏蔽词管理", href: "/super-admin/keywords" });
        }
      }

    return breadcrumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  const handleLogout = async () => {
    if (isLoggingOut) return;
    toast.loading("正在退出...", { id: "logout" });
    try {
      await useAuthStore.getState().logout();
    } catch (error) {
      if (error instanceof Error && !error.message.includes("NEXT_REDIRECT")) {
        toast.error("退出登录失败，请重试", { id: "logout" });
        console.error("退出登录失败:", error);
      }
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50">
      {/* 侧边栏 */}
      <aside
        className={`fixed left-0 below-nav bottom-0 z-sidebar w-64 flex-shrink-0 border-r overflow-y-auto bg-white shadow-lg transition-transform duration-300 lg:static lg:top-auto lg:bottom-auto lg:h-full lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full min-h-0 flex-col">
          {/* 侧边栏头部 */}
          <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-200 px-6">
            <h2 className="text-lg font-bold text-gray-900">管理后台</h2>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-gray-500 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* 导航菜单（仅侧边栏内部滚动，与主内容区独立） */}
          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto scrollbar-theme px-3 py-4">
            {filteredNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[#FFE5DD] text-[#FF4500]"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* 侧边栏底部 */}
          <div className="border-t border-gray-200 p-4 space-y-3">
            <div className="text-sm text-gray-600">
              <div className="font-medium text-gray-900">{currentUser?.nickname}</div>
              <div className="text-xs text-gray-500">
                {isSuperAdmin ? "超级管理员" : "校级管理员"}
              </div>
            </div>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoggingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              退出登录
            </button>
          </div>
        </div>
      </aside>

      {/* 遮罩层（移动端，低于侧边栏，高于主内容） */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[44] bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        {/* 面包屑导航（固定，不滚动） */}
        <div className="flex-shrink-0 border-b border-gray-200 bg-white px-4 py-3 lg:px-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-gray-500 hover:text-gray-700"
            >
              <Menu className="h-6 w-6" />
            </button>

            {/* 面包屑导航 */}
            <nav className="flex items-center gap-2 text-sm text-gray-600">
              {breadcrumbs.map((crumb, index) => (
                <div key={`${crumb.href}-${index}`} className="flex items-center gap-2">
                  {index > 0 && <ChevronRight className="h-4 w-4" />}
                  {index === breadcrumbs.length - 1 ? (
                    <span className="font-medium text-gray-900">{crumb.name}</span>
                  ) : (
                    <Link
                      href={crumb.href}
                      className="hover:text-gray-900"
                    >
                      {crumb.name}
                    </Link>
                  )}
                </div>
              ))}
            </nav>
          </div>
        </div>

        {/* 内容区域：overflow-y-auto 仅在需要时显示滚动条，scrollbar-gutter 防止布局抖动，pb-24 底部留白（用 padding 避免触发外层滚动条） */}
        <main
          className={`min-h-0 flex-1 overflow-x-hidden bg-slate-50 scrollbar-gutter-stable pb-24 ${
            pathname?.includes("/campuses") ||
            pathname?.includes("/pois") ||
            pathname?.includes("/super-admin/categories")
              ? "overflow-hidden"
              : "overflow-y-auto"
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}


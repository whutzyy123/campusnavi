"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { EmptyState } from "@/components/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/table";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { SearchInput } from "@/components/shared/search-input";
import { useAuthStore } from "@/store/use-auth-store";
import { getUserLostFoundEvents } from "@/lib/lost-found-actions";
import { useDebounce } from "@/hooks/use-debounce";
import { Loader2, MapPin, ExternalLink, Info } from "lucide-react";

interface LostFoundRow {
  id: string;
  poiId: string;
  description: string;
  contactInfo: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
  poi: { id: string; name: string };
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHour < 24) return `${diffHour} 小时前`;
  if (diffDay < 7) return `${diffDay} 天前`;
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "进行中";
    case "FOUND":
      return "已找到";
    case "EXPIRED":
      return "已过期";
    default:
      return status;
  }
}

function LostFoundContent() {
  const { currentUser } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = 10;

  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") ?? "");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const [items, setItems] = useState<LostFoundRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (debouncedSearch.trim()) {
      params.set("q", debouncedSearch.trim());
      params.set("page", "1");
    } else {
      params.delete("q");
    }
    const query = params.toString();
    const next = `${pathname}${query ? `?${query}` : ""}`;
    if (window.location.pathname + window.location.search !== next) {
      router.replace(next, { scroll: false });
    }
  }, [debouncedSearch, pathname, router, searchParams]);

  useEffect(() => {
    const fetchData = async () => {
      if (!currentUser?.id) return;
      setIsLoading(true);
      try {
        const result = await getUserLostFoundEvents(currentUser.id);
        if (result.success && result.data) {
          const rows: LostFoundRow[] = result.data.map((e) => ({
            id: e.id,
            poiId: e.poiId,
            description: e.description,
            contactInfo: e.contactInfo,
            status: e.status,
            expiresAt: e.expiresAt,
            createdAt: e.createdAt,
            poi: e.poi,
          }));
          setItems(rows);
        } else {
          setItems([]);
        }
      } catch {
        setItems([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [currentUser?.id]);

  const { pagedItems, total, pageCount, currentPage } = useMemo(() => {
    const keyword = debouncedSearch.trim().toLowerCase();
    const filtered =
      keyword === ""
        ? items
        : items.filter(
            (e) =>
              e.description.toLowerCase().includes(keyword) ||
              e.poi.name.toLowerCase().includes(keyword)
          );
    const totalCount = filtered.length;
    const count = Math.max(1, Math.ceil(totalCount / pageSize));
    const safePage = Math.min(Math.max(1, page), count);
    const start = (safePage - 1) * pageSize;
    const end = start + pageSize;
    return {
      pagedItems: filtered.slice(start, end),
      total: totalCount,
      pageCount: count,
      currentPage: safePage,
    };
  }, [items, debouncedSearch, page, pageSize]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF4500]" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Info}
        title="暂无失物招领记录"
        description="在 POI 详情中发布失物招领后，这里会展示您的记录。"
      />
    );
  }

  if (total === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 pb-24">
        <h1 className="mb-6 text-2xl font-bold text-[#1A1A1B]">失物招领</h1>
        <div className="mb-4">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="按物品描述或地点搜索..."
            className="w-full max-w-md"
          />
        </div>
        <EmptyState
          icon={Info}
          title="没有找到匹配的搜索结果"
          description="请尝试更换关键词，或清空搜索框查看全部记录。"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 pb-24">
      <h1 className="mb-6 text-2xl font-bold text-[#1A1A1B]">失物招领</h1>
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="按物品描述或地点搜索..."
          className="w-full max-w-md"
        />
        <div className="rounded-lg border border-[#EDEFF1] bg-white px-4 py-2 text-sm text-[#7C7C7C]">
          共 {total} 条记录
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-[#EDEFF1] bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>物品描述</TableHead>
              <TableHead responsiveHide="sm">地点</TableHead>
              <TableHead responsiveHide="sm">状态</TableHead>
              <TableHead responsiveHide="lg">发布时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedItems.map((event) => {
              const isExpiredByTime = new Date() > new Date(event.expiresAt);
              const displayStatus = isExpiredByTime ? "EXPIRED" : event.status;
              const statusLabel = isExpiredByTime ? "已过期" : getStatusLabel(event.status);
              const statusClass =
                displayStatus === "ACTIVE"
                  ? "bg-green-100 text-green-800"
                  : displayStatus === "FOUND"
                  ? "bg-[#FFE5DD] text-[#FF4500]"
                  : "bg-slate-100 text-slate-600";

              return (
                <TableRow key={event.id}>
                  <TableCell className="max-w-xs">
                    <div className="truncate text-sm font-medium text-[#1A1A1B]">
                      {event.description}
                    </div>
                  </TableCell>
                  <TableCell responsiveHide="sm" className="text-xs text-[#7C7C7C]">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      <span className="truncate max-w-[160px]">{event.poi.name}</span>
                    </span>
                  </TableCell>
                  <TableCell responsiveHide="sm">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </TableCell>
                  <TableCell responsiveHide="lg" className="text-xs text-[#7C7C7C]">
                    {formatRelativeTime(event.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    {isExpiredByTime ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500">
                        <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                        已过期
                      </span>
                    ) : (
                      <Link
                        href={`/?poiId=${event.poi.id}&lostFoundId=${event.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#EDEFF1] px-3 py-1.5 text-xs font-medium text-[#1A1A1B] transition-colors hover:border-[#FF4500] hover:bg-[#FFE5DD] hover:text-[#FF4500]"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        查看详情
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {pageCount > 1 && (
        <div className="mt-4">
          <PaginationControls
            total={total}
            pageCount={pageCount}
            currentPage={currentPage}
            limit={pageSize}
          />
        </div>
      )}
    </div>
  );
}

export default function LostFoundPage() {
  return (
    <AuthGuard requiredRole="STUDENT">
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#FF4500]" />
          </div>
        }
      >
        <LostFoundContent />
      </Suspense>
    </AuthGuard>
  );
}


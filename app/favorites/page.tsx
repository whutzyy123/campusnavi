"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { EmptyState } from "@/components/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/table";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { getMyFavorites, type FavoritePOIItem } from "@/lib/favorite-actions";
import { Heart, Loader2, MapPin, ExternalLink } from "lucide-react";
import { formatDate } from "@/lib/utils";

function FavoritesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = 10;

  const [items, setItems] = useState<FavoritePOIItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState<{
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } | null>(null);

  const fetchFavorites = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getMyFavorites({ page, limit });
      if (result.success && result.data) {
        setItems(result.data.data);
        setPagination(result.data.pagination);
      } else {
        setItems([]);
        setPagination(null);
      }
    } catch {
      setItems([]);
      setPagination(null);
    } finally {
      setIsLoading(false);
    }
  }, [page, limit]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

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
        icon={Heart}
        title="暂无收藏"
        description="在地图中点击 POI 详情，收藏您常用的地点"
        action={{
          label: "去地图逛逛",
          onClick: () => router.push("/"),
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 pb-24">
      <h1 className="mb-6 text-2xl font-bold text-[#1A1A1B]">我的收藏</h1>
      <div className="mb-4 rounded-lg border border-[#EDEFF1] bg-white px-4 py-2 text-sm text-[#7C7C7C]">
        共 {pagination?.total ?? 0} 个收藏地点
      </div>
      <div className="overflow-x-auto rounded-lg border border-[#EDEFF1] bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>POI 名称</TableHead>
              <TableHead responsiveHide="sm">分类</TableHead>
              <TableHead responsiveHide="sm">学校</TableHead>
              <TableHead responsiveHide="lg">收藏时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <span className="font-medium text-[#1A1A1B]">{item.poiName}</span>
                </TableCell>
                <TableCell responsiveHide="sm" className="text-gray-600">
                  {item.poiCategory}
                </TableCell>
                <TableCell responsiveHide="sm" className="text-gray-600">
                  {item.schoolName}
                </TableCell>
                <TableCell responsiveHide="lg" className="text-gray-500">
                  {formatDate(item.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/?poiId=${item.poiId}&openDrawer=true`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#EDEFF1] px-3 py-1.5 text-sm font-medium text-[#1A1A1B] transition-colors hover:border-[#FF4500] hover:bg-[#FFE5DD] hover:text-[#FF4500]"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    查看
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {pagination && pagination.totalPages > 1 && (
        <div className="mt-4">
          <PaginationControls
            total={pagination.total}
            pageCount={pagination.totalPages}
            currentPage={pagination.page}
            limit={pagination.limit}
          />
        </div>
      )}
    </div>
  );
}

export default function FavoritesPage() {
  return (
    <AuthGuard requiredRole="STUDENT">
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#FF4500]" />
          </div>
        }
      >
        <FavoritesContent />
      </Suspense>
    </AuthGuard>
  );
}

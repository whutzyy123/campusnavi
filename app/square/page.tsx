"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  ShoppingBag,
  Calendar,
  Package,
  MapPin,
  Heart,
  MessageCircle,
  Compass,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/core/utils";
import { formatRelativeTime } from "@/lib/core/utils";
import { useAuthStore } from "@/store/use-auth-store";
import { useSchoolStore } from "@/store/use-school-store";
import {
  getSquarePosts,
  type SquarePostItem,
} from "@/lib/actions/square-post";
import { PageEmpty, PageLoading } from "@/components/ui/page-state";
import { FeedList } from "@/components/shared/feed-list";
import { Skeleton } from "@/components/ui/skeleton";

const featureButtons = [
  { label: "生存集市", href: "/center/market", icon: ShoppingBag },
  { label: "校园活动", href: "/activities", icon: Calendar },
  { label: "失物招领", href: "/lost-found", icon: Package },
];

const PAGE_SIZE = 10;

function SquarePostSkeleton() {
  return (
    <article className="space-y-3 rounded-2xl border border-[#EDEFF1] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </article>
  );
}

function SquareContent() {
  const router = useRouter();
  const { currentUser, isAuthenticated } = useAuthStore();
  const { activeSchool } = useSchoolStore();
  const schoolId = activeSchool?.id ?? currentUser?.schoolId ?? "";

  const [posts, setPosts] = useState<SquarePostItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPosts = useCallback(
    async (pageNum: number, append: boolean) => {
      if (!schoolId) return;
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setError(null);
      }
      try {
        const result = await getSquarePosts(schoolId, {
          page: pageNum,
          limit: PAGE_SIZE,
        });
        if (result.success && result.data) {
          setPosts((prev) =>
            append ? [...prev, ...result.data!.posts] : result.data!.posts
          );
          setTotalPages(result.data.pagination.totalPages);
          if (!append) setError(null);
        } else if (!append) {
          setPosts([]);
          setError(result.error ?? "加载帖子失败");
        }
      } catch {
        if (!append) {
          setPosts([]);
          setError("加载帖子失败，请稍后重试");
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [schoolId]
  );

  useEffect(() => {
    if (schoolId) {
      fetchPosts(1, false);
    }
  }, [schoolId, fetchPosts]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPosts(nextPage, true);
  };

  const hasMore = page < totalPages;

  return (
    <div className="min-h-full bg-[#F6F7F8] px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-4">
        {/* 发布帖子入口 — 醒目大 + 按钮 */}
        {isAuthenticated && (
          <Link
            href="/square/post"
            className={cn(
              "flex flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF4500] to-[#E03E00]",
              "h-24 shadow-lg shadow-[#FF4500]/25",
              "transition-all hover:shadow-xl hover:shadow-[#FF4500]/30 hover:from-[#FF5722] hover:to-[#FF4500] active:scale-[0.98]"
            )}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
              <Plus className="h-6 w-6 text-white" strokeWidth={2.5} />
            </div>
            <p className="mt-2 text-sm font-semibold text-white">发布帖子</p>
          </Link>
        )}

        {/* 快捷入口 */}
        <div className="rounded-xl border border-[#EDEFF1] bg-white p-4 shadow-sm">
          <div className="grid grid-cols-3 gap-3">
            {featureButtons.map((btn) => {
              const Icon = btn.icon;
              return (
                <Link
                  key={btn.label}
                  href={btn.href}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl py-3 transition-all",
                    "hover:bg-[#FFE5DD] active:scale-[0.98]"
                  )}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFE5DD] text-[#FF4500]">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <span className="text-xs font-medium text-[#1A1A1B]">
                    {btn.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* 帖子列表 */}
        <FeedList
          items={posts}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          error={error}
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
          onRetry={() => fetchPosts(1, false)}
          renderItem={(post) => <SquarePostCard post={post} />}
          getItemKey={(post) => post.id}
          renderSkeleton={() => <SquarePostSkeleton />}
          empty={
            <PageEmpty
              icon={Compass}
              title="广场还很安静"
              description="成为第一个发帖的人吧"
              action={
                isAuthenticated
                  ? { label: "发布帖子", onClick: () => router.push("/square/post") }
                  : undefined
              }
              className="rounded-2xl border border-[#EDEFF1] bg-white shadow-sm"
            />
          }
        />
      </div>
    </div>
  );
}

function SquarePostCard({ post }: { post: SquarePostItem }) {
  const images = Array.isArray(post.images) ? post.images : [];

  return (
    <article className="rounded-2xl border border-[#EDEFF1] bg-white p-4 shadow-sm transition-all hover:shadow-md">
      {/* 用户信息行 */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFE5DD] text-[#FF4500] text-sm font-bold overflow-hidden">
          {post.user.avatar ? (
            <img
              src={post.user.avatar}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            (post.user.nickname ?? "?")[0]
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-[#1A1A1B] truncate">
              {post.user.nickname ?? "匿名用户"}
            </p>
            {post.scope === "INTER" && (
              <span className="inline-flex items-center gap-0.5 shrink-0 rounded-md bg-[#FFF5F0] px-1.5 py-0.5 text-[10px] font-medium text-[#FF4500]">
                <Globe className="h-2.5 w-2.5" />
                校际
              </span>
            )}
          </div>
          <p className="text-xs text-[#B0B0B0]">
            {formatRelativeTime(
              post.createdAt instanceof Date
                ? post.createdAt.toISOString()
                : String(post.createdAt)
            )}
            {post.scope === "INTER" && post.school?.name && (
              <span className="ml-1.5">· {post.school.name}</span>
            )}
          </p>
        </div>
      </div>

      {/* 标题 */}
      <h3 className="mt-3 text-base font-semibold text-[#1A1A1B] line-clamp-2">
        {post.title}
      </h3>

      {/* 内容 */}
      <p className="mt-1.5 text-sm text-[#5A5A5A] line-clamp-3 leading-relaxed">
        {post.content}
      </p>

      {/* 图片网格 */}
      {images.length > 0 && (
        <div
          className={cn(
            "mt-3 grid gap-1.5",
            images.length === 1
              ? "grid-cols-1"
              : images.length <= 4
                ? "grid-cols-2"
                : "grid-cols-3"
          )}
        >
          {images.slice(0, 9).map((src, i) => (
            <div
              key={i}
              className={cn(
                "relative overflow-hidden rounded-lg bg-[#F6F7F8]",
                images.length === 1
                  ? "aspect-[16/10]"
                  : "aspect-square"
              )}
            >
              <img
                src={src}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      )}

      {/* POI 标签 */}
      {post.poi && (
        <div className="mt-3 inline-flex items-center gap-1 rounded-lg bg-[#FFE5DD] px-2.5 py-1 text-xs font-medium text-[#FF4500]">
          <MapPin className="h-3 w-3" />
          {post.poi.name}
        </div>
      )}

      {/* 互动栏 */}
      <div className="mt-3 flex items-center gap-5 border-t border-[#F6F7F8] pt-2.5">
        <span className="inline-flex items-center gap-1 text-xs text-[#7C7C7C]">
          <Heart className="h-3.5 w-3.5" />
          {post.likeCount > 0 ? post.likeCount : "点赞"}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-[#7C7C7C]">
          <MessageCircle className="h-3.5 w-3.5" />
          {post.commentCount > 0 ? post.commentCount : "评论"}
        </span>
      </div>
    </article>
  );
}

export default function SquarePage() {
  return (
    <Suspense fallback={<PageLoading className="flex min-h-[50vh] items-center justify-center" />}>
      <SquareContent />
    </Suspense>
  );
}

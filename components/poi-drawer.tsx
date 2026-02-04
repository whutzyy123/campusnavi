/**
 * POI 详情抽屉组件
 * 用于显示 POI 信息和实时状态上报
 * 支持移动端手势关闭和动画
 */

"use client";

import { useState, useEffect, useMemo, memo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertCircle, Flag, Navigation, MessageCircle, Trash2, Reply, X as XIcon, ChevronDown, ChevronUp } from "lucide-react";
import { useAuthStore } from "@/store/use-auth-store";
import { useNavigationStore } from "@/store/use-navigation-store";
import type { POIWithStatus, POIStatus } from "@/lib/poi-utils";
import { getStatusText, getStatusColor, getCategoryIcon } from "@/lib/poi-utils";
import toast from "react-hot-toast";

interface POIDrawerProps {
  poi: POIWithStatus | null;
  schoolId: string;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdate?: () => void;
  userLocation?: [number, number]; // 用户当前位置
}

interface CommentItem {
  id: string;
  content: string;
  createdAt: string;
  reportCount: number;
  isHidden: boolean;
  parentId?: string | null;
  user: {
    id: string;
    nickname: string | null;
    avatar: string | null;
  };
  parent?: {
    id: string;
    user: {
      id: string;
      nickname: string | null;
    };
  } | null;
  replies?: CommentItem[]; // 树形结构中的子回复
}

/**
 * 将平铺的留言数组转换为树形结构
 * @param flatComments 平铺的留言数组
 * @returns 树形结构的留言数组（只包含顶级留言，子回复在 replies 中）
 */
function buildCommentTree(flatComments: CommentItem[]): CommentItem[] {
  // 创建 ID 到留言的映射
  const commentMap = new Map<string, CommentItem>();
  const rootComments: CommentItem[] = [];

  // 第一遍：创建所有留言的副本，初始化 replies 数组
  flatComments.forEach((comment) => {
    commentMap.set(comment.id, {
      ...comment,
      replies: [],
    });
  });

  // 第二遍：构建树形结构
  flatComments.forEach((comment) => {
    const node = commentMap.get(comment.id)!;
    
    if (!comment.parentId) {
      // 顶级留言
      rootComments.push(node);
    } else {
      // 子回复：添加到父留言的 replies 中
      const parent = commentMap.get(comment.parentId);
      if (parent) {
        if (!parent.replies) {
          parent.replies = [];
        }
        parent.replies.push(node);
      } else {
        // 父留言不存在（可能已被删除），作为顶级留言处理
        rootComments.push(node);
      }
    }
  });

  // 按创建时间排序：顶级留言倒序，回复正序
  rootComments.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // 递归排序所有子回复
  const sortReplies = (comments: CommentItem[]) => {
    comments.forEach((comment) => {
      if (comment.replies && comment.replies.length > 0) {
        comment.replies.sort((a, b) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        sortReplies(comment.replies);
      }
    });
  };

  sortReplies(rootComments);

  return rootComments;
}

export function POIDrawer({ poi, schoolId, isOpen, onClose, onStatusUpdate, userLocation }: POIDrawerProps) {
  const router = useRouter();
  const { isAuthenticated, currentUser } = useAuthStore();
  const { setStartPoint, setEndPoint, startNavigation } = useNavigationStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState<string>("");
  const [reportDescription, setReportDescription] = useState<string>("");
  const [isReporting, setIsReporting] = useState(false);

  // 留言相关状态
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  
  // 回复相关状态：记录正在回复的留言ID和回复内容
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});
  const [isSubmittingReply, setIsSubmittingReply] = useState<Record<string, boolean>>({});

  // 加载留言列表
  useEffect(() => {
    const fetchComments = async () => {
      if (!poi || !isOpen) return;
      setIsLoadingComments(true);
      try {
        const response = await fetch(`/api/comments?poiId=${poi.id}&page=1&limit=20`);
        const data = await response.json();
        if (data.success) {
          // 将平铺结构转换为树形结构
          const treeComments = buildCommentTree(data.comments);
          setComments(treeComments);
        }
      } catch (error) {
        console.error("获取留言列表失败:", error);
      } finally {
        setIsLoadingComments(false);
      }
    };

    fetchComments();
  }, [poi?.id, isOpen]);

  // 计算总留言数（包括回复）
  const totalCommentCount = useMemo(() => {
    const countReplies = (comments: CommentItem[]): number => {
      return comments.reduce((sum, comment) => {
        return sum + 1 + (comment.replies ? countReplies(comment.replies) : 0);
      }, 0);
    };
    return countReplies(comments);
  }, [comments]);

  // 处理回复提交
  const handleReplySubmit = async (parentCommentId: string) => {
    if (!poi) {
      toast.error("POI 信息不存在");
      return;
    }
    
    const content = replyContent[parentCommentId]?.trim();
    if (!content) {
      toast.error("回复内容不能为空");
      return;
    }
    if (content.length > 500) {
      toast.error("回复内容过长（最多 500 字）");
      return;
    }

    setIsSubmittingReply((prev) => ({ ...prev, [parentCommentId]: true }));
    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          poiId: poi.id,
          content,
          parentId: parentCommentId,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "发送失败");
      }
      
      // 重新加载留言列表以获取最新数据（包括回复）
      const refreshResponse = await fetch(`/api/comments?poiId=${poi.id}&page=1&limit=20`);
      const refreshData = await refreshResponse.json();
      if (refreshData.success) {
        const treeComments = buildCommentTree(refreshData.comments);
        setComments(treeComments);
      }
      
      // 清除回复状态
      setReplyingTo(null);
      setReplyContent((prev) => {
        const newState = { ...prev };
        delete newState[parentCommentId];
        return newState;
      });
      toast.success("回复已发表");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "发送失败，请重试"
      );
    } finally {
      setIsSubmittingReply((prev) => ({ ...prev, [parentCommentId]: false }));
    }
  };

  if (!poi) return null;

  const CategoryIcon = getCategoryIcon(poi.category);
  const currentStatusVal = poi.currentStatus?.val || 2; // 默认正常
  const currentStatusText = getStatusText(currentStatusVal);
  const statusColor = getStatusColor(currentStatusVal);

  // 上报状态
  const handleStatusSubmit = async (val: number) => {
    // 检查用户是否已登录
    if (!isAuthenticated) {
      setSubmitMessage({ type: "error", text: "请先登录后再上报状态" });
      setTimeout(() => {
        router.push("/login");
      }, 1500);
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage(null);

    try {
      const response = await fetch("/api/pois/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          poiId: poi.id,
          schoolId,
          statusType: "拥挤度",
          val,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // 处理429错误（防刷限制）
        if (response.status === 429) {
          toast.error(data.message || "操作太快了，请稍后再试", {
            duration: 3000,
          });
          return;
        }
        throw new Error(data.message || "上报失败");
      }

      toast.success("状态上报成功！");
      if (onStatusUpdate) {
        onStatusUpdate();
      }
    } catch (error) {
      // 网络错误或其他错误
      if (error instanceof Error && error.message.includes("fetch")) {
        toast.error("网络错误，请检查网络连接后重试");
      } else {
        toast.error(error instanceof Error ? error.message : "上报失败，请重试");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // 处理举报
  const handleReport = async () => {
    if (!reportReason) {
      toast.error("请选择举报原因");
      return;
    }

    setIsReporting(true);

    try {
      const response = await fetch("/api/audit/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          poiId: poi.id,
          reason: reportReason,
          description: reportDescription || undefined,
          userId: currentUser?.id || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "举报失败");
      }

      toast.success("举报成功，感谢您的反馈！");
      setShowReportModal(false);
      setReportReason("");
      setReportDescription("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "举报失败，请重试");
    } finally {
      setIsReporting(false);
    }
  };

  const statusOptions: { val: number; label: POIStatus; color: string }[] = [
    { val: 1, label: "空闲", color: "#52c41a" },
    { val: 2, label: "正常", color: "#1890ff" },
    { val: 3, label: "拥挤", color: "#faad14" },
    { val: 4, label: "爆满", color: "#ff4d4f" },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 遮罩层 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50"
            onClick={onClose}
          />

          {/* 抽屉 */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100) {
                onClose();
              }
            }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-white shadow-2xl"
          >
            <div className="flex h-full flex-col">
              {/* 头部 */}
              <div className="border-b border-[#EDEFF1] bg-white px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CategoryIcon className="h-6 w-6 text-[#FF4500]" />
                    <h2 className="text-xl font-bold text-[#1A1A1B]">{poi.name}</h2>
                  </div>
                  <button
                    onClick={onClose}
                    className="text-[#7C7C7C] hover:text-[#1A1A1B]"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* 内容 */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* POI 基本信息 */}
                <div className="mb-6">
                  <div className="mb-4">
                    <span className="text-sm font-medium text-gray-500">分类</span>
                    <p className="mt-1 text-lg font-medium text-gray-800">{poi.category}</p>
                  </div>
                  {poi.description && (
                    <div className="mb-4">
                      <span className="text-sm font-medium text-gray-500">描述</span>
                      <p className="mt-1 text-gray-700">{poi.description}</p>
                    </div>
                  )}
                </div>

                {/* 当前状态 */}
                <div className="mb-6 rounded-lg border border-[#EDEFF1] bg-white p-4">
                  <h3 className="mb-3 text-sm font-medium text-[#1A1A1B]">当前状态</h3>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: statusColor }}
                    />
                    <span className="font-medium" style={{ color: statusColor }}>
                      {currentStatusText}
                    </span>
                    {poi.currentStatus && (
                      <>
                        {poi.currentStatus.sampleCount !== undefined && poi.currentStatus.sampleCount > 0 ? (
                          <span className="ml-auto text-xs text-[#7C7C7C]">
                            基于最近 {poi.currentStatus.sampleCount} 条上报
                          </span>
                        ) : (
                          <span className="ml-auto text-xs text-[#7C7C7C]">
                            {new Date(poi.currentStatus.expiresAt).toLocaleTimeString("zh-CN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}{" "}
                            过期
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {poi.currentStatus && poi.currentStatus.sampleCount === 0 && (
                    <p className="mt-2 text-xs text-[#7C7C7C]">
                      暂无最近15分钟内的状态数据，显示为默认状态
                    </p>
                  )}
                </div>

                {/* 状态上报 */}
                <div className="mb-6">
                  <h3 className="mb-3 text-sm font-medium text-[#1A1A1B]">上报当前状态</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {statusOptions.map((option) => (
                      <button
                        key={option.val}
                        onClick={() => handleStatusSubmit(option.val)}
                        disabled={isSubmitting}
                        className="rounded-lg border-2 border-[#EDEFF1] bg-white px-4 py-3 text-sm font-medium transition-colors hover:bg-[#F6F7F8] disabled:cursor-not-allowed disabled:opacity-50 relative"
                        style={{
                          borderColor: currentStatusVal === option.val ? option.color : undefined,
                          backgroundColor: currentStatusVal === option.val ? `${option.color}10` : undefined,
                        }}
                      >
                        {isSubmitting && (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-lg">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#FF4500] border-t-transparent"></div>
                          </div>
                        )}
                        <div className="flex items-center justify-center gap-2">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: option.color }}
                          />
                          <span>{option.label}</span>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* 提交消息 */}
                  {submitMessage && (
                    <div
                      className={`mt-3 rounded-lg p-3 text-sm ${
                        submitMessage.type === "success"
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {submitMessage.text}
                    </div>
                  )}
                </div>

                {/* 留言板 */}
                <div className="mt-6 border-t border-[#EDEFF1] pt-6">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-medium text-[#1A1A1B] flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-[#FF4500]" />
                      留言板
                    </h3>
                    <span className="text-xs text-[#7C7C7C]">
                      {comments.length} 条留言
                      {totalCommentCount > comments.length && (
                        <span className="ml-1 text-[#7C7C7C]">
                          （共 {totalCommentCount} 条）
                        </span>
                      )}
                    </span>
                  </div>

                  {/* 留言列表 */}
                  <div className="mb-4 max-h-64 space-y-2 overflow-y-auto overflow-x-hidden">
                    {isLoadingComments ? (
                      <div className="flex items-center justify-center py-4 text-sm text-[#7C7C7C]">
                        正在加载留言...
                      </div>
                    ) : comments.length === 0 ? (
                      <div className="rounded-lg bg-[#F6F7F8] px-3 py-2 text-center text-xs text-[#7C7C7C]">
                        暂无留言，快来抢沙发吧～
                      </div>
                    ) : (
                      comments.map((comment) => (
                        <CommentItemComponent
                          key={comment.id}
                          comment={comment}
                          currentUser={currentUser}
                          isAuthenticated={isAuthenticated}
                          replyingTo={replyingTo}
                          setReplyingTo={setReplyingTo}
                          replyContent={replyContent}
                          setReplyContent={setReplyContent}
                          isSubmittingReply={isSubmittingReply}
                          onReplySubmit={handleReplySubmit}
                          onDelete={async () => {
                            if (!confirm("确定要删除这条留言吗？此操作不可恢复。")) {
                              return;
                            }
                            try {
                              const response = await fetch(
                                `/api/comments/${comment.id}`,
                                { method: "DELETE" }
                              );
                              const data = await response.json();
                              if (!response.ok) {
                                throw new Error(data.message || "删除失败");
                              }
                              toast.success("留言已删除");
                               // 重新加载留言列表
                               const refreshResponse = await fetch(
                                 `/api/comments?poiId=${poi.id}&page=1&limit=20`
                               );
                               const refreshData = await refreshResponse.json();
                               if (refreshData.success) {
                                 const treeComments = buildCommentTree(refreshData.comments);
                                 setComments(treeComments);
                               }
                            } catch (error) {
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "删除失败，请重试"
                              );
                            }
                          }}
                          onReport={async () => {
                            try {
                              const response = await fetch(
                                `/api/comments/${comment.id}/report`,
                                { method: "POST" }
                              );
                              const data = await response.json();
                              if (!response.ok) {
                                throw new Error(data.message || "举报失败");
                              }
                              // 显示后端返回的详细反馈信息
                              toast.success(data.message || "举报已收到");
                              // 如果内容被自动隐藏，刷新留言列表
                              if (data.isAutoHidden) {
                                const refreshResponse = await fetch(
                                  `/api/comments?poiId=${poi.id}&page=1&limit=20`
                                );
                                const refreshData = await refreshResponse.json();
                                if (refreshData.success) {
                                  const treeComments = buildCommentTree(refreshData.comments);
                                  setComments(treeComments);
                                }
                              }
                            } catch (error) {
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "举报失败，请重试"
                              );
                            }
                          }}
                           onRefreshComments={async () => {
                             const refreshResponse = await fetch(
                               `/api/comments?poiId=${poi.id}&page=1&limit=20`
                             );
                             const refreshData = await refreshResponse.json();
                             if (refreshData.success) {
                               const treeComments = buildCommentTree(refreshData.comments);
                               setComments(treeComments);
                             }
                           }}
                           depth={0}
                           poiId={poi.id}
                        />
                      ))
                    )}
                  </div>

                  {/* 留言输入区域 */}
                  {isAuthenticated ? (
                    <div className="space-y-2">
                      <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="说点什么吧...（最多 500 字）"
                        rows={3}
                        className="w-full rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] px-3 py-2 text-sm focus:border-[#0079D3] focus:outline-none focus:ring-2 focus:ring-[#0079D3]/20"
                      />
                      <div className="flex items-center justify-between text-xs text-[#7C7C7C]">
                        <span>
                          {newComment.length}/500
                        </span>
                        <button
                          onClick={async () => {
                            if (!newComment.trim()) {
                              toast.error("留言内容不能为空");
                              return;
                            }
                            if (newComment.length > 500) {
                              toast.error("留言内容过长（最多 500 字）");
                              return;
                            }
                            setIsSubmittingComment(true);
                            try {
                              const response = await fetch("/api/comments", {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  poiId: poi.id,
                                  content: newComment.trim(),
                                }),
                              });
                              const data = await response.json();
                              if (!response.ok) {
                                throw new Error(data.message || "发送失败");
                              }
                               // 重新加载留言列表以获取最新数据（包括树形结构）
                               const refreshResponse = await fetch(
                                 `/api/comments?poiId=${poi.id}&page=1&limit=20`
                               );
                               const refreshData = await refreshResponse.json();
                               if (refreshData.success) {
                                 const treeComments = buildCommentTree(refreshData.comments);
                                 setComments(treeComments);
                               }
                               setNewComment("");
                               toast.success("留言已发表");
                            } catch (error) {
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "发送失败，请重试"
                              );
                            } finally {
                              setIsSubmittingComment(false);
                            }
                          }}
                          disabled={isSubmittingComment}
                          className="flex items-center gap-1 rounded-full bg-[#FF4500] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isSubmittingComment ? "发送中..." : "发送"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-[#EDEFF1] bg-[#F6F7F8] px-3 py-2 text-xs text-[#1A1A1B] flex items-center justify-between gap-2">
                      <span>登录后可以在此发表留言，与同学交流经验。</span>
                      <button
                        onClick={() => router.push("/login")}
                        className="rounded-full bg-[#FF4500] px-3 py-1 text-xs font-medium text-white hover:opacity-90"
                      >
                        去登录
                      </button>
                    </div>
                  )}
                </div>

                {/* 到这去按钮 */}
                <div className="mt-6 border-t border-[#EDEFF1] pt-6">
                  <button
                    onClick={() => {
                      // 终点始终为当前 POI
                      setEndPoint({
                        lng: poi.lng,
                        lat: poi.lat,
                        name: poi.name,
                      });

                      // 如果有用户当前位置，则自动设置为起点，否则留空让用户通过地图选点
                      if (userLocation) {
                        setStartPoint({
                          lng: userLocation[0],
                          lat: userLocation[1],
                          name: "我的位置",
                        });
                      } else {
                        toast("未获取到当前位置，请在左上角导航面板中通过地图选点设置起点");
                      }

                      // 进入导航模式，由地图统一完成路径规划
                      startNavigation();

                      // 关闭抽屉
                      onClose();
                      toast.success("导航已开始");
                    }}
                    className="mb-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#FF4500] px-4 py-3 text-base font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    <Navigation className="h-5 w-5" />
                    到这去
                  </button>

                  {/* 举报按钮 */}
                  <button
                    onClick={() => setShowReportModal(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#EDEFF1] bg-white px-4 py-2.5 text-sm font-medium text-[#1A1A1B] transition-colors hover:bg-[#F6F7F8]"
                  >
                    <Flag className="h-4 w-4" />
                    内容报错/违规举报
                  </button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* 举报弹窗 */}
          <AnimatePresence>
            {showReportModal && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
                onClick={() => setShowReportModal(false)}
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
                >
                  <h3 className="mb-4 text-lg font-semibold text-gray-900">举报 POI</h3>

                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        举报原因 <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                        className="w-full rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] px-4 py-2 focus:border-[#0079D3] focus:outline-none focus:ring-2 focus:ring-[#0079D3]/20"
                      >
                        <option value="">请选择举报原因</option>
                        <option value="定位不准">定位不准</option>
                        <option value="信息错误">信息错误</option>
                        <option value="有害内容">有害内容</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        详细描述（可选）
                      </label>
                      <textarea
                        value={reportDescription}
                        onChange={(e) => setReportDescription(e.target.value)}
                        placeholder="请描述具体问题..."
                        rows={3}
                        className="w-full rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] px-4 py-2 focus:border-[#0079D3] focus:outline-none focus:ring-2 focus:ring-[#0079D3]/20"
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setShowReportModal(false);
                          setReportReason("");
                          setReportDescription("");
                        }}
                        className="flex-1 rounded-lg border border-[#EDEFF1] bg-white px-4 py-2 text-sm font-medium text-[#1A1A1B] transition-colors hover:bg-[#F6F7F8]"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleReport}
                        disabled={isReporting || !reportReason}
                        className="flex-1 rounded-full bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isReporting ? "提交中..." : "提交举报"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * 留言项组件（支持无限层级递归渲染）
 */
interface CommentItemComponentProps {
  comment: CommentItem;
  currentUser: any;
  isAuthenticated: boolean;
  replyingTo: string | null;
  setReplyingTo: (id: string | null) => void;
  replyContent: Record<string, string>;
  setReplyContent: (content: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  isSubmittingReply: Record<string, boolean>;
  onReplySubmit: (parentId: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onReport: () => Promise<void>;
  onRefreshComments: () => Promise<void>;
  depth: number; // 嵌套深度，用于控制缩进
  poiId: string; // POI ID，用于刷新
}

const CommentItemComponent = memo(function CommentItemComponent({
  comment,
  currentUser,
  isAuthenticated,
  replyingTo,
  setReplyingTo,
  replyContent,
  setReplyContent,
  isSubmittingReply,
  onReplySubmit,
  onDelete,
  onReport,
  onRefreshComments,
  depth,
  poiId,
}: CommentItemComponentProps) {
  const isReplying = replyingTo === comment.id;
  const isDeleted = comment.isHidden && comment.content === "[该留言已删除]";
  const [isReporting, setIsReporting] = useState(false);
  
  // 稳健的缩进逻辑：只有前3层有 margin-left，超过3层后停止缩进
  const maxIndentDepth = 3;
  const canIndent = depth < maxIndentDepth;
  const isDeepNested = depth >= maxIndentDepth; // 超过最大缩进层级的深层回复
  
  // 头像大小：深层回复缩小头像以节省空间
  const avatarSize = isDeepNested ? "h-6 w-6 text-[10px]" : "h-7 w-7 text-xs";
  
  // 展开/收起状态（用于显示"展开更多回复"）
  const [isExpanded, setIsExpanded] = useState(true);
  const replies = comment.replies || [];
  const showExpandButton = replies.length > 3;
  const visibleReplies = showExpandButton && !isExpanded 
    ? replies.slice(0, 3) 
    : replies;

  return (
    <div className="space-y-1.5 overflow-hidden">
      {/* 留言主体 */}
      <div className={`rounded-lg border border-[#EDEFF1] px-3 ${
        isDeepNested ? "py-1 bg-[#F6F7F8]" : "py-1.5 bg-white"
      } text-sm`}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
            <div className={`flex ${avatarSize} items-center justify-center rounded-full bg-[#EDEFF1] font-semibold text-[#1A1A1B] flex-shrink-0`}>
              {comment.user.nickname
                ? comment.user.nickname.slice(0, 2)
                : "游客"}
            </div>
            <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
              <span className="text-xs font-semibold text-[#1A1A1B] truncate">
                {comment.user.nickname || "匿名用户"}
              </span>
              <span className="text-[10px] text-[#7C7C7C] truncate">
                {new Date(comment.createdAt).toLocaleString("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-x-1.5 flex-shrink-0">
            {/* 回复按钮（所有层级都可以回复，且未删除）- 固定显示 */}
            {!isDeleted && isAuthenticated && (
              <button
                onClick={() => {
                  if (isReplying) {
                    setReplyingTo(null);
                    setReplyContent((prev) => {
                      const newState = { ...prev };
                      delete newState[comment.id];
                      return newState;
                    });
                  } else {
                    setReplyingTo(comment.id);
                    setReplyContent((prev) => ({
                      ...prev,
                      [comment.id]: "",
                    }));
                  }
                }}
                className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-[#F6F7F8] hover:text-slate-600 active:scale-95"
                title="回复"
              >
                <Reply className="h-3.5 w-3.5" />
              </button>
            )}

            {/* 举报按钮 - 固定显示 */}
            {!isDeleted && (
              <button
                onClick={async () => {
                  if (isReporting) return; // 防止重复点击
                  setIsReporting(true);
                  try {
                    await onReport();
                  } finally {
                    setIsReporting(false);
                  }
                }}
                disabled={isReporting}
                className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-[#F6F7F8] hover:text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                title={isReporting ? "举报中..." : "举报留言"}
              >
                {isReporting ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent"></div>
                ) : (
                  <Flag className="h-3.5 w-3.5" />
                )}
              </button>
            )}

            {/* 删除按钮（作者本人或管理员）- 固定显示 */}
            {currentUser &&
              !isDeleted &&
              (currentUser.id === comment.user.id ||
                currentUser.role === "ADMIN" ||
                currentUser.role === "STAFF" ||
                currentUser.role === "SUPER_ADMIN") && (
                <button
                  onClick={onDelete}
                  className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-red-100 hover:text-red-600 active:scale-95"
                  title="删除留言"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
          </div>
        </div>

        {/* 显示"回复 @用户名"提示 - 深层嵌套时强化显示 */}
        {comment.parent && (
          <div className={`mb-1 text-xs ${
            isDeepNested 
              ? "text-[#FF4500] font-semibold bg-[#FFE5DD] px-2 py-0.5 rounded inline-block" 
              : "text-[#7C7C7C]"
          }`}>
            {isDeepNested && <span className="mr-1">💬</span>}
            回复{" "}
            <span className={`font-medium ${
              isDeepNested 
                ? "text-[#FF4500] underline cursor-pointer hover:text-[#FF5722]" 
                : "text-[#0079D3]"
            }`}>
              @{comment.parent.user.nickname || "匿名用户"}
            </span>
          </div>
        )}

        {/* 留言内容 */}
        <div
          className={`whitespace-pre-line break-words text-xs ${
            isDeleted ? "text-[#7C7C7C] italic" : "text-[#1A1A1B]"
          }`}
        >
          {comment.content}
        </div>
      </div>

      {/* 回复输入框 */}
      {isReplying && !isDeleted && (
        <div className="mt-1.5 space-y-1.5 rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] p-2.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[#1A1A1B]">
              回复 @{comment.user.nickname || "匿名用户"}
            </span>
            <button
              onClick={() => {
                setReplyingTo(null);
                setReplyContent((prev) => {
                  const newState = { ...prev };
                  delete newState[comment.id];
                  return newState;
                });
              }}
              className="text-[#7C7C7C] hover:text-[#1A1A1B]"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
          <textarea
            value={replyContent[comment.id] || ""}
            onChange={(e) =>
              setReplyContent((prev) => ({
                ...prev,
                [comment.id]: e.target.value,
              }))
            }
            placeholder="输入回复内容...（最多 500 字）"
            rows={2}
            className="w-full rounded-lg border border-[#EDEFF1] bg-white px-3 py-2 text-xs focus:border-[#0079D3] focus:outline-none focus:ring-2 focus:ring-[#0079D3]/20"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#7C7C7C]">
              {(replyContent[comment.id] || "").length}/500
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setReplyingTo(null);
                  setReplyContent((prev) => {
                    const newState = { ...prev };
                    delete newState[comment.id];
                    return newState;
                  });
                }}
                className="rounded-lg border border-[#EDEFF1] bg-white px-3 py-1 text-xs font-medium text-[#1A1A1B] transition-colors hover:bg-[#F6F7F8]"
              >
                取消
              </button>
              <button
                onClick={() => onReplySubmit(comment.id)}
                disabled={isSubmittingReply[comment.id]}
                className="flex items-center gap-1 rounded-full bg-[#FF4500] px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmittingReply[comment.id] ? "发送中..." : "发送"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 递归渲染回复（支持无限层级）- 使用嵌套容器结构 */}
      {visibleReplies && visibleReplies.length > 0 && (
        <div className={`mt-1.5 space-y-1.5 ${
          canIndent 
            ? "ml-4 border-l-2 border-[#EDEFF1] pl-2" 
            : "border-l-2 border-[#EDEFF1] pl-2"
        }`}>
          {visibleReplies.map((reply) => (
            <CommentItemComponent
              key={reply.id}
              comment={reply}
              currentUser={currentUser}
              isAuthenticated={isAuthenticated}
              replyingTo={replyingTo}
              setReplyingTo={setReplyingTo}
              replyContent={replyContent}
              setReplyContent={setReplyContent}
              isSubmittingReply={isSubmittingReply}
              onReplySubmit={onReplySubmit}
              onDelete={async () => {
                if (!confirm("确定要删除这条回复吗？此操作不可恢复。")) {
                  return;
                }
                try {
                  const response = await fetch(`/api/comments/${reply.id}`, {
                    method: "DELETE",
                  });
                  const data = await response.json();
                  if (!response.ok) {
                    throw new Error(data.message || "删除失败");
                  }
                  toast.success("回复已删除");
                  await onRefreshComments();
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "删除失败，请重试"
                  );
                }
              }}
              onReport={async () => {
                try {
                  const response = await fetch(`/api/comments/${reply.id}/report`, {
                    method: "POST",
                  });
                  const data = await response.json();
                  if (!response.ok) {
                    throw new Error(data.message || "举报失败");
                  }
                  // 显示后端返回的详细反馈信息
                  toast.success(data.message || "举报已收到");
                  // 如果内容被自动隐藏，刷新留言列表
                  if (data.isAutoHidden) {
                    await onRefreshComments();
                  }
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "举报失败，请重试"
                  );
                }
              }}
              onRefreshComments={onRefreshComments}
              depth={depth + 1}
              poiId={poiId}
            />
          ))}
          
          {/* 展开/收起更多回复按钮 */}
          {showExpandButton && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 text-xs text-[#0079D3] hover:text-[#1A1A1B] mt-1"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  收起回复
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  展开更多回复（{replies.length - 3} 条）
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
});

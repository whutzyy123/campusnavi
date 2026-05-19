"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useDebounce } from "@/hooks/use-debounce";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { AdminPageContainer } from "@/components/admin/admin-page-container";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import { EmptyState } from "@/components/empty-state";
import { useAuthStore } from "@/store/use-auth-store";
import { Plus, Trash2, X, Upload, FileText, Tags } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { openConfirm } from "@/components/ui/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/table";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import {
  getKeywords,
  createKeyword,
  bulkCreateKeywords,
  deleteKeyword,
} from "@/lib/actions/keyword";

interface SensitiveWord {
  id: string;
  keyword: string;
  createdAt: string;
  addedBy: {
    id: string;
    nickname: string;
  };
}

export default function KeywordsManagementPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <KeywordsManagementPageContent />
    </Suspense>
  );
}

function KeywordsManagementPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { currentUser } = useAuthStore();
  const [keywords, setKeywords] = useState<SensitiveWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<{
    total: number;
    pageCount: number;
    currentPage: number;
  } | null>(null);
  const [newKeyword, setNewKeyword] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(() => searchParams.get("q") || "");
  const debouncedSearchInput = useDebounce(searchInput, 300);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkImporting, setBulkImporting] = useState(false);
  const [lastImportResult, setLastImportResult] = useState<{ added: number; skipped: number } | null>(null);

  // 获取屏蔽词列表
  const fetchKeywords = useCallback(async () => {
    try {
      const currentPage = parseInt(searchParams.get("page") || "1", 10);
      const result = await getKeywords({
        page: currentPage,
        limit: 10,
        q: debouncedSearchInput.trim() || undefined,
      });
      if (result.success && result.data) {
        setKeywords(result.data);
        setPagination(result.pagination || null);
      } else if (!result.success) {
        notify.error(result.error || "获取屏蔽词列表失败");
      }
    } catch (error) {
      console.error("获取屏蔽词列表失败:", error);
      notify.error("获取屏蔽词列表失败");
    } finally {
      setLoading(false);
    }
  }, [searchParams, debouncedSearchInput]);

  useEffect(() => {
    fetchKeywords();
  }, [fetchKeywords]);

  // 同步防抖后的搜索词到 URL
  useEffect(() => {
    const q = debouncedSearchInput.trim();
    const params = new URLSearchParams(searchParams.toString());
    if (q) {
      params.set("q", q);
      params.delete("page");
    } else {
      params.delete("q");
    }
    const newSearch = params.toString();
    router.replace(newSearch ? `${pathname}?${newSearch}` : pathname);
  }, [debouncedSearchInput, pathname, router, searchParams]);

  // 解析文本中的词汇：逗号、换行、空格分隔
  const parseWordsFromText = (text: string): string[] => {
    return text
      .split(/[\s,\n\r\t]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0);
  };

  // 批量导入
  const handleBulkImport = async () => {
    const words = parseWordsFromText(bulkText);
    if (words.length === 0) {
      notify.error("请输入或上传要导入的词汇");
      return;
    }
    if (!currentUser) {
      notify.error("请先登录");
      return;
    }

    setBulkImporting(true);
    setLastImportResult(null);
    try {
      const result = await bulkCreateKeywords(words);
      if (result.success && result.data) {
        setLastImportResult(result.data);
        notify.success(`批量导入成功，新增 ${result.data.added} 个，跳过 ${result.data.skipped} 个`);
        setBulkText("");
        await fetchKeywords();
      } else if (!result.success) {
        notify.error(result.error || "批量导入失败");
      }
    } catch (error) {
      console.error("批量导入失败:", error);
      notify.error("批量导入失败");
    } finally {
      setBulkImporting(false);
    }
  };

  // 文件上传解析
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.toLowerCase().split(".").pop();
    if (ext !== "txt" && ext !== "csv") {
      notify.error("仅支持 .txt 或 .csv 文件");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setBulkText((prev) => (prev ? `${prev}\n${text}` : text));
      notify.success(`已加载 ${file.name}，共 ${parseWordsFromText(text).length} 个词汇`);
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  // 添加屏蔽词
  const handleAddKeyword = async () => {
    if (!newKeyword.trim()) {
      notify.error("请输入屏蔽词");
      return;
    }

    if (!currentUser) {
      notify.error("请先登录");
      return;
    }

    setIsAdding(true);
    try {
      const result = await createKeyword(newKeyword.trim());
      if (result.success) {
        notify.success("屏蔽词添加成功");
        setNewKeyword("");
        await fetchKeywords();
      } else if (!result.success) {
        notify.error(result.error || "添加屏蔽词失败");
      }
    } catch (error) {
      console.error("添加屏蔽词失败:", error);
      notify.error("添加屏蔽词失败");
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteKeyword = (id: string) => {
    openConfirm({
      title: "删除屏蔽词",
      description: "确定要删除这个屏蔽词吗？",
      variant: "danger",
      confirmText: "删除",
      onConfirm: async () => {
        setDeletingId(id);
        try {
          const result = await deleteKeyword(id);
          if (result.success) {
            notify.success("屏蔽词删除成功");
            await fetchKeywords();
          } else if (!result.success) {
            notify.error(result.error || "删除屏蔽词失败");
            throw new Error("delete_failed");
          }
        } catch (error) {
          if (error instanceof Error && error.message === "delete_failed") throw error;
          console.error("删除屏蔽词失败:", error);
          notify.error("删除屏蔽词失败");
          throw error;
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  return (
    <AuthGuard requiredRole="SUPER_ADMIN">
      <AdminLayout>
        <>
          <AdminPageContainer
            title="平台屏蔽词管理"
            description="管理平台级屏蔽词，所有用户提交的内容都会自动检查是否包含这些词汇"
            scrollKey={`${searchParams.get("page") ?? "1"}-${debouncedSearchInput}`}
            footer={
              !loading && pagination && pagination.total > 0 ? (
                <PaginationControls
                  total={pagination.total}
                  pageCount={pagination.pageCount}
                  currentPage={pagination.currentPage}
                />
              ) : null
            }
          >
            {/* 添加屏蔽词表单 */}
            <div className="mb-6 flex flex-wrap gap-3">
              <input
                type="text"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleAddKeyword();
                  }
                }}
                placeholder="输入要添加的屏蔽词"
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
              />
              <Button
                type="button"
                loading={isAdding}
                disabled={!newKeyword.trim()}
                onClick={handleAddKeyword}
              >
                {!isAdding ? <Plus className="h-4 w-4" /> : null}
                {isAdding ? "添加中..." : "添加"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowBulkModal(true);
                  setLastImportResult(null);
                  setBulkText("");
                }}
              >
                <Upload className="h-4 w-4" />
                批量导入
              </Button>
            </div>

            <div className="mb-4">
              <AdminFilterBar
                search={{
                  value: searchInput,
                  onChange: setSearchInput,
                  placeholder: "搜索屏蔽词...",
                }}
                filters={[]}
                className="max-w-xl"
              />
            </div>

            {/* 屏蔽词列表 */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FF4500] border-t-transparent"></div>
              </div>
            ) : keywords.length === 0 ? (
              <EmptyState
                icon={Tags}
                title="暂无屏蔽词"
                description="点击上方「添加」按钮添加第一个屏蔽词"
              />
            ) : (
              <div className="min-h-[500px] flex flex-col">
                <div className="flex-1 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>屏蔽词</TableHead>
                        <TableHead>添加人</TableHead>
                        <TableHead>添加时间</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {keywords.map((keyword) => (
                        <TableRow key={keyword.id} className="h-16">
                          <TableCell>
                            <code className="rounded bg-gray-100 px-2 py-1 font-mono text-sm">
                              {keyword.keyword}
                            </code>
                          </TableCell>
                          <TableCell>{keyword.addedBy.nickname}</TableCell>
                          <TableCell>
                            {new Date(keyword.createdAt).toLocaleDateString("zh-CN", {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell className="text-right">
                            <button
                              onClick={() => handleDeleteKeyword(keyword.id)}
                              disabled={deletingId === keyword.id}
                              className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {deletingId === keyword.id ? (
                                <>
                                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent"></div>
                                  删除中...
                                </>
                              ) : (
                                <>
                                  <Trash2 className="h-4 w-4" />
                                  删除
                                </>
                              )}
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </AdminPageContainer>

        {/* 批量导入弹窗 */}
        <Modal
          isOpen={showBulkModal}
          onClose={() => setShowBulkModal(false)}
          closeOnOverlayClick={!bulkImporting}
          closeOnEscape={!bulkImporting}
          containerClassName="max-w-lg"
        >
          <div className="modal-header flex items-center justify-between px-6 py-4">
            <h3 className="text-lg font-semibold text-gray-900">批量导入屏蔽词</h3>
            <button
              type="button"
              onClick={() => !bulkImporting && setShowBulkModal(false)}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="modal-body space-y-4 px-6 py-4 scrollbar-gutter-stable">
                <p className="text-sm text-gray-600">
                  支持逗号、换行或空格分隔，或上传 .txt / .csv 文件
                </p>

                <div className="flex gap-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
                    <FileText className="h-4 w-4" />
                    上传 .txt / .csv
                    <input
                      type="file"
                      accept=".txt,.csv"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </label>
                </div>

                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder="粘贴词汇列表，每行一个或用逗号分隔&#10;例如：&#10;词1&#10;词2, 词3"
                  rows={10}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                />

                {lastImportResult && (
                  <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                    成功添加 {lastImportResult.added} 个屏蔽词，{lastImportResult.skipped} 个重复已跳过
                  </div>
                )}
              </div>

          <div className="modal-footer flex justify-end gap-3 px-6 py-4">
            <Button
              type="button"
              variant="secondary"
              disabled={bulkImporting}
              onClick={() => setShowBulkModal(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              loading={bulkImporting}
              disabled={parseWordsFromText(bulkText).length === 0}
              onClick={handleBulkImport}
            >
              {!bulkImporting ? <Upload className="h-4 w-4" /> : null}
              {bulkImporting ? "导入中..." : "导入"}
            </Button>
          </div>
        </Modal>
        </>
      </AdminLayout>
    </AuthGuard>
  );
}


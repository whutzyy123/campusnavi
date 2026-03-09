"use client";

import ReactMarkdown from "react-markdown";
import { Modal } from "@/components/ui/modal";

export interface AgreementModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
  isLoading?: boolean;
}

/**
 * 协议/免责声明弹窗
 * 使用 ReactMarkdown 渲染 Markdown 格式文本
 */
export function AgreementModal({
  isOpen,
  onClose,
  title,
  content,
  isLoading = false,
}: AgreementModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      containerClassName="max-w-2xl"
      overlayClassName="z-[200]"
      contentClassName="z-[210]"
    >
      <div className="modal-header px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="prose prose-sm prose-orange max-w-none dark:prose-invert overflow-y-auto max-h-[60vh] p-4 custom-scrollbar">
        {isLoading ? (
          <div className="flex min-h-[160px] flex-col items-center justify-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#FF4500] border-t-transparent" />
            <p className="text-sm text-gray-500">加载中...</p>
          </div>
        ) : (
          <ReactMarkdown>{content || "暂无内容"}</ReactMarkdown>
        )}
      </div>
      <div className="modal-footer flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          关闭
        </button>
      </div>
    </Modal>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { X, Copy, Check, Loader2, Search } from "lucide-react";
import { createInvitationCodes } from "@/lib/invitation-actions";
import type { InvitationCodeTypeStr } from "@/lib/invitation-actions";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

interface School {
  id: string;
  name: string;
}

interface GenerateCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  schools: School[];
  /** 超级管理员可选任意学校；校级管理员固定为本校，schoolId 由父组件传入 */
  fixedSchoolId?: string;
  /** 校级管理员只能生成 STAFF，固定为 true 时隐藏类型选择 */
  staffOnly?: boolean;
  /** 超级管理员可选择初始有效期（7/30/90 天） */
  allowDurationChoice?: boolean;
  onSuccess?: () => void;
}

const ROLE_OPTIONS: { value: InvitationCodeTypeStr; label: string }[] = [
  { value: "ADMIN", label: "校级管理员" },
  { value: "STAFF", label: "工作人员" },
];

const DURATION_OPTIONS = [
  { value: 7, label: "7 天" },
  { value: 30, label: "30 天" },
  { value: 90, label: "90 天" },
];

export function GenerateCodeModal({
  isOpen,
  onClose,
  schools,
  fixedSchoolId,
  staffOnly = false,
  allowDurationChoice = false,
  onSuccess,
}: GenerateCodeModalProps) {
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [schoolSearch, setSchoolSearch] = useState("");
  const [schoolDropdownOpen, setSchoolDropdownOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<InvitationCodeTypeStr>("STAFF");
  const [quantity, setQuantity] = useState(1);
  const [durationDays, setDurationDays] = useState(7);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const schoolDropdownRef = useRef<HTMLDivElement>(null);

  const effectiveSchoolId = fixedSchoolId || selectedSchoolId;
  const canSubmit = effectiveSchoolId && !isGenerating && quantity >= 1 && quantity <= 10;

  const filteredSchools = schoolSearch.trim()
    ? schools.filter((s) =>
        s.name.toLowerCase().includes(schoolSearch.toLowerCase())
      )
    : schools;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (schoolDropdownRef.current && !schoolDropdownRef.current.contains(e.target as Node)) {
        setSchoolDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleGenerate = async () => {
    if (!canSubmit) return;

    setIsGenerating(true);
    setGeneratedCodes([]);

    try {
      const result = await createInvitationCodes(
        effectiveSchoolId,
        selectedType,
        quantity,
        durationDays
      );

      if (result.success && result.data) {
        setGeneratedCodes(result.data.codes);
        const codeStr = result.data.codes.length === 1
          ? result.data.codes[0]
          : result.data.codes.join("、");
        toast.success(`邀请码已生成：${codeStr}`);
        onSuccess?.();
        if (result.data.codes.length > 1) {
          // 批量生成时保留弹窗供用户复制
        } else {
          handleClose();
        }
      } else {
        toast.error(result.message || "生成失败");
      }
    } catch (error) {
      console.error("生成邀请码失败:", error);
      toast.error("生成失败，请重试");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (code: string, index: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedIndex(index);
      toast.success("邀请码已复制到剪贴板");
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  const handleClose = () => {
    setSelectedSchoolId("");
    setSchoolSearch("");
    setSelectedType("STAFF");
    setQuantity(1);
    setDurationDays(7);
    setGeneratedCodes([]);
    setCopiedIndex(null);
    onClose();
  };

  const selectedSchoolName = schools.find((s) => s.id === selectedSchoolId)?.name;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-modal-overlay modal-overlay bg-black/50">
      <div className="modal-container max-w-md">
        <div className="modal-header flex items-center justify-between px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">生成邀请码</h3>
          <button
            onClick={handleClose}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="modal-body space-y-5 px-6 py-5 scrollbar-gutter-stable">
          {/* 目标学校 */}
          {!fixedSchoolId ? (
            <div ref={schoolDropdownRef} className="relative">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                目标学校 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={schoolDropdownOpen ? schoolSearch : selectedSchoolName || ""}
                  onChange={(e) => {
                    setSchoolSearch(e.target.value);
                    setSchoolDropdownOpen(true);
                    if (!selectedSchoolId) setSelectedSchoolId("");
                  }}
                  onFocus={() => setSchoolDropdownOpen(true)}
                  placeholder="搜索学校名称..."
                  className={cn(
                    "w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm",
                    "focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
                  )}
                />
              </div>
              {schoolDropdownOpen && (
                <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  {filteredSchools.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500">暂无匹配学校</div>
                  ) : (
                    filteredSchools.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSelectedSchoolId(s.id);
                          setSchoolSearch("");
                          setSchoolDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full px-4 py-2 text-left text-sm transition-colors hover:bg-gray-50",
                          selectedSchoolId === s.id && "bg-[#FFE5DD] font-medium text-[#FF4500]"
                        )}
                      >
                        {s.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">目标学校</label>
              <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700">
                {schools.find((s) => s.id === fixedSchoolId)?.name || "当前学校"}
              </p>
            </div>
          )}

          {/* 角色类型 */}
          {!staffOnly ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                类型 <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-4">
                {ROLE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors",
                      selectedType === opt.value
                        ? "border-[#FF4500] bg-[#FF4500]/5 text-[#FF4500]"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <input
                      type="radio"
                      name="roleType"
                      value={opt.value}
                      checked={selectedType === opt.value}
                      onChange={() => setSelectedType(opt.value)}
                      className="sr-only"
                    />
                    <span className="font-medium">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600">将生成工作人员（STAFF）邀请码</p>
          )}

          {/* 有效期（超级管理员可选） */}
          {allowDurationChoice && (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                有效期
              </label>
              <div className="flex gap-2">
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDurationDays(opt.value)}
                    className={cn(
                      "flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                      durationDays === opt.value
                        ? "border-[#FF4500] bg-[#FF4500]/5 text-[#FF4500]"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 数量 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">数量</label>
            <input
              type="number"
              min={1}
              max={10}
              value={quantity}
              onChange={(e) => setQuantity(Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 1)))}
              className={cn(
                "w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm",
                "focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
              )}
            />
            <p className="mt-1 text-xs text-gray-500">1-10 个</p>
          </div>

          {/* 生成结果（批量时显示） */}
          {generatedCodes.length > 1 && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="mb-2 text-sm font-medium text-green-800">已生成 {generatedCodes.length} 个邀请码</div>
              <div className="max-h-32 space-y-2 overflow-y-auto">
                {generatedCodes.map((code, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-white px-3 py-1.5 font-mono text-sm font-medium text-gray-900">
                      {code}
                    </code>
                    <button
                      onClick={() => handleCopy(code, i)}
                      className="flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-green-700"
                    >
                      {copiedIndex === i ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedIndex === i ? "已复制" : "复制"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
        <div className="modal-footer flex gap-3 p-6">
          <button
            onClick={handleClose}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            关闭
          </button>
          <button
            onClick={handleGenerate}
            disabled={!canSubmit}
            className="flex-1 rounded-lg bg-[#FF4500] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#FF4500]/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                生成中...
              </>
            ) : (
              "生成邀请码"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

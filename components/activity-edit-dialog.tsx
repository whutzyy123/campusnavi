"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, MapPin, Save, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  createActivity,
  updateActivity,
  validateActivityContent,
  type ActivityItem,
} from "@/lib/activity-actions";
import { getPOIsBySchool } from "@/lib/poi-actions";
import { useAuthStore } from "@/store/use-auth-store";

interface POIItem {
  id: string;
  name: string;
  category?: string;
}

/** 编辑时传入的列表项，含 poiName */
type ActivityForEdit = ActivityItem & { poiName?: string };

interface ActivityEditDialogProps {
  activity: ActivityForEdit | null;
  schoolId: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

/** ADMIN/SUPER_ADMIN 豁免敏感词与 6 位数字过滤 */
function shouldExemptContentFilter(role: string | undefined): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/** 将 Date/ISO 转为 datetime-local 输入格式 YYYY-MM-DDTHH:mm */
function toDateTimeLocal(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ActivityEditDialog({
  activity,
  schoolId,
  isOpen,
  onClose,
  onSave,
}: ActivityEditDialogProps) {
  const { currentUser } = useAuthStore();
  const isExempt = shouldExemptContentFilter(currentUser?.role);

  const [formData, setFormData] = useState({
    poiId: "",
    poiName: "",
    title: "",
    description: "",
    link: "",
    startAt: "",
    endAt: "",
  });
  const [pois, setPois] = useState<POIItem[]>([]);
  const [poiSearch, setPoiSearch] = useState("");
  const [poiDropdownOpen, setPoiDropdownOpen] = useState(false);
  const [isLoadingPois, setIsLoadingPois] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const poiInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 加载 POI 列表
  useEffect(() => {
    if (!schoolId || !isOpen) return;

    const fetchPois = async () => {
      setIsLoadingPois(true);
      try {
        const result = await getPOIsBySchool(schoolId);
        if (result.success && result.data?.pois) {
          setPois(
            result.data.pois.map((p: { id: string; name: string; category?: string }) => ({
              id: p.id,
              name: p.name,
              category: p.category,
            }))
          );
        }
      } catch (err) {
        console.error("获取 POI 列表失败:", err);
        toast.error("获取 POI 列表失败");
      } finally {
        setIsLoadingPois(false);
      }
    };

    fetchPois();
  }, [schoolId, isOpen]);

  // 打开/关闭时清空内容校验错误
  useEffect(() => {
    if (!isOpen) {
      setTitleError(null);
      setDescriptionError(null);
    }
  }, [isOpen]);

  // 校验 title、description（仅 STAFF，ADMIN/SUPER_ADMIN 豁免）
  const validateContentFields = useCallback(async () => {
    if (isExempt) return;
    if (!formData.title.trim() || !formData.description.trim()) return;
    setIsValidating(true);
    try {
      const result = await validateActivityContent(formData.title.trim(), formData.description.trim());
      if (result.valid) {
        setTitleError(null);
        setDescriptionError(null);
      } else {
        setTitleError(result.error ?? null);
        setDescriptionError(result.error ?? null);
      }
    } catch {
      setTitleError("校验失败，请重试");
      setDescriptionError("校验失败，请重试");
    } finally {
      setIsValidating(false);
    }
  }, [isExempt, formData.title, formData.description]);

  // 初始化表单
  useEffect(() => {
    if (isOpen) {
      if (activity) {
        const poiName = ("poiName" in activity ? activity.poiName : "") ?? "";
        setFormData({
          poiId: activity.poiId,
          poiName,
          title: activity.title,
          description: activity.description,
          link: activity.link ?? "",
          startAt: toDateTimeLocal(activity.startAt),
          endAt: toDateTimeLocal(activity.endAt),
        });
        setPoiSearch(poiName);
        setTitleError(null);
        setDescriptionError(null);
      } else {
        const now = new Date();
        const defaultEnd = new Date(now);
        defaultEnd.setHours(now.getHours() + 2, 0, 0, 0);
        setFormData({
          poiId: "",
          poiName: "",
          title: "",
          description: "",
          link: "",
          startAt: toDateTimeLocal(now),
          endAt: toDateTimeLocal(defaultEnd),
        });
        setPoiSearch("");
        setTitleError(null);
        setDescriptionError(null);
      }
    }
  }, [isOpen, activity]);

  // 编辑时若 pois 已加载，用 poiId 匹配 poiName 补全显示
  useEffect(() => {
    if (activity && formData.poiId && pois.length > 0 && !formData.poiName) {
      const p = pois.find((x) => x.id === formData.poiId);
      if (p) {
        setFormData((prev) => ({ ...prev, poiName: p.name }));
        setPoiSearch(p.name);
      }
    }
  }, [activity, formData.poiId, formData.poiName, pois]);

  // 点击外部关闭 POI 下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !poiInputRef.current?.contains(e.target as Node)
      ) {
        setPoiDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredPois = poiSearch.trim()
    ? pois.filter(
        (p) =>
          p.name.toLowerCase().includes(poiSearch.toLowerCase()) ||
          (p.category ?? "").toLowerCase().includes(poiSearch.toLowerCase())
      )
    : pois;

  const handleSelectPoi = (p: POIItem) => {
    setFormData((prev) => ({ ...prev, poiId: p.id, poiName: p.name }));
    setPoiSearch(p.name);
    setPoiDropdownOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.poiId.trim()) {
      toast.error("请选择关联的 POI");
      return;
    }
    if (!formData.title.trim()) {
      toast.error("请填写活动标题");
      return;
    }
    if (!formData.description.trim()) {
      toast.error("请填写活动描述");
      return;
    }
    if (!formData.startAt || !formData.endAt) {
      toast.error("请填写开始时间和结束时间");
      return;
    }

    setIsSaving(true);
    const toastId = toast.loading(activity ? "保存中..." : "创建中...");

    try {
      if (activity) {
        const result = await updateActivity(activity.id, {
          title: formData.title.trim(),
          description: formData.description.trim(),
          link: formData.link.trim() || undefined,
          startAt: new Date(formData.startAt).toISOString(),
          endAt: new Date(formData.endAt).toISOString(),
        });
        if (result.success) {
          toast.success("活动已更新", { id: toastId });
          onSave();
          onClose();
        } else {
          toast.error(result.error ?? "更新失败", { id: toastId });
        }
      } else {
        const result = await createActivity({
          poiId: formData.poiId,
          title: formData.title.trim(),
          description: formData.description.trim(),
          link: formData.link.trim() || undefined,
          startAt: new Date(formData.startAt).toISOString(),
          endAt: new Date(formData.endAt).toISOString(),
        });
        if (result.success) {
          toast.success("活动已创建", { id: toastId });
          onSave();
          onClose();
        } else {
          toast.error(result.error ?? "创建失败", { id: toastId });
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败", { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-modal-overlay modal-overlay bg-black/50">
      <div className="modal-container max-w-lg">
        <div className="modal-header flex items-center justify-between px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {activity ? "编辑活动" : "新建活动"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 min-h-0 flex-col">
          <div className="modal-body space-y-4 px-6 py-4 scrollbar-gutter-stable">
          {/* POI 搜索选择（编辑时不可更改） */}
          <div className="relative" ref={dropdownRef}>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              关联 POI <span className="text-red-500">*</span>
            </label>
            <input
              ref={poiInputRef}
              type="text"
              value={poiSearch}
              onChange={(e) => {
                if (activity) return;
                setPoiSearch(e.target.value);
                setPoiDropdownOpen(true);
                if (!formData.poiId && e.target.value) {
                  setFormData((prev) => ({ ...prev, poiId: "" }));
                }
              }}
              onFocus={() => !activity && setPoiDropdownOpen(true)}
              placeholder={isLoadingPois ? "加载中..." : "搜索地点/设施..."}
              disabled={isLoadingPois || !!activity}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
            />
            {poiDropdownOpen && !activity && filteredPois.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                {filteredPois.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPoi(p)}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className="font-medium">{p.name}</span>
                    {p.category && (
                      <span className="text-xs text-gray-500">({p.category})</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {formData.poiId && !poiSearch && (
              <p className="mt-1 text-xs text-gray-500">已选：{formData.poiName}</p>
            )}
          </div>

          {/* 标题 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              标题 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, title: e.target.value }));
                if (!isExempt) setTitleError(null);
              }}
              onBlur={() => formData.title.trim() && validateContentFields()}
              placeholder="最多 100 字"
              maxLength={100}
              className={`w-full rounded-lg border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20 ${
                titleError ? "border-red-500 focus:border-red-500" : "border-gray-300 focus:border-[#FF4500]"
              }`}
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-xs text-gray-500">{formData.title.length}/100</span>
              {titleError && <span className="text-xs text-red-600">{titleError}</span>}
            </div>
          </div>

          {/* 描述 */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              描述 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, description: e.target.value }));
                if (!isExempt) setDescriptionError(null);
              }}
              onBlur={() => formData.description.trim() && validateContentFields()}
              placeholder="最多 1000 字"
              maxLength={1000}
              rows={4}
              className={`w-full rounded-lg border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20 ${
                descriptionError ? "border-red-500 focus:border-red-500" : "border-gray-300 focus:border-[#FF4500]"
              }`}
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-xs text-gray-500">{formData.description.length}/1000</span>
              {descriptionError && <span className="text-xs text-red-600">{descriptionError}</span>}
            </div>
          </div>

          {/* 链接（可选） */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">活动链接（可选）</label>
            <input
              type="url"
              value={formData.link}
              onChange={(e) => setFormData((prev) => ({ ...prev, link: e.target.value }))}
              placeholder="https://..."
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
            />
          </div>

          {/* 开始时间、结束时间 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                开始时间 <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={formData.startAt}
                onChange={(e) => setFormData((prev) => ({ ...prev, startAt: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                结束时间 <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={formData.endAt}
                onChange={(e) => setFormData((prev) => ({ ...prev, endAt: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
              />
            </div>
          </div>
          </div>

          <div className="modal-footer flex justify-end gap-2 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={
                isSaving ||
                isValidating ||
                (!isExempt && (!!titleError || !!descriptionError))
              }
              className="flex items-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {activity ? "保存" : "创建"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

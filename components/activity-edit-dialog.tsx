"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, MapPin, Save } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import {
  createActivity,
  updateActivity,
  validateActivityContent,
  type ActivityWithPOI,
} from "@/lib/actions/activity";
import { getPOIsBySchool } from "@/lib/actions/poi";
import { useAuthStore } from "@/store/use-auth-store";
import { Modal } from "@/components/ui/modal";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface POIItem {
  id: string;
  name: string;
  category?: string;
}

interface ActivityEditDialogProps {
  activity: ActivityWithPOI | null;
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
        notify.error("获取 POI 列表失败");
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
        const poiName = activity.poi?.name ?? "";
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
      notify.error("请选择关联的 POI");
      return;
    }
    if (!formData.title.trim()) {
      notify.error("请填写活动标题");
      return;
    }
    if (!formData.description.trim()) {
      notify.error("请填写活动描述");
      return;
    }
    if (!formData.startAt || !formData.endAt) {
      notify.error("请填写开始时间和结束时间");
      return;
    }

    setIsSaving(true);
    const toastId = notify.loading(activity ? "保存中..." : "创建中...");

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
          notify.success("活动已更新", { id: toastId });
          onSave();
          onClose();
        } else {
          notify.error(result.error ?? "更新失败", { id: toastId });
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
          notify.success("活动已创建", { id: toastId });
          onSave();
          onClose();
        } else {
          notify.error(result.error ?? "创建失败", { id: toastId });
        }
      }
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "操作失败", { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} containerClassName="max-w-lg bg-white">
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
          <FormField label="关联 POI" required className="relative" hint={formData.poiId && !poiSearch ? `已选：${formData.poiName}` : undefined}>
            <div ref={dropdownRef}>
            <Input
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
            </div>
          </FormField>

          {/* 标题 */}
          <FormField label="标题" required error={titleError}>
            <Input
              type="text"
              value={formData.title}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, title: e.target.value }));
                if (!isExempt) setTitleError(null);
              }}
              onBlur={() => formData.title.trim() && validateContentFields()}
              placeholder="最多 100 字"
              maxLength={100}
              hasError={!!titleError}
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-xs text-gray-500">{formData.title.length}/100</span>
            </div>
          </FormField>

          {/* 描述 */}
          <FormField label="描述" required error={descriptionError}>
            <Textarea
              value={formData.description}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, description: e.target.value }));
                if (!isExempt) setDescriptionError(null);
              }}
              onBlur={() => formData.description.trim() && validateContentFields()}
              placeholder="最多 1000 字"
              maxLength={1000}
              rows={4}
              hasError={!!descriptionError}
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-xs text-gray-500">{formData.description.length}/1000</span>
            </div>
          </FormField>

          {/* 链接（可选） */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">活动链接（可选）</label>
            <input
              type="url"
              value={formData.link}
              onChange={(e) => setFormData((prev) => ({ ...prev, link: e.target.value }))}
              placeholder="https:// 开头的活动详情链接"
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
            <Button type="button" variant="secondary" onClick={onClose}>
              取消
            </Button>
            <Button
              type="submit"
              loading={isSaving}
              disabled={isValidating || (!isExempt && (!!titleError || !!descriptionError))}
            >
              {!isSaving ? <Save className="h-4 w-4" /> : null}
              {activity ? "保存" : "创建"}
            </Button>
          </div>
        </form>
    </Modal>
  );
}

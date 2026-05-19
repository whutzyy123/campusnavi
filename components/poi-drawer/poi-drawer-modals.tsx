"use client";

import { X } from "lucide-react";
import { LostFoundForm } from "@/components/lost-found-form";
import { UserProfileModal } from "@/components/shared/user-profile-modal";
import { ActivityDetailModal } from "@/components/activity-detail-modal";
import { usePoiDrawerContext } from "@/components/poi-drawer/poi-drawer-context";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export function PoiDrawerModals() {
  const {
    isOpen,
    displayPoi,
    selectedSubPOI,
    showReportModal,
    setShowReportModal,
    reportReason,
    setReportReason,
    reportDescription,
    setReportDescription,
    isReporting,
    handleReport,
    selectedActivity,
    setSelectedActivity,
    showLostFoundForm,
    setShowLostFoundForm,
    schoolId,
    getActiveLostFoundByPoi,
    setActiveLostFound,
    profileModalUserId,
    setProfileModalUserId,
  } = usePoiDrawerContext();

  const closeReportModal = () => {
    setShowReportModal(false);
    setReportReason("");
    setReportDescription("");
  };

  if (!isOpen) return null;

  return (
    <>
      <Modal
        isOpen={showReportModal}
        onClose={closeReportModal}
        elevation="elevated"
        containerClassName="max-w-md"
      >
        <h3 id="report-poi-title" className="modal-header px-6 pt-6 text-lg font-semibold text-gray-900">
          举报 POI
        </h3>

        <div className="modal-body space-y-4 px-6 py-4 scrollbar-gutter-stable">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              举报原因 <span className="text-red-500">*</span>
            </label>
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="w-full rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] px-4 py-2 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
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
              className="w-full rounded-lg border border-[#EDEFF1] bg-[#F6F7F8] px-4 py-2 focus:border-[#FF4500] focus:outline-none focus:ring-2 focus:ring-[#FF4500]/20"
            />
          </div>
        </div>

        <div className="modal-footer flex gap-3 px-6 py-4">
          <Button type="button" variant="secondary" onClick={closeReportModal} className="flex-1">
            取消
          </Button>
          <Button
            type="button"
            onClick={handleReport}
            disabled={isReporting || !reportReason}
            loading={isReporting}
            className="flex-1 rounded-full"
          >
            提交举报
          </Button>
        </div>
      </Modal>

      <ActivityDetailModal
        activity={selectedActivity}
        isOpen={!!selectedActivity}
        onClose={() => setSelectedActivity(null)}
      />

      <Modal
        isOpen={showLostFoundForm && !!displayPoi && !selectedSubPOI}
        onClose={() => setShowLostFoundForm(false)}
        elevation="elevated"
        containerClassName="max-w-md max-h-[min(90vh,calc(100vh-40px))]"
      >
        <div className="modal-header flex shrink-0 items-center justify-between px-4 py-3">
          <h3 id="lost-found-modal-title" className="text-base font-semibold text-[#1A1A1B]">
            发布失物招领
          </h3>
          <button
            type="button"
            onClick={() => setShowLostFoundForm(false)}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="modal-body min-h-0 flex-1 overflow-y-auto p-4 scrollbar-gutter-stable">
          {displayPoi && (
            <LostFoundForm
              poiId={displayPoi.id}
              schoolId={schoolId}
              onSuccess={async () => {
                const result = await getActiveLostFoundByPoi(displayPoi.id, schoolId);
                if (result.success && result.data) {
                  setActiveLostFound(result.data);
                }
                setShowLostFoundForm(false);
              }}
              onClose={() => setShowLostFoundForm(false)}
              inline={false}
            />
          )}
        </div>
      </Modal>

      <UserProfileModal
        userId={profileModalUserId}
        isOpen={!!profileModalUserId}
        onClose={() => setProfileModalUserId(null)}
      />
    </>
  );
}

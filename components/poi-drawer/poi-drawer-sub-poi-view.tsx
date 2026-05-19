"use client";

import { LiveStatusSection } from "@/components/poi-drawer/live-status-section";
import { ImageCarousel } from "@/components/poi-drawer/image-carousel";
import { usePoiDrawerContext } from "@/components/poi-drawer/poi-drawer-context";

export function PoiDrawerSubPoiView() {
  const {
    displayPoi,
    isInCooldown,
    isLoadingLiveStatuses,
    activeLiveStatuses,
    reportingStatusType,
    onReportStatus,
  } = usePoiDrawerContext();

  const subPoiImages = displayPoi.imageUrl ? [displayPoi.imageUrl] : [];

  return (
    <div className="px-6 py-4">
      <div className="mb-6">
        <ImageCarousel images={subPoiImages} altPrefix={displayPoi.name} />
      </div>
      <div className="mb-6">
        <h3 className="mb-2 text-lg font-semibold text-[#1A1A1B]">{displayPoi.name}</h3>
        {displayPoi.description && <p className="text-sm text-gray-700">{displayPoi.description}</p>}
      </div>
      <LiveStatusSection
        variant="sub"
        isInCooldown={isInCooldown}
        isLoadingLiveStatuses={isLoadingLiveStatuses}
        activeLiveStatuses={activeLiveStatuses}
        reportingStatusType={reportingStatusType}
        onReportStatus={onReportStatus}
      />
    </div>
  );
}

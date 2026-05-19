"use client";

import { X, Flag, Navigation, Heart, MapPin, ArrowLeft, Loader2 } from "lucide-react";
import { notify } from "@/lib/ui/notify";
import { analytics } from "@/lib/analytics";
import { usePoiDrawerContext } from "@/components/poi-drawer/poi-drawer-context";
import { PoiDrawerSubPoiView } from "@/components/poi-drawer/poi-drawer-sub-poi-view";
import { PoiDrawerParentViewContent } from "@/components/poi-drawer/poi-drawer-parent-view";

export function PoiDrawerContent({
  onViewInMapClick,
}: {
  onViewInMapClick?: () => void;
}) {
  const {
    displayPoi,
    isSubPoiView,
    CategoryIcon,
    handleClose,
    selectSubPOI,
    userLocation,
    setEndPoint,
    setStartPoint,
    startNavigation,
    openNavigationPanel,
    setShowReportModal,
    isAuthenticated,
    isFavorited,
    isTogglingFavorite,
    onToggleFavorite,
  } = usePoiDrawerContext();

  return (
    <div className="flex h-full flex-col">
      <div className="flex-shrink-0 border-b border-[#EDEFF1] bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isSubPoiView && (
              <button
                onClick={() => selectSubPOI(null)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                aria-label="返回父 POI"
              >
                <ArrowLeft className="h-4 w-4" />
                返回
              </button>
            )}
            <CategoryIcon className="h-6 w-6 text-[#FF4500]" />
            <h2 className="text-xl font-bold text-[#1A1A1B]">{displayPoi.name}</h2>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <button
                onClick={onToggleFavorite}
                disabled={isTogglingFavorite}
                className={`flex items-center justify-center rounded-lg border p-2 transition-colors ${
                  isFavorited
                    ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                    : "border-[#EDEFF1] bg-white text-[#7C7C7C] hover:border-[#FF4500] hover:bg-[#FFE5DD] hover:text-[#FF4500]"
                } disabled:cursor-not-allowed disabled:opacity-60`}
                aria-label={isFavorited ? "取消收藏" : "收藏"}
              >
                {isTogglingFavorite ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Heart className={`h-4 w-4 ${isFavorited ? "fill-current" : ""}`} />
                )}
              </button>
            )}
            <button
              onClick={handleClose}
              className="text-[#7C7C7C] hover:text-[#1A1A1B]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-theme scrollbar-gutter-stable min-h-0" data-vaul-no-drag>
        {isSubPoiView ? (
          <PoiDrawerSubPoiView />
        ) : (
          <PoiDrawerParentViewContent onViewInMapClick={onViewInMapClick} />
        )}
      </div>

      <div
        className="sticky bottom-0 z-10 flex-shrink-0 border-t border-[#EDEFF1] bg-white p-4"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex flex-col gap-2">
          <button
            onClick={() => {
              analytics.poi.navigateClick({ poi_id: displayPoi.id });
              setEndPoint({ lng: displayPoi.lng, lat: displayPoi.lat, name: displayPoi.name });
              if (userLocation) {
                setStartPoint({ lng: userLocation[0], lat: userLocation[1], name: "我的位置" });
              } else {
                notify.show("未获取到当前位置，请在左上角导航面板中通过地图选点设置起点");
              }
              startNavigation();
              handleClose();
              notify.success("导航已开始");
            }}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#FF4500] px-4 py-3 text-base font-semibold text-white transition-opacity hover:opacity-90 active:scale-[0.98]"
          >
            <Navigation className="h-5 w-5" />
            到这去
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => {
                analytics.nav.startSet({ source: "poi_drawer", poi_id: displayPoi.id });
                setStartPoint({ lng: displayPoi.lng, lat: displayPoi.lat, name: displayPoi.name });
                openNavigationPanel();
                notify.success(`已设为起点：${displayPoi.name}`);
              }}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#EDEFF1] bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100"
            >
              <MapPin className="h-4 w-4" />
              设为起点
            </button>
            <button
              onClick={() => {
                analytics.nav.endSet({ source: "poi_drawer", poi_id: displayPoi.id });
                setEndPoint({ lng: displayPoi.lng, lat: displayPoi.lat, name: displayPoi.name });
                openNavigationPanel();
                notify.success(`已设为终点：${displayPoi.name}`);
              }}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#EDEFF1] bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100"
            >
              <MapPin className="h-4 w-4" />
              设为终点
            </button>
          </div>
          <button
            onClick={() => setShowReportModal(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#EDEFF1] bg-transparent px-4 py-2.5 text-sm font-medium text-[#1A1A1B] transition-colors hover:bg-[#F6F7F8]"
          >
            <Flag className="h-4 w-4" />
            内容报错/违规举报
          </button>
        </div>
      </div>
    </div>
  );
}

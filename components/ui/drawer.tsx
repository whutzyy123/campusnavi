"use client";

import { Drawer as VaulDrawer } from "vaul";
import { cn } from "@/lib/core/utils";

/** 地图页 Bottom Sheet 默认 snap：半屏预览 + 全屏 */
export const DEFAULT_DRAWER_SNAP_POINTS = [0.35, 1] as const;

/** 默认初始 snap（半屏，不挡地图交互） */
export const DEFAULT_DRAWER_SNAP = 0.35;

/** 全屏 snap 值，用于遮罩显隐判断 */
export const DEFAULT_DRAWER_EXPANDED_SNAP = 1;

export interface DrawerRootProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeSnapPoint?: number | string | null;
  setActiveSnapPoint?: (snap: number | string | null) => void;
  snapPoints?: (number | string)[];
  dismissible?: boolean;
  /** 地图共存场景保持 false，低 snap 不拦截地图点击 */
  modal?: boolean;
  fadeFromIndex?: number;
  children: React.ReactNode;
}

export function DrawerRoot({
  open,
  onOpenChange,
  activeSnapPoint,
  setActiveSnapPoint,
  snapPoints = [...DEFAULT_DRAWER_SNAP_POINTS],
  dismissible = true,
  modal = false,
  fadeFromIndex = 0,
  children,
}: DrawerRootProps) {
  return (
    <VaulDrawer.Root
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={snapPoints}
      activeSnapPoint={activeSnapPoint}
      setActiveSnapPoint={setActiveSnapPoint}
      fadeFromIndex={fadeFromIndex}
      modal={modal}
      dismissible={dismissible}
    >
      {children}
    </VaulDrawer.Root>
  );
}

export function DrawerPortal({ children }: { children: React.ReactNode }) {
  return <VaulDrawer.Portal>{children}</VaulDrawer.Portal>;
}

export interface DrawerOverlayProps {
  snap: number | string | null;
  onDismiss?: () => void;
  /** 达到此 snap 时显示遮罩并可点击关闭（默认 1 = 全屏） */
  expandedSnap?: number | string;
  className?: string;
}

export function DrawerOverlay({
  snap,
  onDismiss,
  expandedSnap = DEFAULT_DRAWER_EXPANDED_SNAP,
  className,
}: DrawerOverlayProps) {
  const isExpanded = snap === expandedSnap;

  return (
    <VaulDrawer.Overlay
      className={cn(
        "fixed inset-0 z-drawer-overlay transition-colors duration-200",
        isExpanded ? "bg-black/40 cursor-pointer" : "bg-transparent pointer-events-none",
        className
      )}
      onClick={isExpanded ? onDismiss : undefined}
    />
  );
}

export type DrawerContentVariant = "glass" | "solid";

const drawerContentVariantClass: Record<DrawerContentVariant, string> = {
  glass:
    "bg-white/95 shadow-2xl supports-[backdrop-filter]:bg-white/90 backdrop-blur-md",
  solid: "bg-white shadow-2xl",
};

export interface DrawerContentProps {
  children: React.ReactNode;
  className?: string;
  variant?: DrawerContentVariant;
}

export function DrawerContent({
  children,
  className,
  variant = "glass",
}: DrawerContentProps) {
  return (
    <VaulDrawer.Content
      className={cn(
        "fixed bottom-0 left-0 right-0 z-drawer-content mx-auto flex h-[85dvh] w-full max-w-[var(--mobile-content-max)] flex-col rounded-t-[14px] focus:outline-none",
        drawerContentVariantClass[variant],
        className
      )}
    >
      {children}
    </VaulDrawer.Content>
  );
}

export interface DrawerHandleProps {
  className?: string;
  /** POI 抽屉拖拽条可设为 true */
  draggable?: boolean;
}

export function DrawerHandle({ className, draggable = false }: DrawerHandleProps) {
  return (
    <div
      className={cn(
        "flex w-full shrink-0 justify-center rounded-t-[14px] pt-4 pb-2",
        draggable && "cursor-grab bg-white active:cursor-grabbing",
        className
      )}
    >
      <div className="h-1.5 w-12 rounded-full bg-gray-300" aria-hidden />
    </div>
  );
}

export interface DrawerBodyProps {
  children: React.ReactNode;
  className?: string;
}

/** 可滚动内容区；默认 `data-vaul-no-drag` 避免与 Sheet 拖拽冲突 */
export function DrawerBody({ children, className }: DrawerBodyProps) {
  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}
      data-vaul-no-drag
    >
      {children}
    </div>
  );
}

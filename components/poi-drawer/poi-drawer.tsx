"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DrawerRoot,
  DrawerPortal,
  DrawerOverlay,
  DrawerContent,
  DrawerHandle,
  DrawerBody,
  DEFAULT_DRAWER_SNAP,
} from "@/components/ui/drawer";
import { useMediaQuery } from "@/hooks/use-media-query";
import { usePoiDrawerController } from "@/hooks/use-poi-drawer-controller";
import type { POIDrawerProps } from "@/lib/poi-drawer/types";
import { PoiDrawerProvider } from "@/components/poi-drawer/poi-drawer-context";
import { PoiDrawerContent } from "@/components/poi-drawer/poi-drawer-content";
import { PoiDrawerModals } from "@/components/poi-drawer/poi-drawer-modals";

export function POIDrawer(props: POIDrawerProps) {
  const { isOpen } = props;
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const ctx = usePoiDrawerController(props, isDesktop);

  const [snap, setSnap] = useState<number | string | null>(DEFAULT_DRAWER_SNAP);

  useEffect(() => {
    if (isOpen && !isDesktop) {
      setSnap(DEFAULT_DRAWER_SNAP);
    }
  }, [isOpen, isDesktop]);

  const handleDrawerOpenChange = useCallback(
    (open: boolean) => {
      if (!open && ctx) {
        ctx.handleClose();
      }
    },
    [ctx]
  );

  if (!ctx) return null;

  return (
    <PoiDrawerProvider value={ctx}>
      <AnimatePresence>
        {isOpen && isDesktop && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed below-nav right-0 bottom-0 left-0 z-modal-overlay bg-black/50"
              onClick={ctx.handleClose}
            />

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
                  ctx.handleClose();
                }
              }}
              className="fixed right-0 below-nav z-modal-content flex h-below-nav w-full max-w-md flex-col bg-white shadow-2xl"
            >
              <PoiDrawerContent />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {!isDesktop && (
        <DrawerRoot
          open={isOpen}
          onOpenChange={handleDrawerOpenChange}
          activeSnapPoint={snap}
          setActiveSnapPoint={setSnap}
        >
          <DrawerPortal>
            <DrawerOverlay
              snap={snap}
              onDismiss={() => handleDrawerOpenChange(false)}
            />
            <DrawerContent variant="solid">
              <DrawerHandle draggable />
              <DrawerBody className="overflow-y-auto overscroll-none px-4 pb-8">
                <PoiDrawerContent onViewInMapClick={() => setSnap(DEFAULT_DRAWER_SNAP)} />
              </DrawerBody>
            </DrawerContent>
          </DrawerPortal>
        </DrawerRoot>
      )}

      <PoiDrawerModals />
    </PoiDrawerProvider>
  );
}

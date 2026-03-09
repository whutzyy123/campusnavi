"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ActivityWithPOI } from "@/types/activity";
import { ActivityCard } from "./activity-card";
import { ActivitySearchBar } from "./activity-search-bar";
import { ActivityDetailModal } from "@/components/activity-detail-modal";
import { EmptyState } from "@/components/empty-state";
import { SearchX } from "lucide-react";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.02 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98 },
};

interface ActivitiesListClientProps {
  activities: ActivityWithPOI[];
}

export function ActivitiesListClient({ activities }: ActivitiesListClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedActivity, setSelectedActivity] = useState<ActivityWithPOI | null>(null);

  const filteredActivities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activities;
    return activities.filter((a) => a.title.toLowerCase().includes(q));
  }, [activities, searchQuery]);

  const handleOpenDetail = (activity: ActivityWithPOI) => {
    setSelectedActivity(activity);
  };

  const handleCloseDetail = () => {
    setSelectedActivity(null);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
  };

  const showNoResults = filteredActivities.length === 0 && searchQuery.trim().length > 0;

  return (
    <div className="space-y-4">
      <ActivitySearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="搜索活动标题..."
      />

      {showNoResults ? (
        <EmptyState
          icon={SearchX}
          title="未找到结果"
          description={`未找到与「${searchQuery.trim()}」相关的活动`}
          action={{ label: "清空搜索", onClick: handleClearSearch }}
        />
      ) : (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          <AnimatePresence mode="popLayout">
            {filteredActivities.map((a) => (
              <motion.div
                key={a.id}
                variants={item}
                layout
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                <ActivityCard activity={a} onOpenDetail={handleOpenDetail} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <ActivityDetailModal
        activity={selectedActivity}
        isOpen={!!selectedActivity}
        onClose={handleCloseDetail}
      />
    </div>
  );
}

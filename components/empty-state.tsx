/**
 * 空状态组件
 * 用于显示列表为空时的提示
 */

import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
        <Icon className="h-8 w-8 text-gray-400" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-gray-900">{title}</h3>
      {description && <p className="mb-6 text-sm text-gray-500 text-center max-w-sm">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}


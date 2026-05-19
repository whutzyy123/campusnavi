"use client";

/**
 * 状态上报按钮组件
 */

export interface StatusReportButtonProps {
  btn: {
    id: string;
    label: string;
    emoji: string;
    className: string;
  };
  reportingStatusType: string | null;
  isInCooldown: boolean;
  onReportStatus: (statusType: string) => void;
}

export function StatusReportButton({ btn, reportingStatusType, isInCooldown, onReportStatus }: StatusReportButtonProps) {
  const isSubmitting = reportingStatusType === btn.id;

  return (
    <button
      type="button"
      onClick={() => onReportStatus(btn.id)}
      disabled={!!reportingStatusType || isInCooldown}
      className={`relative inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${btn.className}`}
    >
      {isSubmitting ? (
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <span className="text-base">{btn.emoji}</span>
      )}
      <span className="truncate">{btn.label}</span>
    </button>
  );
}
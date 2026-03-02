/**
 * 通用加载指示器，用于 Suspense fallback
 */
export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div
      className={
        className ??
        "flex min-h-[200px] items-center justify-center"
      }
    >
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-[#FF4500] border-t-transparent"
        aria-hidden
      />
    </div>
  );
}

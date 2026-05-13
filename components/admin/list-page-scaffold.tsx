"use client";

interface ListPageScaffoldProps {
  filters?: React.ReactNode;
  children: React.ReactNode;
  emptyState?: React.ReactNode;
  pagination?: React.ReactNode;
  className?: string;
}

export function ListPageScaffold({ filters, children, emptyState, pagination, className = "" }: ListPageScaffoldProps) {
  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-4 ${className}`.trim()}>
      {filters ? <div className="flex-shrink-0">{filters}</div> : null}
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg bg-white shadow">
        <div className="h-full min-h-0 overflow-auto p-4 md:p-6">{children}</div>
      </div>
      {emptyState ? <div className="flex-shrink-0">{emptyState}</div> : null}
      {pagination ? <div className="flex-shrink-0">{pagination}</div> : null}
    </div>
  );
}


/**
 * Card 组件
 * 用于包装内容，提供统一的卡片样式
 */

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

export function Card({ children, className = "", title, description, action }: CardProps) {
  const hasHeader = !!title || !!description || !!action;

  return (
    <div className={`rounded-lg bg-white shadow ${className}`}>
      {hasHeader && (
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex flex-col">
            {title && (
              <h3 className="text-lg font-semibold text-gray-900">
                {title}
              </h3>
            )}
            {description && (
              <p className="mt-1 text-sm text-gray-500">
                {description}
              </p>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}


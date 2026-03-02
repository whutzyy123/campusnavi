import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full min-w-0 overflow-x-auto">
      <table
        className={cn("w-full min-w-fit table-auto caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn("[&_tr]:border-b [&_tr]:border-gray-100", className)} {...props} />
  );
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-gray-100 transition-colors hover:bg-gray-50 data-[state=selected]:bg-gray-100",
        className
      )}
      {...props}
    />
  );
}

export type ResponsiveHideLevel = "sm" | "lg" | true;

export interface TableHeadProps extends React.HTMLAttributes<HTMLTableCellElement> {
  /** sm: 在 sm 以下隐藏；lg 或 true: 在 lg 以下隐藏 */
  responsiveHide?: ResponsiveHideLevel;
}

export function TableHead({ className, responsiveHide, ...props }: TableHeadProps) {
  const hideClass =
    responsiveHide === "sm"
      ? "hidden sm:table-cell"
      : responsiveHide === "lg" || responsiveHide === true
        ? "hidden lg:table-cell"
        : undefined;
  return (
    <th
      className={cn(
        "h-10 whitespace-nowrap px-3 py-2 text-left align-middle font-medium text-gray-700 [&:has([role=checkbox])]:pr-0",
        hideClass,
        className
      )}
      {...props}
    />
  );
}

export interface TableCellProps extends React.HTMLAttributes<HTMLTableCellElement> {
  /** sm: 在 sm 以下隐藏；lg 或 true: 在 lg 以下隐藏（需与 TableHead 对应） */
  responsiveHide?: ResponsiveHideLevel;
}

export function TableCell({ className, responsiveHide, ...props }: TableCellProps) {
  const hideClass =
    responsiveHide === "sm"
      ? "hidden sm:table-cell"
      : responsiveHide === "lg" || responsiveHide === true
        ? "hidden lg:table-cell"
        : undefined;
  return (
    <td
      className={cn(
        "whitespace-nowrap px-3 py-2 align-middle [&:has([role=checkbox])]:pr-0",
        hideClass,
        className
      )}
      {...props}
    />
  );
}


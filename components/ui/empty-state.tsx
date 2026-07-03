import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Estado vacío consistente para listados y tablas. */
function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export { EmptyState };

import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="sticky top-0 z-20 -mx-4 mb-4 flex items-center gap-3 bg-background/80 px-4 py-4 backdrop-blur-xl lg:static lg:mx-0 lg:rounded-3xl lg:bg-transparent lg:px-0 lg:py-6 lg:backdrop-blur-0">
      <Link
        to="/"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-secondary text-secondary-foreground lg:hidden"
      >
        <ChevronLeft className="h-5 w-5" />
      </Link>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold tracking-tight lg:text-3xl">{title}</h1>
        {subtitle && <p className="truncate text-xs text-muted-foreground lg:text-sm">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  emphasis?: boolean;
  className?: string;
}

export function KpiCard({
  label,
  value,
  hint,
  emphasis,
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3 sm:p-5 transition-shadow hover:shadow-sm",
        emphasis && "border-primary/30 bg-primary/[0.03]",
        className
      )}
    >
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={cn(
          "mt-2 font-mono text-xl min-[480px]:text-2xl sm:text-3xl font-semibold tabular-nums tracking-tight truncate",
          emphasis && "text-primary"
        )}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-2 text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

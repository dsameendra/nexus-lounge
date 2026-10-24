"use client";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = "",
}: {
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode; badge?: number; badgeTone?: "alert" | "quiet" }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={`flex rounded-xl bg-panel p-1 ${className}`}>
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[9px] text-sm font-medium transition ${
            value === option.value ? "bg-panel-3 text-white shadow" : "text-label-2 hover:text-white"
          }`}
        >
          {option.icon}
          {option.label}
          {option.badge !== undefined && option.badge > 0 && (
            <span
              className={`min-w-5 rounded-full px-1.5 py-0.5 text-[11px] leading-none font-semibold tabular-nums ${
                option.badgeTone === "quiet" ? "bg-white/10 text-label-2" : "bg-danger text-white"
              }`}
            >
              {option.badge > 99 ? "99+" : option.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

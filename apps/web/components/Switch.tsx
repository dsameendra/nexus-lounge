"use client";

export function Switch({
  checked,
  onChange,
  label,
  description,
  compact = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  compact?: boolean;
}) {
  return (
    <label className={`flex cursor-pointer items-center justify-between gap-4 ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
      <span className="min-w-0">
        <span className={`block ${compact ? "text-sm" : "text-[15px]"}`}>{label}</span>
        {description && <span className="mt-0.5 block text-xs text-label-2">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 rounded-full transition-colors duration-200 ${compact ? "h-[26px] w-[42px]" : "h-[31px] w-[51px]"} ${checked ? "bg-live" : "bg-panel-3"}`}
      >
        <span
          className={`absolute top-[2px] left-[2px] rounded-full bg-white shadow-md transition-transform duration-200 ${
            compact ? `size-[22px] ${checked ? "translate-x-4" : ""}` : `size-[27px] ${checked ? "translate-x-5" : ""}`
          }`}
        />
      </button>
    </label>
  );
}

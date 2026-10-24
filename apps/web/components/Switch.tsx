"use client";

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
      <span className="min-w-0">
        <span className="block text-[15px]">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-label-2">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${checked ? "bg-live" : "bg-panel-3"}`}
      >
        <span
          className={`absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow-md transition-transform duration-200 ${checked ? "translate-x-5" : ""}`}
        />
      </button>
    </label>
  );
}

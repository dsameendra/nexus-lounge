import Link from "next/link";

export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={`flex items-center justify-center gap-4 text-xs text-label-3 ${className}`}>
      <Link href="/terms" className="transition hover:text-white">
        Terms of Service
      </Link>
      <Link href="/privacy" className="transition hover:text-white">
        Privacy Policy
      </Link>
    </nav>
  );
}

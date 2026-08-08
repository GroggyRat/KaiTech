import { PackageX } from "lucide-react";

export function FeatureLocked({ label }: { label: string }) {
  return (
    <div className="empty-state py-24">
      <div className="empty-state-icon">
        <PackageX className="h-6 w-6" />
      </div>
      <p className="font-medium">{label} isn't available on your plan</p>
      <p className="text-sm text-[var(--foreground-muted)] mt-1">
        Contact your agency to have this module enabled.
      </p>
    </div>
  );
}

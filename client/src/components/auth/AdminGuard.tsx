"use client";

import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { ShieldX, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminGuardProps {
  children: React.ReactNode;
  /** What the user was trying to do, e.g. "create incidents". */
  action?: string;
}

/**
 * Full-page gate for admin-only screens (create/edit forms). Mirrors
 * PermissionGuard but keys off `userProfile.role === "admin"` instead of a
 * permission flag — Incidents & Policies are viewable by all approved staff
 * and only editable by admins, and we deliberately avoid adding new keys to
 * the permission-seeding flow for this iteration.
 */
export default function AdminGuard({ children, action }: AdminGuardProps) {
  const router = useRouter();
  const { userProfile } = useAuthStore();

  if (userProfile?.role === "admin") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center mb-6">
          <ShieldX className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Admins only
        </h1>
        <p className="text-muted-foreground mb-6">
          You have view access to this section, but only administrators can{" "}
          {action || "make changes here"}. Please contact an admin if you need
          to update this.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => router.back()}>
            Go back
          </Button>
          <Button onClick={() => window.location.reload()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>
    </div>
  );
}

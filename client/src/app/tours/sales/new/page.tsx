"use client";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import PermissionGuard from "@/components/auth/PermissionGuard";
import SaleEditorRoute from "@/components/sales/editor/SaleEditorRoute";

export default function NewSalePage() {
  return (
    <DashboardLayout fullWidth>
      <PermissionGuard permission="canManageTours">
        <SaleEditorRoute saleId={null} />
      </PermissionGuard>
    </DashboardLayout>
  );
}

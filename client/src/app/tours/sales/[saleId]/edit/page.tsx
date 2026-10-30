"use client";

import { useParams } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import PermissionGuard from "@/components/auth/PermissionGuard";
import SaleEditorRoute from "@/components/sales/editor/SaleEditorRoute";

export default function EditSalePage() {
  const params = useParams();
  const saleId = params?.saleId as string;
  return (
    <DashboardLayout fullWidth>
      <PermissionGuard permission="canManageTours">
        <SaleEditorRoute saleId={saleId} />
      </PermissionGuard>
    </DashboardLayout>
  );
}

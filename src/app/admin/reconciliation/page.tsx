import { ReconciliationPanel } from "../../../components/admin/ReconciliationPanel";
import { requirePagePermission } from "../../../lib/auth/guards";
import { Permission } from "../../../lib/permissions";

export default async function ReconciliationPage() {
  await requirePagePermission(Permission.RECONCILIATION_RUN);
  return <ReconciliationPanel />;
}

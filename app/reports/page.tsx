import { listCampaigns } from "@/lib/queries";
import ReportsClient from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const campaigns = await listCampaigns();
  return <ReportsClient campaigns={campaigns} />;
}

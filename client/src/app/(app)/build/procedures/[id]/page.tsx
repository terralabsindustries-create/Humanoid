import { ProcedureDetail } from "@/components/screens/procedure-detail";

export const metadata = { title: "Procedure · Humanoid" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProcedureDetail procedureId={id} />;
}

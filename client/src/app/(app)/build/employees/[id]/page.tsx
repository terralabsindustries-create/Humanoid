import { EmployeeDetail } from "@/components/screens/employee-detail";

export const metadata = { title: "AI employee · Humanoid" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EmployeeDetail id={id} />;
}

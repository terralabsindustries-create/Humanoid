import { ReviewIssueDetail } from "@/components/screens/review-issue";

export const metadata = { title: "Review · Humanoid" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReviewIssueDetail id={id} />;
}

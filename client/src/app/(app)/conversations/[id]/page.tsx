import { ConversationDetail } from "@/components/screens/conversation-detail";

export const metadata = { title: "Conversation · Humanoid" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConversationDetail id={id} />;
}

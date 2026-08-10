import { AppShell } from "@/components/shell/app-shell";
import { WorkspaceProvider } from "@/components/providers/app-providers";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceProvider>
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  );
}

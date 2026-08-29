import type { Metadata } from "next";

import { TaskPage } from "@/features/tasks/TaskPage";

export const metadata: Metadata = { title: "Your request" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TaskPage taskId={id} />;
}

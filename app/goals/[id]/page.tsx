import { GoalEditor } from "@/components/reds/views/GoalEditor";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GoalEditor id={decodeURIComponent(id)} />;
}

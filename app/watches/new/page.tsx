import { WatchCreator } from "@/components/WatchCreator";

export default async function NewWatchPage({
  searchParams,
}: {
  searchParams: Promise<{ input?: string }>;
}) {
  const params = await searchParams;
  const initialInput = params.input?.trim() ?? "";

  return (
    <main className="page-shell">
      <WatchCreator initialInput={initialInput} />
    </main>
  );
}

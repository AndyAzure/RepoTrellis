import { RepositoryWorkbench } from "@/components/repository-workbench";
import { sqlite } from "@/db";
import { listSourceItems, searchRepositories } from "@/domain";

export const dynamic = "force-dynamic";

export default function Home() {
  const repositories = searchRepositories(sqlite, { limit: 100 });
  const inboxItems = listSourceItems(sqlite, { limit: 100 });

  return (
    <RepositoryWorkbench
      initialRepositories={repositories}
      initialInboxItems={inboxItems}
    />
  );
}

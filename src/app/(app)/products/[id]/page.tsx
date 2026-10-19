import Link from "next/link";
import { StateBadge, SyntheticTag } from "@/components/app/badges";
import { EmptyState, PageHeader, Section } from "@/components/app/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";
import { or404 } from "@/server/http/page";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageActor();
  const p = await or404(tenantDb(actor, getDb()).views.product(id));
  return (
    <>
      <PageHeader
        title={
          <>
            {p.name} {p.isSynthetic ? <SyntheticTag /> : null}
          </>
        }
        description={`${p.area} · ${p.description}`}
      />
      <Section title="Features">
        {p.features.length === 0 ? (
          <EmptyState>No features recorded. Claims can still reference the product.</EmptyState>
        ) : (
          <ul className="list-disc pl-5 text-sm">
            {p.features.map((f) => (
              <li key={f.id}>
                <span className="font-medium">{f.name}</span> — {f.description}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Claims" description="Only approved claims may support statements of kind FACT.">
        {p.claims.length === 0 ? (
          <EmptyState>No claims.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Claim</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Evidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.claims.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-normal">
                    <Link href={`/knowledge/claims#clm-${c.id}`} className="underline-offset-4 hover:underline">
                      {c.text}
                    </Link>
                  </TableCell>
                  <TableCell>{c.category.replace(/_/g, " ")}</TableCell>
                  <TableCell>
                    <StateBadge state={c.state} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c._count.evidence}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  );
}

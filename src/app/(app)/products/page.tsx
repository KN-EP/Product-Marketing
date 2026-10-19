import Link from "next/link";
import { SyntheticTag } from "@/components/app/badges";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePageActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { tenantDb } from "@/server/db/tenant-scope";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const actor = await requirePageActor();
  const products = await tenantDb(actor, getDb()).views.products();
  return (
    <>
      <PageHeader title="Products" description="Product areas and the claims that may be used about them." />
      {products.length === 0 ? (
        <EmptyState>No products.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Area</TableHead>
              <TableHead className="text-right">Features</TableHead>
              <TableHead className="text-right">Claims</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="whitespace-normal">
                  <Link href={`/products/${p.id}`} className="font-medium underline-offset-4 hover:underline">
                    {p.name}
                  </Link>{" "}
                  {p.isSynthetic ? <SyntheticTag /> : null}
                  <p className="text-xs text-muted-foreground">{p.description}</p>
                </TableCell>
                <TableCell>{p.area}</TableCell>
                <TableCell className="text-right tabular-nums">{p._count.features}</TableCell>
                <TableCell className="text-right tabular-nums">{p._count.claims}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}

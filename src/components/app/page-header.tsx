export function PageHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Section({ title, description, children, id }: { title: string; description?: string; children: React.ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id ? `${id}-title` : undefined} id={id} className="flex scroll-mt-24 flex-col gap-3">
      <div>
        <h2 id={id ? `${id}-title` : undefined} className="text-base font-semibold">
          {title}
        </h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{children}</p>;
}

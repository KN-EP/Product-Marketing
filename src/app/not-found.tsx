import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-muted-foreground">This record does not exist or you do not have access to it.</p>
      <Link href="/dashboard" className="underline">
        Back to dashboard
      </Link>
    </main>
  );
}

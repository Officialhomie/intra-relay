import Link from "next/link";

export default function NotFound() {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
      <p className="text-sm text-muted">
        That page does not exist.{" "}
        <Link href="/" className="underline">
          Go home
        </Link>
        .
      </p>
    </section>
  );
}

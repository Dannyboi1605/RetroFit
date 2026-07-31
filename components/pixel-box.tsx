export default function PixelBox({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="pixel-border bg-surface-container">
      <header className="border-b-2 border-outline-variant px-3 py-2">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-primary">
          {title}
        </h2>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

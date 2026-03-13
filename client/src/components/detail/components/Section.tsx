export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-fg-dim">{title}</h3>
      {children}
    </div>
  );
}

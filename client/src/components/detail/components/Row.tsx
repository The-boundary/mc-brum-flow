export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-fg-dim">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

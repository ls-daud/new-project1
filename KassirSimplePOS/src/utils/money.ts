export function formatRupiah(v: number): string {
  const n = Math.round(v);
  return n.toLocaleString("id-ID");
}

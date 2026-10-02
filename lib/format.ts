import { formatUnits } from 'viem';

export function formatAmount(amount: bigint | string, currency: string): string {
  const n = formatUnits(BigInt(amount), 6);
  const [whole, frac = ''] = n.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped}.${frac.padEnd(2, '0')} ${currency}`;
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function formatDate(d: Date | string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

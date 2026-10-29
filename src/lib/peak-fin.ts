import tbJson from '@/data/peak/trial-balance.json';
import arApJson from '@/data/peak/ar-ap.json';

export type Acct = { code: string; name: string; debit: number; credit: number };
type TB = { source: string; period: string; pulledAt: string; accounts: Acct[] };
export type Party = { name: string; amount: number };
type ARAP = { pulledAt: string; ar: { total: number; parties: Party[] }; ap: { total: number; parties: Party[] } };

const tb = tbJson as unknown as TB;
export const arap = arApJson as unknown as ARAP;

const r2 = (n: number) => Math.round(n * 100) / 100;
const balOf = (a: Acct, side: 'dr' | 'cr') => (side === 'dr' ? a.debit - a.credit : a.credit - a.debit);

export function peakFin() {
  const accounts = tb.accounts || [];
  const sumBy = (pred: (a: Acct) => boolean, side: 'dr' | 'cr') => r2(accounts.filter(pred).reduce((s, a) => s + balOf(a, side), 0));
  const group = (prefix: string, side: 'dr' | 'cr') =>
    accounts.filter((a) => a.code.startsWith(prefix)).map((a) => ({ code: a.code, name: a.name, bal: r2(balOf(a, side)) }))
      .filter((a) => Math.abs(a.bal) > 0.005).sort((x, y) => Math.abs(y.bal) - Math.abs(x.bal));

  const assets = sumBy((a) => a.code.startsWith('1'), 'dr');
  const liabilities = sumBy((a) => a.code.startsWith('2'), 'cr');
  const equity = sumBy((a) => a.code.startsWith('3'), 'cr');
  const revenue = sumBy((a) => a.code.startsWith('4'), 'cr');
  const expense = sumBy((a) => a.code.startsWith('5'), 'dr');
  const netProfit = r2(revenue - expense);
  const margin = revenue > 0 ? netProfit / revenue : 0;

  return {
    period: tb.period,
    pulled: (tb.pulledAt || '').slice(0, 10),
    assets, liabilities, equity, revenue, expense, netProfit, margin,
    revRows: group('4', 'cr'),
    expRows: group('5', 'dr'),
    assetRows: group('1', 'dr'),
    liabRows: group('2', 'cr'),
    eqRows: group('3', 'cr'),
    allRows: accounts.filter((a) => Math.abs(a.debit) > 0.005 || Math.abs(a.credit) > 0.005).sort((x, y) => x.code.localeCompare(y.code)),
    arap,
  };
}

export const toSlices = (rows: { code?: string; name: string; bal?: number; amount?: number }[]) =>
  rows.map((r) => ({ id: r.code ?? r.name, label: r.name, amount: Math.abs(r.bal ?? r.amount ?? 0) }));

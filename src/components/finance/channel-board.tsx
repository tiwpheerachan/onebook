'use client';
import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import Link from 'next/link';
import {
  Banknote, Landmark, Wallet, CreditCard, FileCheck, ChevronUp, MoreVertical, AlertTriangle, Link2,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';

export interface ChannelCard {
  id: string;
  code: string;
  name: string;
  kind: string;
  bank_name: string | null;
  bank_branch: string | null;
  account_no: string | null;
  account_code: string | null;
  account_name: string | null;
  balance: number;
  shares_account: boolean;
  counts_in_total: boolean;
}

export interface ChannelGroup {
  key: string;
  label: string;
  count: number;
  total: number;
  channels: ChannelCard[];
}

const GROUP_ICON: Record<string, any> = {
  cash: Banknote,
  bank_savings: Landmark,
  bank_current: Landmark,
  bank_fixed: Landmark,
  e_wallet: Wallet,
  credit_card: CreditCard,
  cheque: FileCheck,
};

/** สีไอคอนบนการ์ด แยกตามชนิดช่องทาง */
const CARD_TONE: Record<string, string> = {
  cash: 'bg-emerald-50 text-emerald-600',
  bank: 'bg-sky-50 text-sky-600',
  e_wallet: 'bg-amber-50 text-amber-600',
  credit_card: 'bg-violet-50 text-violet-600',
  cheque: 'bg-ink-100 text-ink-500',
};

/**
 * กระดานช่องทางการเงินแบบการ์ด แบ่งกลุ่มตามชนิด
 * ยอดคงเหลืออ่านจากบัญชีแยกประเภท จึงตรงกับงบแสดงฐานะการเงิน
 */
export function ChannelBoard({
  groups, hasShared, editSlots,
}: {
  groups: ChannelGroup[];
  hasShared: boolean;
  /**
   * ปุ่มแก้ไขของแต่ละการ์ด เตรียมมาจากฝั่งเซิร์ฟเวอร์แล้วส่งเป็น element
   * (ส่งเป็นฟังก์ชันไม่ได้ เพราะข้ามขอบ Server -> Client Component)
   */
  editSlots?: Record<string, React.ReactNode>;
}) {
  const M = useI18n().dict.ui.misc;
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const allCollapsed = collapsed.length === groups.length && groups.length > 0;

  const toggle = (k: string) =>
    setCollapsed((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));

  if (groups.length === 0) {
    return (
      <div className="card card-pad text-center">
        <Wallet className="mx-auto h-8 w-8 text-ink-300" strokeWidth={1.5} />
        <p className="mt-2 text-sm text-ink-500">{M.noChannels}</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => setCollapsed(allCollapsed ? [] : groups.map((g) => g.key))}
          className="flex items-center gap-1 text-xs text-brand-700 hover:underline"
        >
          ย่อ/ขยายทั้งหมด
          <ChevronUp className={cn('h-3.5 w-3.5 transition', allCollapsed && 'rotate-180')} strokeWidth={2} />
        </button>
      </div>

      {hasShared && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 ring-1 ring-inset ring-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          มีช่องทางที่ผูกบัญชีแยกประเภทเดียวกันมากกว่าหนึ่งช่อง — การ์ดจะแสดงยอดของบัญชีนั้นเท่ากัน
          แต่ยอดรวมด้านบนนับเพียงครั้งเดียว จึงไม่เบิ้ล หากต้องการดูยอดแยกรายช่องทาง ควรแยกบัญชีแยกประเภทให้แต่ละช่อง
        </p>
      )}

      <div className="space-y-6">
        {groups.map((g) => {
          const Icon = GROUP_ICON[g.key] || Wallet;
          const open = !collapsed.includes(g.key);
          return (
            <section key={g.key}>
              <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-ink-200 pb-2">
                <Icon className="h-4 w-4 text-ink-400" strokeWidth={1.8} />
                <h2 className="text-sm font-semibold text-ink-900">{g.label}</h2>
                <span className="text-xs text-ink-500">{M.nAccounts.replace('{n}', String(g.count))}</span>
                <span className="ml-auto text-sm text-ink-600">
                  รวม <b className={cn('tabular-nums', Number(g.total) < 0 ? 'text-rose-600' : 'text-ink-900')}>
                    {money(g.total)}
                  </b> บาท
                </span>
                <button onClick={() => toggle(g.key)} className="flex items-center gap-1 text-xs text-brand-700 hover:underline">
                  ย่อ/ขยาย
                  <ChevronUp className={cn('h-3.5 w-3.5 transition', !open && 'rotate-180')} strokeWidth={2} />
                </button>
              </div>

              {open && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {g.channels.map((c) => {
                    const tone = CARD_TONE[c.kind] || CARD_TONE.cheque;
                    const neg = Number(c.balance) < 0;
                    return (
                      <div key={c.id} className="card flex flex-col overflow-hidden transition hover:shadow-md">
                        <div className="flex items-start gap-2.5 px-3.5 pb-2 pt-3">
                          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tone)}>
                            <Wallet className="h-4 w-4" strokeWidth={1.8} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/finance/reconcile?channel=${c.id}`}
                              className="block truncate text-sm font-semibold text-brand-700 hover:underline"
                              title={c.name}
                            >
                              {c.name}
                            </Link>
                            <p className="truncate text-xxs text-ink-500">
                              {[c.bank_name, c.account_no].filter(Boolean).join(' ') || '—'}
                            </p>
                            <p className="truncate text-xxs text-ink-400">{c.bank_branch || '—'}</p>
                          </div>
                          <span className="shrink-0">
                            {editSlots?.[c.id] ?? <MoreVertical className="h-4 w-4 text-ink-300" strokeWidth={1.8} />}
                          </span>
                        </div>

                        {c.shares_account && (
                          <p className="mx-3.5 mb-1 flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-xxs text-amber-700">
                            <Link2 className="h-3 w-3" strokeWidth={2} />
                            ใช้บัญชี {c.account_code} ร่วมกับช่องทางอื่น
                            {!c.counts_in_total && ` · ${M.notCounted}`}
                          </p>
                        )}

                        <div className="mt-auto flex items-baseline justify-between border-t border-ink-100 px-3.5 py-2">
                          <span className="font-mono text-xxs text-ink-400">{c.code}</span>
                          <span className={cn('text-sm font-semibold tabular-nums', neg ? 'text-rose-600' : 'text-emerald-600')}>
                            {money(c.balance)} <span className="text-xxs font-normal text-ink-400">{M.baht}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

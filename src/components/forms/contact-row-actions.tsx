'use client';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/provider';
import type { Dictionary } from '@/i18n';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ChevronDown, FileText, ShoppingCart, Receipt, Pencil, ListFilter } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface RowAction {
  label: string;
  href: string;
  icon: 'sales' | 'purchase' | 'doc' | 'edit' | 'list';
}

const ICON = {
  sales: FileText,
  purchase: ShoppingCart,
  doc: Receipt,
  edit: Pencil,
  list: ListFilter,
};

const MENU_W = 208;

/**
 * เมนู "ทำรายการ" ท้ายแถวผู้ติดต่อ
 * เปิดเอกสารใหม่โดยเลือกผู้ติดต่อรายนี้ไว้ให้แล้ว ไม่ต้องมาค้นหาซ้ำ
 *
 * เมนูวาดผ่าน portal ที่ body เพราะตารางมี overflow-x-auto
 * ถ้าวาดในตารางตรง ๆ เมนูจะถูกตัดหายไปทั้งอัน
 */
export function ContactRowActions({
  actions, label,
}: {
  actions: RowAction[];
  label?: string;
}) {
  const menuLabel = label ?? useI18n().dict.ui.rowAction.act;
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // ปิดเมนูเมื่อเลื่อนหน้าจอหรือย่อขยาย ไม่งั้นเมนูจะลอยค้างผิดตำแหน่ง
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (actions.length === 0) return null;

  function toggle() {
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    // กันเมนูล้นขอบขวาและขอบล่างของจอ
    const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8));
    const estHeight = actions.length * 36 + 16;
    const below = window.innerHeight - r.bottom;
    const top = below < estHeight ? Math.max(8, r.top - estHeight - 4) : r.bottom + 4;
    setPos({ top, left });
    setOpen(true);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs transition',
          open
            ? 'border-brand-400 bg-brand-50 text-brand-700'
            : 'border-ink-200 text-ink-600 hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-700'
        )}
      >
        {menuLabel}
        <ChevronDown className={cn('h-3 w-3 transition', open && 'rotate-180')} strokeWidth={2.5} />
      </button>

      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 overflow-hidden rounded-xl border border-ink-200 bg-white py-1 shadow-card"
            style={{ top: pos.top, left: pos.left, width: MENU_W }}
          >
            {actions.map((a, i) => {
              const Icon = ICON[a.icon];
              const divider = i > 0 && actions[i - 1].icon !== a.icon;
              return (
                <div key={a.label}>
                  {divider && <div className="my-1 border-t border-ink-100" />}
                  <Link
                    href={a.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-3.5 py-2 text-sm text-ink-700 hover:bg-brand-50 hover:text-brand-700"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-ink-400" strokeWidth={1.8} />
                    {a.label}
                  </Link>
                </div>
              );
            })}
          </div>
        </>,
        document.body
      )}
    </>
  );
}

/** สร้างรายการคำสั่งตามว่าผู้ติดต่อรายนี้เป็นลูกค้าหรือผู้ขาย */
export function buildRowActions(contactId: string, kind: string, d: Dictionary): RowAction[] {
  const L = d.ui.rowAction;
  const isCustomer = kind === 'customer' || kind === 'both';
  const isVendor = kind === 'vendor' || kind === 'both';
  const out: RowAction[] = [];

  if (isCustomer) {
    out.push(
      { label: L.quotation, href: `/sales/quotations/new?contact=${contactId}`, icon: 'sales' },
      { label: L.invoice, href: `/sales/invoices/new?contact=${contactId}`, icon: 'sales' },
      { label: L.taxInvoice, href: `/sales/tax-invoices/new?contact=${contactId}`, icon: 'sales' },
      { label: L.receipt, href: `/sales/receipts/new?contact=${contactId}`, icon: 'sales' },
    );
  }
  if (isVendor) {
    out.push(
      { label: L.purchaseOrder, href: `/purchase/purchase-orders/new?contact=${contactId}`, icon: 'purchase' },
      { label: L.expense, href: `/purchase/expenses/new?contact=${contactId}`, icon: 'purchase' },
      { label: L.bill, href: `/purchase/bills/new?contact=${contactId}`, icon: 'purchase' },
    );
  }

  out.push({
    label: isCustomer ? L.viewSales : L.viewPurchase,
    href: isCustomer
      ? `/sales/invoices?contact=${contactId}`
      : `/purchase/bills?contact=${contactId}`,
    icon: 'list',
  });

  return out;
}

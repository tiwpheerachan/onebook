import type { Dictionary } from '@/i18n';

export const PURCHASE_SLUGS = [
  'purchase-requests','purchase-orders','goods-receipts','bills','expenses',
  'purchase-credit-notes','purchase-debit-notes','deposit-payments',
];

export function docTitle(d: Dictionary, slug: string): string {
  const map: Record<string, string> = {
    quotations: d.nav.quotations,
    'sales-orders': d.nav.salesOrders,
    'billing-notes': d.nav.billingNotes,
    invoices: d.nav.invoices,
    'tax-invoices': d.nav.taxInvoices,
    receipts: d.nav.receipts,
    'credit-notes': d.nav.creditNotes,
    'debit-notes': d.nav.debitNotes,
    'deposit-receipts': d.nav.depositReceipts,
    'purchase-requests': d.nav.purchaseRequests,
    'purchase-orders': d.nav.purchaseOrders,
    'goods-receipts': d.nav.goodsReceipts,
    bills: d.nav.bills,
    expenses: d.nav.expenses,
    'purchase-credit-notes': d.nav.purchaseCreditNotes,
    'purchase-debit-notes': d.nav.purchaseDebitNotes,
    'deposit-payments': d.nav.depositPayments,
  };
  return map[slug] || slug;
}

export function isPurchase(slug: string) {
  return PURCHASE_SLUGS.includes(slug);
}

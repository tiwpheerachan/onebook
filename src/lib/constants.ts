export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'ONEBOOK';

export type DocKind =
  | 'quotation' | 'sales_order' | 'delivery_order' | 'billing_note' | 'invoice' | 'tax_invoice' | 'receipt'
  | 'credit_note' | 'debit_note' | 'deposit_receipt'
  | 'purchase_request' | 'purchase_order' | 'goods_receipt' | 'bill' | 'expense'
  | 'purchase_credit_note' | 'purchase_debit_note' | 'deposit_payment';

export const SALES_KINDS: DocKind[] = [
  'quotation', 'sales_order', 'delivery_order', 'billing_note', 'invoice', 'tax_invoice', 'receipt',
  'credit_note', 'debit_note', 'deposit_receipt',
];
export const PURCHASE_KINDS: DocKind[] = [
  'purchase_request', 'purchase_order', 'goods_receipt', 'bill', 'expense', 'purchase_credit_note', 'purchase_debit_note', 'deposit_payment',
];

/** slug ที่ใช้ใน URL <-> doc_kind ในฐานข้อมูล */
export const KIND_SLUG: Record<string, DocKind> = {
  quotations: 'quotation',
  'sales-orders': 'sales_order',
  'delivery-orders': 'delivery_order',
  'billing-notes': 'billing_note',
  invoices: 'invoice',
  'tax-invoices': 'tax_invoice',
  receipts: 'receipt',
  'credit-notes': 'credit_note',
  'debit-notes': 'debit_note',
  'deposit-receipts': 'deposit_receipt',
  'purchase-requests': 'purchase_request',
  'purchase-orders': 'purchase_order',
  'goods-receipts': 'goods_receipt',
  bills: 'bill',
  expenses: 'expense',
  'purchase-credit-notes': 'purchase_credit_note',
  'purchase-debit-notes': 'purchase_debit_note',
  'deposit-payments': 'deposit_payment',
};

export const SLUG_BY_KIND: Record<string, string> = Object.fromEntries(
  Object.entries(KIND_SLUG).map(([slug, kind]) => [kind, slug])
);

export const DOC_STATUSES = ['draft','awaiting_approval','approved','partial','paid','overdue','void','closed'] as const;

export const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-ink-100 text-ink-700 ring-ink-200',
  awaiting_approval: 'bg-amber-50 text-amber-700 ring-amber-200',
  approved: 'bg-brand-50 text-brand-700 ring-brand-200',
  partial: 'bg-sky-50 text-sky-700 ring-sky-200',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  overdue: 'bg-rose-50 text-rose-700 ring-rose-200',
  void: 'bg-ink-100 text-ink-400 ring-ink-200 line-through',
  closed: 'bg-ink-100 text-ink-600 ring-ink-200',
};

/** group เป็นคีย์ของพจนานุกรม ui.resGroup ไม่ใช่ข้อความที่แสดงตรง ๆ */
export const RESOURCES = [
  { key: 'documents', group: 'doc' },
  { key: 'tasks', group: 'doc' },
  { key: 'documents.ai_import', group: 'doc' },
  { key: 'contacts', group: 'master' },
  { key: 'products', group: 'master' },
  { key: 'products.inventory', group: 'master' },
  { key: 'finance.channels', group: 'finance' },
  { key: 'finance.payments', group: 'finance' },
  { key: 'finance.reconcile', group: 'finance' },
  { key: 'journal', group: 'accounting' },
  { key: 'accounting.coa', group: 'accounting' },
  { key: 'accounting.assets', group: 'accounting' },
  { key: 'accounting.budget', group: 'accounting' },
  { key: 'tax', group: 'tax' },
  { key: 'tax.etax', group: 'tax' },
  { key: 'report', group: 'report' },
  { key: 'period', group: 'control' },
  { key: 'settings.companies', group: 'settings' },
  { key: 'settings.users', group: 'settings' },
  { key: 'settings.roles', group: 'settings' },
  { key: 'settings.numbering', group: 'settings' },
  { key: 'settings.dimensions', group: 'settings' },
  { key: 'settings.security', group: 'settings' },
  { key: 'settings.marketplace', group: 'settings' },
  { key: 'settings.audit', group: 'settings' },
];

export const ACTIONS = ['view','create','edit','delete','approve','post','void','export','unlock','override'] as const;
export type Action = typeof ACTIONS[number];

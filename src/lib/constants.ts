export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'ONEBOOK';

export type DocKind =
  | 'quotation' | 'billing_note' | 'invoice' | 'tax_invoice' | 'receipt'
  | 'credit_note' | 'debit_note' | 'deposit_receipt'
  | 'purchase_request' | 'purchase_order' | 'goods_receipt' | 'bill' | 'expense'
  | 'purchase_credit_note' | 'purchase_debit_note' | 'deposit_payment';

export const SALES_KINDS: DocKind[] = [
  'quotation', 'billing_note', 'invoice', 'tax_invoice', 'receipt', 'credit_note', 'debit_note', 'deposit_receipt',
];
export const PURCHASE_KINDS: DocKind[] = [
  'purchase_request', 'purchase_order', 'goods_receipt', 'bill', 'expense', 'purchase_credit_note', 'purchase_debit_note', 'deposit_payment',
];

/** slug ที่ใช้ใน URL <-> doc_kind ในฐานข้อมูล */
export const KIND_SLUG: Record<string, DocKind> = {
  quotations: 'quotation',
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

export const RESOURCES = [
  { key: 'documents', group: 'เอกสาร' },
  { key: 'tasks', group: 'เอกสาร' },
  { key: 'documents.ai_import', group: 'เอกสาร' },
  { key: 'contacts', group: 'ข้อมูลหลัก' },
  { key: 'products', group: 'ข้อมูลหลัก' },
  { key: 'products.inventory', group: 'ข้อมูลหลัก' },
  { key: 'finance.channels', group: 'การเงิน' },
  { key: 'finance.payments', group: 'การเงิน' },
  { key: 'finance.reconcile', group: 'การเงิน' },
  { key: 'journal', group: 'บัญชี' },
  { key: 'accounting.coa', group: 'บัญชี' },
  { key: 'accounting.assets', group: 'บัญชี' },
  { key: 'tax', group: 'ภาษี' },
  { key: 'tax.etax', group: 'ภาษี' },
  { key: 'report', group: 'รายงาน' },
  { key: 'period', group: 'ควบคุม' },
  { key: 'settings.companies', group: 'ตั้งค่า' },
  { key: 'settings.users', group: 'ตั้งค่า' },
  { key: 'settings.roles', group: 'ตั้งค่า' },
  { key: 'settings.numbering', group: 'ตั้งค่า' },
  { key: 'settings.security', group: 'ตั้งค่า' },
  { key: 'settings.marketplace', group: 'ตั้งค่า' },
  { key: 'settings.audit', group: 'ตั้งค่า' },
];

export const ACTIONS = ['view','create','edit','delete','approve','post','void','export','unlock','override'] as const;
export type Action = typeof ACTIONS[number];

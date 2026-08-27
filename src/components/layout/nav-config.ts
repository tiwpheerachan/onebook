import type { Dictionary } from '@/i18n';

export interface NavItem { href: string; label: string; resource: string; action?: string }
export interface NavGroup { id: string; label: string; icon: string; items: NavItem[] }

export function buildNav(d: Dictionary): NavGroup[] {
  return [
    {
      id: 'overview', label: d.nav.dashboard, icon: 'LayoutDashboard',
      items: [
        { href: '/dashboard', label: d.nav.dashboard, resource: 'documents' },
        { href: '/group', label: d.nav.group, resource: 'report' },
        { href: '/tasks', label: d.nav.tasks, resource: 'tasks' },
        { href: '/documents/library', label: d.ui.library.title, resource: 'documents' },
      ],
    },
    {
      id: 'sales', label: d.nav.sales, icon: 'TrendingUp',
      items: [
        { href: '/sales', label: d.ui.overview.sales, resource: 'report' },
        { href: '/sales/quotations', label: d.nav.quotations, resource: 'documents' },
        { href: '/sales/billing-notes', label: d.nav.billingNotes, resource: 'documents' },
        { href: '/sales/invoices', label: d.nav.invoices, resource: 'documents' },
        { href: '/sales/tax-invoices', label: d.nav.taxInvoices, resource: 'documents' },
        { href: '/sales/receipts', label: d.nav.receipts, resource: 'documents' },
        { href: '/sales/credit-notes', label: d.nav.creditNotes, resource: 'documents' },
        { href: '/sales/debit-notes', label: d.nav.debitNotes, resource: 'documents' },
        { href: '/sales/deposit-receipts', label: d.nav.depositReceipts, resource: 'documents' },
      ],
    },
    {
      id: 'purchase', label: d.nav.purchase, icon: 'ShoppingCart',
      items: [
        { href: '/purchase', label: d.ui.overview.purchase, resource: 'report' },
        { href: '/purchase/purchase-requests', label: d.nav.purchaseRequests, resource: 'documents' },
        { href: '/purchase/purchase-orders', label: d.nav.purchaseOrders, resource: 'documents' },
        { href: '/purchase/goods-receipts', label: d.nav.goodsReceipts, resource: 'documents' },
        { href: '/purchase/bills', label: d.nav.bills, resource: 'documents' },
        { href: '/purchase/expenses', label: d.nav.expenses, resource: 'documents' },
        { href: '/purchase/purchase-credit-notes', label: d.nav.purchaseCreditNotes, resource: 'documents' },
        { href: '/purchase/deposit-payments', label: d.nav.depositPayments, resource: 'documents' },
        { href: '/documents/ai-import', label: d.nav.aiImport, resource: 'documents.ai_import' },
      ],
    },
    {
      id: 'master', label: d.nav.contacts + ' / ' + d.nav.products, icon: 'Users',
      items: [
        { href: '/contacts', label: d.nav.contacts, resource: 'contacts' },
        { href: '/contacts/cycles', label: d.ui.cycles.title, resource: 'contacts' },
        { href: '/products', label: d.nav.products, resource: 'products' },
        { href: '/products/groups', label: d.ui.pgroup.title, resource: 'products' },
        { href: '/inventory', label: d.nav.inventory, resource: 'products.inventory' },
        { href: '/inventory/warehouses', label: d.ui.warehouse.title, resource: 'products.inventory' },
        { href: '/inventory/counts', label: d.ui.count.title, resource: 'products.inventory' },
        { href: '/inventory/landed-costs', label: d.ui.landed.title, resource: 'products.inventory' },
        { href: '/inventory/reservations', label: d.ui.reserve.title, resource: 'products.inventory' },
      ],
    },
    {
      id: 'finance', label: d.nav.finance, icon: 'Wallet',
      items: [
        { href: '/finance', label: d.ui.overview.finance, resource: 'finance.channels' },
        { href: '/finance/channels', label: d.nav.channels, resource: 'finance.channels' },
        { href: '/finance/payments', label: d.nav.payments, resource: 'finance.payments' },
        { href: '/finance/cheques', label: d.ui.cheque.title, resource: 'finance.payments' },
        { href: '/finance/reconcile', label: d.nav.reconcile, resource: 'finance.reconcile' },
      ],
    },
    {
      id: 'accounting', label: d.nav.accounting, icon: 'BookOpen',
      items: [
        { href: '/accounting/coa', label: d.nav.coa, resource: 'accounting.coa' },
        { href: '/accounting/journal', label: d.nav.journal, resource: 'journal' },
        { href: '/accounting/ledger', label: d.nav.ledger, resource: 'journal' },
        { href: '/accounting/assets', label: d.nav.assets, resource: 'accounting.assets' },
        { href: '/accounting/close-check', label: d.nav.closeCheck, resource: 'report' },
      ],
    },
    {
      id: 'reports', label: d.nav.reports, icon: 'BarChart3',
      items: [
        { href: '/reports/trial-balance', label: d.nav.trialBalance, resource: 'report' },
        { href: '/reports/profit-loss', label: d.nav.profitLoss, resource: 'report' },
        { href: '/reports/balance-sheet', label: d.nav.balanceSheet, resource: 'report' },
        { href: '/reports/ar-aging', label: d.nav.arAging, resource: 'report' },
        { href: '/reports/ap-aging', label: d.nav.apAging, resource: 'report' },
        { href: '/reports/analysis', label: d.ui.analysis.title, resource: 'report' },
      ],
    },
    {
      id: 'tax', label: d.nav.tax, icon: 'Receipt',
      items: [
        { href: '/tax/vat', label: d.nav.vat, resource: 'tax' },
        { href: '/tax/pp30', label: d.nav.pp30, resource: 'tax' },
        { href: '/tax/wht', label: d.nav.wht, resource: 'tax' },
        { href: '/tax/pending', label: d.ui.vatPending.title, resource: 'tax' },
        { href: '/tax/etax', label: d.nav.etax, resource: 'tax.etax' },
      ],
    },
    {
      id: 'settings', label: d.nav.settings, icon: 'Settings',
      items: [
        { href: '/settings', label: d.ui.overview.settings, resource: 'documents' },
        { href: '/settings/profile', label: d.ui.overview.profile, resource: 'documents' },
        { href: '/help', label: d.ui.help.title, resource: 'documents' },
        { href: '/settings/companies', label: d.nav.companies, resource: 'settings.companies' },
        { href: '/settings/users', label: d.nav.users, resource: 'settings.users' },
        { href: '/settings/roles', label: d.nav.roles, resource: 'settings.roles' },
        { href: '/settings/numbering', label: d.nav.numbering, resource: 'settings.numbering' },
        { href: '/settings/data-import', label: d.nav.dataImport, resource: 'contacts', action: 'create' },
        { href: '/settings/demo', label: d.ui.demo.title, resource: 'documents' },
        { href: '/settings/period-lock', label: d.nav.periodLock, resource: 'period' },
        { href: '/settings/security', label: d.nav.security, resource: 'settings.security' },
        { href: '/settings/marketplace', label: d.nav.marketplace, resource: 'settings.marketplace' },
        { href: '/settings/audit', label: d.nav.audit, resource: 'settings.audit' },
      ],
    },
  ];
}

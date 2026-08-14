import { SALES_KINDS, SLUG_BY_KIND, type DocKind } from './constants';
import { docTitle } from '@/components/documents/doc-meta';
import type { Dictionary } from '@/i18n';

/** ผลค้นหาจาก rpt_global_search — ใช้ร่วมกันทั้งฝั่ง server และ client */
export interface SearchDoc {
  id: string; kind: DocKind; doc_number: string; doc_date: string;
  status: string; grand_total: number; currency: string; contact: string | null;
}
export interface SearchContact {
  id: string; code: string; name: string; kind: string;
  tax_id: string | null; phone: string | null; email: string | null;
}
export interface SearchProduct {
  id: string; sku: string; name: string; unit: string; sale_price: number; is_active: boolean;
}
export interface SearchTask {
  id: string; title: string; status: string; priority: string; due_at: string | null;
}
export interface SearchResult {
  documents: SearchDoc[]; contacts: SearchContact[];
  products: SearchProduct[]; tasks: SearchTask[];
}

export const EMPTY_RESULT: SearchResult = { documents: [], contacts: [], products: [], tasks: [] };

/** เอกสารขายกับเอกสารซื้ออยู่คนละสาขาของ URL */
export function docHref(kind: DocKind, id: string): string {
  const base = SALES_KINDS.includes(kind) ? 'sales' : 'purchase';
  return `/${base}/${SLUG_BY_KIND[kind]}/${id}`;
}

/** ชื่อประเภทเอกสารใช้ของเดิมใน d.nav อยู่แล้ว ไม่ต้องมีชุดคำแปลซ้ำ */
export function docKindLabel(d: Dictionary, kind: string): string {
  return docTitle(d, SLUG_BY_KIND[kind]) || kind;
}

export function contactKindLabel(d: Dictionary, kind: string): string {
  return (d.ui.contactKind as Record<string, string>)[kind] || kind;
}

export function taskStatusLabel(d: Dictionary, status: string): string {
  return (d.ui.taskStatus as Record<string, string>)[status] || status;
}

export function countResults(r: SearchResult): number {
  return r.documents.length + r.contacts.length + r.products.length + r.tasks.length;
}

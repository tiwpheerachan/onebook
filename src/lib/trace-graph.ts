/**
 * จัดวางตำแหน่งโหนดของแผนภาพที่มาของตัวเลข
 *
 * แยกออกมาจากคอมโพเนนต์เพราะเป็นตรรกะล้วน ๆ ไม่มี React
 * ทดสอบได้ตรง ๆ และคอมโพเนนต์เหลือแค่หน้าที่วาด
 *
 * ผังที่ต้องการ
 *   ซ้ายสุด   คู่ค้า (ใครเป็นต้นเรื่อง)
 *   แถวบน     สายธารเอกสาร เรียงซ้าย→ขวาตามลำดับที่ออก
 *   แถวล่าง   สิ่งที่เอกสารแต่ละใบทำให้เกิดขึ้น — ลงบัญชี จ่ายเงิน ตัดสต๊อก ออกเอกสารภาษี
 */

export type NodeType = 'document' | 'journal' | 'payment' | 'stock' | 'tax' | 'contact';
export type EdgeKind = 'derives' | 'posts' | 'settles' | 'moves' | 'issues' | 'party';

export interface GraphNode {
  id: string;
  ref: string;
  type: NodeType;
  kind?: string;
  label: string;
  sublabel?: string | null;
  date?: string | null;
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
  direction?: string | null;
  depth: number;
  current: boolean;
}

export interface GraphEdge { from: string; to: string; kind: EdgeKind }

export interface GraphInput { root: string; nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean }

export interface Placed extends GraphNode { x: number; y: number; w: number; h: number }

export interface Layout {
  nodes: Placed[];
  edges: (GraphEdge & { path: string })[];
  width: number;
  height: number;
}

export const NODE_W = 150;
export const NODE_H = 52;
const COL_GAP = 74;
const ROW_GAP = 18;
const BAND_GAP = 54;
const PAD = 20;

/** เส้นโค้งจากขอบขวาของโหนดต้นทางไปขอบซ้ายของปลายทาง */
function curve(a: Placed, b: Placed): string {
  const x1 = a.x + a.w, y1 = a.y + a.h / 2;
  const x2 = b.x, y2 = b.y + b.h / 2;
  // ถ้าปลายทางอยู่ทางซ้าย (เช่นดาวเทียมใต้ใบเดียวกัน) ให้ออกจากด้านล่างแทน
  if (x2 <= x1) {
    const sx = a.x + a.w / 2, sy = a.y + a.h;
    const ex = b.x + b.w / 2, ey = b.y;
    const mid = (sy + ey) / 2;
    return `M ${sx} ${sy} C ${sx} ${mid}, ${ex} ${mid}, ${ex} ${ey}`;
  }
  const dx = Math.max(28, (x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export function layout(g: GraphInput): Layout {
  const docs = g.nodes.filter((n) => n.type === 'document');
  const contacts = g.nodes.filter((n) => n.type === 'contact');
  const sats = g.nodes.filter((n) => n.type !== 'document' && n.type !== 'contact');

  // ดาวเทียมผูกกับเอกสารใบไหน ดูจากเส้นที่ชี้เข้ามา
  const parentOf = new Map<string, string>();
  for (const e of g.edges) {
    if (e.kind !== 'derives' && e.kind !== 'party') parentOf.set(e.to, e.from);
  }

  /* ---------- แถวบน : เอกสาร ---------- */
  const depths = Array.from(new Set(docs.map((d) => d.depth))).sort((a, b) => a - b);
  const colIndex = new Map(depths.map((d, i) => [d, i]));
  const hasContact = contacts.length > 0;
  const xOf = (depth: number) => PAD + ((colIndex.get(depth) ?? 0) + (hasContact ? 1 : 0)) * (NODE_W + COL_GAP);

  const byDepth = new Map<number, GraphNode[]>();
  for (const d of docs) {
    const list = byDepth.get(d.depth) || [];
    list.push(d);
    byDepth.set(d.depth, list);
  }
  for (const list of byDepth.values()) {
    list.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || a.label.localeCompare(b.label));
  }

  const tallest = Math.max(1, ...Array.from(byDepth.values()).map((l) => l.length));
  const bandH = tallest * NODE_H + (tallest - 1) * ROW_GAP;

  const placed: Placed[] = [];
  for (const [depth, list] of byDepth) {
    const colH = list.length * NODE_H + (list.length - 1) * ROW_GAP;
    const top = PAD + (bandH - colH) / 2;
    list.forEach((n, i) => {
      placed.push({ ...n, x: xOf(depth), y: top + i * (NODE_H + ROW_GAP), w: NODE_W, h: NODE_H });
    });
  }

  /* ---------- ซ้ายสุด : คู่ค้า ---------- */
  contacts.forEach((c, i) => {
    placed.push({
      ...c,
      x: PAD,
      y: PAD + (bandH - NODE_H) / 2 + i * (NODE_H + ROW_GAP),
      w: NODE_W, h: NODE_H,
    });
  });

  /* ---------- แถวล่าง : สิ่งที่เอกสารทำให้เกิด ---------- */
  const satTop = PAD + bandH + BAND_GAP;
  const perDoc = new Map<string, GraphNode[]>();
  for (const s of sats) {
    const p = parentOf.get(s.id) || `doc:${g.root}`;
    const list = perDoc.get(p) || [];
    list.push(s);
    perDoc.set(p, list);
  }

  let satRows = 0;
  for (const [docId, list] of perDoc) {
    const parent = placed.find((p) => p.id === docId);
    const x = parent ? parent.x : PAD;
    // เรียงให้แน่นอน ไม่ให้ตำแหน่งเปลี่ยนไปมาระหว่างโหลด
    list.sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label));
    list.forEach((s, i) => {
      placed.push({ ...s, x, y: satTop + i * (NODE_H + ROW_GAP), w: NODE_W, h: NODE_H });
    });
    satRows = Math.max(satRows, list.length);
  }

  const byId = new Map(placed.map((p) => [p.id, p]));
  const edges = g.edges
    .filter((e) => byId.has(e.from) && byId.has(e.to))
    .map((e) => ({ ...e, path: curve(byId.get(e.from)!, byId.get(e.to)!) }));

  const width = Math.max(...placed.map((p) => p.x + p.w), PAD) + PAD;
  const height = satRows > 0
    ? satTop + satRows * NODE_H + (satRows - 1) * ROW_GAP + PAD
    : PAD + bandH + PAD;

  return { nodes: placed, edges, width, height };
}

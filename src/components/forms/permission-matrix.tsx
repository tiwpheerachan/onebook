'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { ShdSpinner } from '@/components/ui/shd-loader';
import { RESOURCES, ACTIONS } from '@/lib/constants';
import { saveRolePermission } from '@/actions/settings';
import { cn } from '@/lib/cn';

const ACTION_LABEL: Record<string, string> = {
  view: 'ดู', create: 'สร้าง', edit: 'แก้ไข', delete: 'ลบ', approve: 'อนุมัติ',
  post: 'ผ่านรายการ', void: 'ยกเลิก', export: 'ส่งออก', unlock: 'ปลดล็อกงวด', override: 'ข้ามข้อจำกัด',
};

const RESOURCE_LABEL: Record<string, string> = {
  documents: 'เอกสารซื้อ-ขาย', contacts: 'ผู้ติดต่อ', products: 'สินค้า/บริการ',
  'finance.channels': 'ช่องทางการเงิน', 'finance.payments': 'รับ-จ่ายเงิน',
  journal: 'สมุดรายวัน', 'accounting.coa': 'ผังบัญชี', tax: 'ภาษี', report: 'รายงาน/งบการเงิน',
  period: 'ปิดงวด (Freeze)', 'settings.companies': 'บริษัทในเครือ', 'settings.users': 'ผู้ใช้งาน',
  'settings.roles': 'บทบาทและสิทธิ์', 'settings.numbering': 'เลขที่เอกสาร',
  'settings.security': 'ความปลอดภัย', 'settings.audit': 'ประวัติการใช้งาน',
};

export function PermissionMatrix({
  roles, permissions, canEdit,
}: {
  roles: { id: string; code: string; name: string; isSystem: boolean }[];
  permissions: { role_id: string; resource: string; actions: string[] }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [roleId, setRoleId] = useState(roles[0]?.id || '');
  const [local, setLocal] = useState<Record<string, string[]>>(() => {
    const m: Record<string, string[]> = {};
    for (const p of permissions) m[`${p.role_id}|${p.resource}`] = p.actions || [];
    return m;
  });
  const [saving, setSaving] = useState('');

  const role = roles.find((r) => r.id === roleId);
  const wildcard = local[`${roleId}|*`] || [];

  function has(resource: string, action: string) {
    if (wildcard.includes('*') || wildcard.includes(action)) return true;
    const acts = local[`${roleId}|${resource}`] || [];
    return acts.includes('*') || acts.includes(action);
  }

  function toggle(resource: string, action: string) {
    if (!canEdit) return;
    const key = `${roleId}|${resource}`;
    const cur = local[key] || [];
    const next = cur.includes(action) ? cur.filter((a) => a !== action) : [...cur, action];
    setLocal({ ...local, [key]: next });
    setSaving(key + action);
    start(async () => {
      await saveRolePermission({ role_id: roleId, resource, actions: next });
      setSaving('');
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        {roles.map((r) => (
          <button
            key={r.id}
            onClick={() => setRoleId(r.id)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm transition',
              r.id === roleId ? 'border-brand-500 bg-brand-50 font-medium text-brand-700' : 'border-ink-300 bg-white text-ink-600 hover:bg-ink-50'
            )}
          >
            {r.name}
          </button>
        ))}
      </div>

      {wildcard.length > 0 && (
        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
          บทบาท &quot;{role?.name}&quot; มีสิทธิ์ระดับ * (ทุกเมนู) — ช่องด้านล่างจะแสดงเป็นติ๊กทั้งหมด
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-ink-200">
        <table className="min-w-full divide-y divide-ink-200">
          <thead className="bg-ink-50">
            <tr>
              <th className="th-cell sticky left-0 z-10 bg-ink-50 text-left">เมนู / ทรัพยากร</th>
              {ACTIONS.map((a) => <th key={a} className="th-cell text-center">{ACTION_LABEL[a]}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 bg-white">
            {RESOURCES.map((r) => (
              <tr key={r.key} className="hover:bg-brand-50/30">
                <td className="td-cell sticky left-0 z-10 bg-white">
                  <span className="font-medium text-ink-800">{RESOURCE_LABEL[r.key] || r.key}</span>
                  <span className="ml-2 font-mono text-xxs text-ink-400">{r.key}</span>
                </td>
                {ACTIONS.map((a) => {
                  const on = has(r.key, a);
                  const busy = saving === `${roleId}|${r.key}${a}`;
                  return (
                    <td key={a} className="px-2 py-2 text-center">
                      <button
                        type="button"
                        disabled={!canEdit || pending}
                        onClick={() => toggle(r.key, a)}
                        className={cn(
                          'inline-flex h-6 w-6 items-center justify-center rounded border transition',
                          on ? 'border-brand-500 bg-brand-500 text-white' : 'border-ink-300 bg-white hover:border-brand-400',
                          !canEdit && 'cursor-not-allowed opacity-60'
                        )}
                      >
                        {busy ? <ShdSpinner size={12} /> : on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

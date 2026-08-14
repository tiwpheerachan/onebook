import 'server-only';

/**
 * ตัวเรียก AI ตัวเดียวที่ใช้ร่วมกันทั้งระบบ
 *
 * รองรับสองแบบ แยกอัตโนมัติจาก AI_API_URL
 *   - Anthropic (Claude) : POST /messages     ใช้ header x-api-key
 *   - OpenAI-compatible  : POST /chat/completions ใช้ header Authorization: Bearer
 *     (OpenAI, Typhoon, OpenRouter, Gemini ผ่าน endpoint แบบ OpenAI ฯลฯ)
 *
 * ทุกงานในระบบขอคำตอบเป็น JSON เสมอ เพราะเราเอาไปวางบนหน้าจอโดยตรง
 * ตัวแยก JSON จึงทนกับการที่โมเดลห่อคำตอบด้วย ``` หรือมีข้อความนำหน้า
 */

export type AiProvider = 'anthropic' | 'openai';

export function aiProvider(): AiProvider | null {
  const url = process.env.AI_API_URL;
  if (!url || !process.env.AI_API_KEY) return null;
  return /anthropic\.com/i.test(url) ? 'anthropic' : 'openai';
}

export function isAiConfigured(): boolean {
  return aiProvider() !== null;
}

const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
};

/** ดึงก้อน JSON ออกจากคำตอบ แม้โมเดลจะห่อด้วย ``` หรือมีคำอธิบายนำหน้า */
export function extractJson(raw: string): any | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    // เผื่อโมเดลพิมพ์ข้อความนำหน้า ให้หยิบเฉพาะช่วงวงเล็บปีกกาชั้นนอกสุด
    const s = cleaned.indexOf('{');
    const e = cleaned.lastIndexOf('}');
    if (s < 0 || e <= s) return null;
    try {
      return JSON.parse(cleaned.slice(s, e + 1));
    } catch {
      return null;
    }
  }
}

export interface AskResult {
  ok: boolean;
  data?: any;
  /** เหตุผลที่ใช้ไม่ได้ เอาไปแสดงบนหน้าจอให้ผู้ใช้รู้ว่าทำไมถึงเป็นสรุปสำรอง */
  note?: string;
}

/**
 * ถาม AI แล้วบังคับให้ตอบเป็น JSON
 * ไม่โยน error ออกไป — ผู้เรียกจะได้เลือกใช้สรุปสำรองได้เสมอ
 */
export async function askJson(
  system: string,
  user: string,
  opts: { maxTokens?: number; temperature?: number; timeoutMs?: number } = {}
): Promise<AskResult> {
  const provider = aiProvider();
  if (!provider) {
    return {
      ok: false,
      note: 'ยังไม่ได้ตั้งค่า AI — ตั้ง AI_API_URL และ AI_API_KEY เพื่อให้ AI ช่วยเรียบเรียง',
    };
  }

  const base = (process.env.AI_API_URL || '').replace(/\/+$/, '');
  const model = process.env.AI_MODEL || DEFAULT_MODEL[provider];
  const maxTokens = opts.maxTokens ?? 1024;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000);

  try {
    const res =
      provider === 'anthropic'
        ? await fetch(`${base}/messages`, {
            method: 'POST',
            signal: ctrl.signal,
            cache: 'no-store',
            headers: {
              'content-type': 'application/json',
              'x-api-key': process.env.AI_API_KEY!,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model,
              max_tokens: maxTokens,
              temperature: opts.temperature ?? 0.3,
              system,
              messages: [{ role: 'user', content: user }],
            }),
          })
        : await fetch(`${base}/chat/completions`, {
            method: 'POST',
            signal: ctrl.signal,
            cache: 'no-store',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${process.env.AI_API_KEY}`,
            },
            body: JSON.stringify({
              model,
              max_tokens: maxTokens,
              temperature: opts.temperature ?? 0.3,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
              ],
            }),
          });

    clearTimeout(timer);

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const hint =
        res.status === 401 ? ' (คีย์ไม่ถูกต้อง)' :
        res.status === 404 ? ' (AI_API_URL ไม่ถูกต้อง)' :
        res.status === 429 ? ' (เรียกถี่เกินไปหรือโควตาหมด)' : '';
      return {
        ok: false,
        note: `เรียก AI ไม่สำเร็จ HTTP ${res.status}${hint} จึงใช้สรุปอัตโนมัติแทน`,
        data: detail.slice(0, 200),
      };
    }

    const json: any = await res.json();
    const raw =
      provider === 'anthropic'
        ? json?.content?.find((c: any) => c.type === 'text')?.text
        : json?.choices?.[0]?.message?.content;

    const parsed = extractJson(raw || '');
    if (!parsed) {
      return { ok: false, note: 'AI ตอบกลับมาในรูปแบบที่อ่านไม่ได้ จึงใช้สรุปอัตโนมัติแทน' };
    }
    return { ok: true, data: parsed };
  } catch (e: any) {
    clearTimeout(timer);
    const reason = e?.name === 'AbortError' ? 'AI ตอบช้าเกินไป' : 'เรียก AI ไม่สำเร็จ';
    return { ok: false, note: `${reason} จึงใช้สรุปอัตโนมัติแทน` };
  }
}

// ขอบเรืองแสงวิ่งรอบ (border beam) — ทำเองด้วย CSS ล้วน ไม่พึ่ง dependency ภายนอก
// วิธีใช้: วางไว้ในกล่องที่เป็น position:relative แล้วมันจะวาดลำแสงวิ่งรอบขอบกล่องนั้น
//   <div className="relative rounded-lg">
//     <input className="input" />
//     <BorderBeam />
//   </div>
// สไตล์อยู่ใน globals.css (.border-beam-overlay) — ปรับสี/ความเร็ว/ความหนาได้ที่นั่น
import { memo } from 'react';

export interface BorderBeamProps {
  /** คลาสเสริม (เช่นปรับ border-radius ให้ตรงกับกล่อง) */
  className?: string;
}

function BorderBeamBase({ className }: BorderBeamProps) {
  return <span aria-hidden="true" className={`border-beam-overlay${className ? ' ' + className : ''}`} />;
}

export const BorderBeam = memo(BorderBeamBase);
export default BorderBeam;

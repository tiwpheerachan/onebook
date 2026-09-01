export { money, thaiDate, localeDate, round2 } from './format';
import { bahtText } from './baht-text';

export function bahtTextSafe(n: number): string {
  try {
    return '( ' + bahtText(n) + ' )';
  } catch {
    return '';
  }
}

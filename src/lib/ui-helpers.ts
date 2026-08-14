export { money, thaiDate, localeDate, round2 } from './format';
import { bahtText } from './tax';

export function bahtTextSafe(n: number): string {
  try {
    return '( ' + bahtText(n) + ' )';
  } catch {
    return '';
  }
}

import type { Config } from 'tailwindcss';

// สีหลักของแบรนด์ ดูดมาจากโลโก้ ONEBOOK (พื้นเขียวหัวเป็ด #013c44 + มิ้นต์ #e3fef7)
const sea = {
  50: '#eefbf8', 100: '#d3f5ee', 200: '#a9eade', 300: '#72d8c9',
  400: '#3cbdb0', 500: '#1fa198', 600: '#14827c', 700: '#136865',
  800: '#135353', 900: '#013c44', 950: '#012a30',
};

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // brand ชี้มาที่ชุดสีโลโก้ ทุกที่ที่ใช้ brand-* จึงเปลี่ยนธีมพร้อมกันทั้งระบบ
        brand: sea,
        sea,
        ink: {
          50: '#f7f8fa', 100: '#eef0f4', 200: '#dfe3ea', 300: '#c6cdd9',
          400: '#98a2b3', 500: '#6b7688', 600: '#4d5768', 700: '#3a4353',
          800: '#242b38', 900: '#151a23',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Sarabun', 'Noto Sans Thai', 'Noto Sans SC', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.06)',
        pop: '0 8px 24px -4px rgb(16 24 40 / 0.12), 0 2px 6px -2px rgb(16 24 40 / 0.06)',
      },
      fontSize: { xxs: ['0.6875rem', '1rem'] },
    },
  },
  plugins: [],
};
export default config;

# คู่มือนำขึ้นใช้งาน (Deployment)

## ตัวเลือก A — เซิร์ฟเวอร์ภายในองค์กร (แนะนำสำหรับความปลอดภัยสูงสุด)

### Dockerfile
```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
docker build -t onebook .
docker run -d --name onebook --env-file .env.local -p 127.0.0.1:3000:3000 onebook
```

### nginx (เปิดเฉพาะวง LAN + TLS)
```nginx
server {
    listen 443 ssl http2;
    server_name accounting.internal.example.com;

    ssl_certificate     /etc/ssl/certs/internal.crt;
    ssl_certificate_key /etc/ssl/private/internal.key;

    allow 10.0.0.0/8;
    allow 192.168.0.0/16;
    deny  all;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```
> สำคัญ: ต้องส่ง `X-Forwarded-For` มาด้วย มิฉะนั้น middleware จะอ่าน IP ต้นทางไม่ได้

## ตัวเลือก B — Vercel / cloud + IP allowlist
ตั้งค่า Environment Variables ตาม `.env.example` และตั้ง `ALLOWED_IPS` เป็นวง IP ของออฟฟิศหรือ VPN
เพิ่มความปลอดภัยด้วย Vercel Firewall หรือ Cloudflare Access

## การสำรองข้อมูล
```bash
# ทั้งฐานข้อมูล
supabase db dump -f backup-$(date +%F).sql

# หรือ pg_dump ตรง
pg_dump "postgresql://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres" > backup.sql
```
แนะนำตั้ง cron รายวัน และเก็บสำเนาไว้นอกสถานที่อย่างน้อย 30 วัน

## การอัปเกรด
```bash
npm outdated
npm update
npm run build   # ต้องผ่านก่อน deploy
```

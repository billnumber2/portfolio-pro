# Portfolio Pro

台股 + 美股投資庫存與績效追蹤網站。

## 1. Supabase

先到 Supabase SQL Editor 執行：

```sql
-- 複製 supabase/migration.sql 的內容執行
```

## 2. 本機執行

```bash
npm install
cp .env.example .env.local
npm run dev
```

開啟：

```text
http://localhost:3000
```

## 3. Vercel 環境變數

```text
NEXT_PUBLIC_SUPABASE_URL=https://yobmyrjejrknvmkxawuf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_o2tPZFOjweuKV9DnT5mBWg_cfzT7vyw
```

## 4. GitHub 上傳

```bash
git init
git add .
git commit -m "Initial Portfolio Pro"
git branch -M main
git remote add origin https://github.com/billnumber2/portfolio-pro.git
git push -u origin main
```

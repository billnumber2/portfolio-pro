-- Portfolio Pro schema patch
-- 可重複執行：會補齊目前網站需要的欄位，不會刪除既有資料。

alter table if exists positions add column if not exists name text;
alter table if exists positions add column if not exists stock_name text;
alter table if exists positions add column if not exists currency text default 'TWD';
alter table if exists positions add column if not exists sector text;
alter table if exists positions add column if not exists note text;
alter table if exists positions add column if not exists updated_at timestamptz default now();
update positions set name = stock_name where name is null and stock_name is not null;
update positions set stock_name = name where stock_name is null and name is not null;

alter table if exists trades add column if not exists position_id uuid;
alter table if exists trades add column if not exists date date;
alter table if exists trades add column if not exists trade_date date;
alter table if exists trades add column if not exists currency text default 'TWD';
alter table if exists trades add column if not exists note text;
alter table if exists trades add column if not exists created_at timestamptz default now();
update trades set date = trade_date where date is null and trade_date is not null;
update trades set trade_date = date where trade_date is null and date is not null;

alter table if exists dividends add column if not exists market text default 'TW';
alter table if exists dividends add column if not exists pay_date date;
alter table if exists dividends add column if not exists currency text default 'TWD';
alter table if exists dividends add column if not exists note text;
alter table if exists dividends add column if not exists created_at timestamptz default now();

-- 暫時不啟用 RLS，先確認前端能同步成功。
-- 等確認登入與 user_id 寫入正常後，再啟用 RLS。

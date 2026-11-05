import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const EPSILON = 0.000001;
const YAHOO_CONCURRENCY = 5;
const PAGE_SIZE = 1000;

type StockMasterRow = { symbol:string; stock_name:string|null; market:string; yahoo_symbol:string };
type TradeRow = { id:string; created_at:string|null; trade_date:string; symbol:string; side:string|null; shares:number|string|null; split_from:number|string|null; split_to:number|string|null };
type YahooPriceRow = { price_date:string; open_price:number|null; high_price:number|null; low_price:number|null; close_price:number; adjusted_close_price:number|null; volume:number|null };
type YahooChartResponse = { chart?: { result?: Array<{ meta?: { exchangeTimezoneName?:string; timezone?:string }; timestamp?:number[]; indicators?:{ quote?:Array<{open?:Array<number|null>;high?:Array<number|null>;low?:Array<number|null>;close?:Array<number|null>;volume?:Array<number|null>}>; adjclose?:Array<{adjclose?:Array<number|null>}> } }>; error?:{code?:string;description?:string}|null } };
type HoldingState = { currentShares:number; everHeld:boolean; lastExitDate:string|null; warnings:string[] };
type SymbolResult = { symbol:string; yahooSymbol:string; currentShares:number; lastExitDate:string|null; latestExistingDate:string|null; effectiveStartDate:string|null; effectiveEndDate:string|null; fetchedRows:number; insertedRows:number; status:string; warnings:string[]; error?:string };
type FetchJob = { index:number; stock:StockMasterRow; holding:HoldingState; latestExistingDate:string|null; effectiveStartDate:string; effectiveEndDate:string };

function getSupabaseClient(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key) throw new Error("Missing Supabase environment variables.");
  return createClient(url,key);
}
function normalizeSymbol(v:unknown){return String(v??"").trim().toUpperCase()}
function toNumber(v:unknown,f=0){if(v===""||v==null)return f;const n=Number(v);return Number.isFinite(n)?n:f}
function round6(v:number){return Math.round(v*1_000_000)/1_000_000}
function assertIsoDate(v:string,n:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(v))throw new Error(`${n} must use YYYY-MM-DD format.`);const d=new Date(`${v}T00:00:00.000Z`);if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==v)throw new Error(`${n} is not a valid calendar date.`)}
function addDays(v:string,d:number){const x=new Date(`${v}T00:00:00.000Z`);x.setUTCDate(x.getUTCDate()+d);return x.toISOString().slice(0,10)}
function maxDate(a:string,b:string){return a>=b?a:b}
function minNullableDate(a:string|null,b:string|null){if(!b)return a;if(!a)return b;return b<a?b:a}
function maxNullableDate(a:string|null,b:string|null){if(!b)return a;if(!a)return b;return b>a?b:a}
function toUnixSeconds(v:string){return Math.floor(new Date(`${v}T00:00:00.000Z`).getTime()/1000)}
function timestampToMarketDate(seconds:number,timeZone:string){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(seconds*1000));
  const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  if(!values.year||!values.month||!values.day) throw new Error(`Unable to convert Yahoo timestamp using timezone ${timeZone}.`);
  return `${values.year}-${values.month}-${values.day}`;
}
async function fetchAllPages<T>(q:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>,size=PAGE_SIZE){const all:T[]=[];let from=0;while(true){const {data,error}=await q(from,from+size-1);if(error)throw error;const rows=(data||[])as T[];all.push(...rows);if(rows.length<size)break;from+=size}return all}
function emptyState():HoldingState{return{currentShares:0,everHeld:false,lastExitDate:null,warnings:[]}}
function calculateHoldingStates(stocks:StockMasterRow[],trades:TradeRow[]){
  const states=new Map<string,HoldingState>();for(const s of stocks)states.set(normalizeSymbol(s.symbol),emptyState());
  for(const t of trades){const s=states.get(normalizeSymbol(t.symbol));if(!s)continue;const side=String(t.side||"").trim().toLowerCase(),date=t.trade_date,shares=toNumber(t.shares),before=s.currentShares;
    if(side==="buy"){if(shares<=EPSILON){s.warnings.push(`${date}: buy shares ${shares} is not greater than EPSILON and was ignored.`);continue}s.currentShares+=shares;s.everHeld=s.currentShares>EPSILON||s.everHeld}
    else if(side==="sell"){if(shares<=EPSILON){s.warnings.push(`${date}: sell shares ${shares} is not greater than EPSILON and was ignored.`);continue}if(shares>before+EPSILON){s.warnings.push(`${date}: sell shares ${shares} exceeded available shares ${round6(before)}; current shares were clamped to zero.`);s.currentShares=0}else{s.currentShares=before-shares;if(s.currentShares<=EPSILON)s.currentShares=0}if(before>EPSILON&&s.currentShares<=EPSILON)s.lastExitDate=date}
    else if(side==="split"){const a=toNumber(t.split_from),b=toNumber(t.split_to);if(a<=EPSILON||b<=EPSILON){s.warnings.push(`${date}: invalid split ratio ${a}:${b}; split was ignored.`);continue}if(s.currentShares>EPSILON){s.currentShares*=b/a;if(s.currentShares<=EPSILON){s.currentShares=0;s.lastExitDate=date}else s.everHeld=true}}
  }
  for(const s of states.values())s.currentShares=s.currentShares>EPSILON?round6(s.currentShares):0;return states;
}
async function fetchYahooHistoricalPrices(yahooSymbol:string,startDate:string,endDate:string):Promise<YahooPriceRow[]>{
  const period1=toUnixSeconds(startDate),period2=toUnixSeconds(addDays(endDate,1));
  const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?period1=${period1}&period2=${period2}&interval=1d&events=history&includeAdjustedClose=true`;
  const response=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0",Accept:"application/json"},cache:"no-store"});
  if(!response.ok)throw new Error(`Yahoo request failed for ${yahooSymbol}: ${response.status}`);
  const data=(await response.json())as YahooChartResponse;if(data.chart?.error)throw new Error(`Yahoo error for ${yahooSymbol}: ${data.chart.error.description||data.chart.error.code||"unknown error"}`);
  const result=data.chart?.result?.[0];if(!result?.timestamp||!result.indicators?.quote?.[0])return[];
  const timeZone=result.meta?.exchangeTimezoneName||result.meta?.timezone;
  if(!timeZone)throw new Error(`Yahoo did not return exchange timezone for ${yahooSymbol}.`);
  const quote=result.indicators.quote[0],adj=result.indicators.adjclose?.[0]?.adjclose||[];
  return result.timestamp.map((ts,i):YahooPriceRow|null=>{const close=quote.close?.[i];if(close==null||!Number.isFinite(Number(close)))return null;return{price_date:timestampToMarketDate(ts,timeZone),open_price:quote.open?.[i]??null,high_price:quote.high?.[i]??null,low_price:quote.low?.[i]??null,close_price:Number(close),adjusted_close_price:adj[i]??null,volume:quote.volume?.[i]??null}}).filter((r):r is YahooPriceRow=>r!==null).filter(r=>r.price_date>=startDate&&r.price_date<=endDate);
}
async function runLimited<T>(jobs:T[],limit:number,worker:(j:T)=>Promise<void>){let next=0;async function run(){while(true){const i=next++;if(i>=jobs.length)return;await worker(jobs[i])}}await Promise.all(Array.from({length:Math.min(Math.max(limit,1),jobs.length)},run))}

export async function GET(request:Request){
 const startedAt=new Date().toISOString();
 try{
  const supabase=getSupabaseClient(),params=new URL(request.url).searchParams;
  const startDate=params.get("start")||"2024-08-06",endDate=params.get("end")||new Date().toISOString().slice(0,10),onlySymbol=normalizeSymbol(params.get("symbol"))||null,dryRun=params.get("dryRun")==="1",forceFull=params.get("forceFull")==="1";
  assertIsoDate(startDate,"start");assertIsoDate(endDate,"end");if(startDate>endDate)throw new Error("start must be on or before end.");
  let stockQuery=supabase.from("stock_master").select("symbol, stock_name, market, yahoo_symbol").order("symbol",{ascending:true});if(onlySymbol)stockQuery=stockQuery.eq("symbol",onlySymbol);
  const {data:stocks,error:stockError}=await stockQuery;if(stockError)throw stockError;const stockRows=(stocks||[])as StockMasterRow[];
  if(!stockRows.length)return NextResponse.json({success:false,message:"No stocks found in stock_master.",error:"No stocks found in stock_master.",startedAt,finishedAt:new Date().toISOString(),startDate,endDate,onlySymbol,forceFull,dryRun,symbolsCount:0,symbolsInMaster:0,currentlyHeld:0,exitedAndSkipped:0,neverHeldAndSkipped:0,symbolsFetched:0,concurrency:YAHOO_CONCURRENCY,totalFetchedRows:0,totalInsertedRows:0,earliestInsertedDate:null,latestInsertedDate:null,failedCount:0,results:[]},{status:404});
  const symbols=stockRows.map(s=>normalizeSymbol(s.symbol));
  const trades=await fetchAllPages<TradeRow>((from,to)=>supabase.from("trades").select("id, created_at, trade_date, symbol, side, shares, split_from, split_to").in("symbol",symbols).order("trade_date",{ascending:true}).order("created_at",{ascending:true}).order("id",{ascending:true}).range(from,to));
  const states=calculateHoldingStates(stockRows,trades),results:Array<SymbolResult|undefined>=new Array(stockRows.length),jobs:FetchJob[]=[];let currentlyHeld=0,exitedAndSkipped=0,neverHeldAndSkipped=0;
  for(let index=0;index<stockRows.length;index++){const stock=stockRows[index],holding=states.get(normalizeSymbol(stock.symbol))||emptyState(),held=holding.currentShares>EPSILON;if(held)currentlyHeld++;
   const {data:latestPrice,error}=await supabase.from("historical_prices").select("price_date").eq("symbol",stock.symbol).order("price_date",{ascending:false}).limit(1).maybeSingle();if(error)throw error;const latestExistingDate=latestPrice?.price_date||null;
   if(!holding.everHeld){neverHeldAndSkipped++;results[index]={symbol:stock.symbol,yahooSymbol:stock.yahoo_symbol,currentShares:holding.currentShares,lastExitDate:holding.lastExitDate,latestExistingDate,effectiveStartDate:null,effectiveEndDate:null,fetchedRows:0,insertedRows:0,status:"never_held_skipped",warnings:holding.warnings};continue}
   const effectiveEndDate=held?endDate:holding.lastExitDate;if(!effectiveEndDate){exitedAndSkipped++;results[index]={symbol:stock.symbol,yahooSymbol:stock.yahoo_symbol,currentShares:holding.currentShares,lastExitDate:holding.lastExitDate,latestExistingDate,effectiveStartDate:null,effectiveEndDate:null,fetchedRows:0,insertedRows:0,status:"no_sync_end_date_skipped",warnings:[...holding.warnings,"The symbol was held previously but no complete exit date could be derived."]};continue}
   const refreshEnd=held||holding.lastExitDate===endDate;const effectiveStartDate=latestExistingDate?(refreshEnd&&latestExistingDate>=effectiveEndDate?effectiveEndDate:maxDate(startDate,addDays(latestExistingDate,1))):startDate;
   if(effectiveStartDate>effectiveEndDate){if(!held)exitedAndSkipped++;results[index]={symbol:stock.symbol,yahooSymbol:stock.yahoo_symbol,currentShares:holding.currentShares,lastExitDate:holding.lastExitDate,latestExistingDate,effectiveStartDate,effectiveEndDate,fetchedRows:0,insertedRows:0,status:held?"up_to_date":"exited_history_complete_skipped",warnings:holding.warnings};continue}
   if(!stock.yahoo_symbol){results[index]={symbol:stock.symbol,yahooSymbol:stock.yahoo_symbol,currentShares:holding.currentShares,lastExitDate:holding.lastExitDate,latestExistingDate,effectiveStartDate,effectiveEndDate,fetchedRows:0,insertedRows:0,status:"failed",warnings:holding.warnings,error:`Missing yahoo_symbol for ${stock.symbol}.`};continue}
   const warnings=[...holding.warnings];if(forceFull&&latestExistingDate)warnings.push(held?"forceFull was accepted for API compatibility; existing history is preserved and the requested end date is refreshed for the currently held symbol.":"forceFull was accepted for API compatibility; existing history is preserved and the exited symbol remains capped at its last exit date.");jobs.push({index,stock,holding:{...holding,warnings},latestExistingDate,effectiveStartDate,effectiveEndDate});
  }
  let totalFetchedRows=0,totalInsertedRows=0,earliestInsertedDate:string|null=null,latestInsertedDate:string|null=null;
  await runLimited(jobs,YAHOO_CONCURRENCY,async job=>{const{index,stock,holding,latestExistingDate,effectiveStartDate,effectiveEndDate}=job;try{const yahooRows=await fetchYahooHistoricalPrices(stock.yahoo_symbol,effectiveStartDate,effectiveEndDate),updatedAt=new Date().toISOString();const rows=yahooRows.map(r=>({symbol:stock.symbol,market:stock.market,yahoo_symbol:stock.yahoo_symbol,price_date:r.price_date,open_price:r.open_price,high_price:r.high_price,low_price:r.low_price,close_price:r.close_price,adjusted_close_price:r.adjusted_close_price,volume:r.volume,source:"yahoo",updated_at:updatedAt}));if(!dryRun&&rows.length){const{error}=await supabase.from("historical_prices").upsert(rows,{onConflict:"symbol,price_date"});if(error)throw error}totalFetchedRows+=yahooRows.length;totalInsertedRows+=dryRun?0:rows.length;const first=yahooRows[0]?.price_date||null,last=yahooRows.at(-1)?.price_date||null;earliestInsertedDate=minNullableDate(earliestInsertedDate,first);latestInsertedDate=maxNullableDate(latestInsertedDate,last);const warnings=[...holding.warnings];if(!yahooRows.length)warnings.push(`Yahoo returned no price rows for ${effectiveStartDate} through ${effectiveEndDate}; the range may contain only non-trading days.`);results[index]={symbol:stock.symbol,yahooSymbol:stock.yahoo_symbol,currentShares:holding.currentShares,lastExitDate:holding.lastExitDate,latestExistingDate,effectiveStartDate,effectiveEndDate,fetchedRows:yahooRows.length,insertedRows:dryRun?0:rows.length,status:!yahooRows.length?"yahoo_no_data":dryRun?"dry_run_ok":"ok",warnings}}catch(error:any){results[index]={symbol:stock.symbol,yahooSymbol:stock.yahoo_symbol,currentShares:holding.currentShares,lastExitDate:holding.lastExitDate,latestExistingDate,effectiveStartDate,effectiveEndDate,fetchedRows:0,insertedRows:0,status:"failed",warnings:holding.warnings,error:error?.message||String(error)}}});
  const completed=results.filter((r):r is SymbolResult=>r!==undefined),failedCount=completed.filter(r=>r.status==="failed").length;
  return NextResponse.json({success:failedCount===0,error:failedCount?`${failedCount} symbol(s) failed during historical price sync.`:undefined,startedAt,finishedAt:new Date().toISOString(),startDate,endDate,onlySymbol,forceFull,dryRun,symbolsCount:stockRows.length,symbolsInMaster:stockRows.length,currentlyHeld,exitedAndSkipped,neverHeldAndSkipped,symbolsFetched:jobs.length,concurrency:YAHOO_CONCURRENCY,totalFetchedRows,totalInsertedRows,earliestInsertedDate,latestInsertedDate,failedCount,results:completed},{status:failedCount===0?200:502});
 }catch(error:any){return NextResponse.json({success:false,error:error?.message||String(error)},{status:500})}
}

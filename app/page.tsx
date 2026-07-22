"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  Upload,
  Download,
  Plus,
  Trash2,
  RefreshCw,
  Save,
  LogIn,
  LogOut,
  WalletCards,
  TrendingUp,
  Coins,
  ReceiptText,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as XLSX from "xlsx";

type Market = "TW" | "US";
type TradeSide = "BUY" | "SELL";

type Position = {
  id: string;
  market: Market;
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  currency: string;
  sector: string;
  note: string;
  updatedAt?: string;
};

type Trade = {
  id: string;
  date: string;
  market: Market;
  symbol: string;
  side: TradeSide;
  shares: number;
  price: number;
  fee: number;
  tax: number;
  currency: string;
  note: string;
};

type Dividend = {
  id: string;
  payDate: string;
  market: Market;
  symbol: string;
  shares: number;
  amountPerShare: number;
  withholdingTax: number;
  currency: string;
  note: string;
};

type TwStockInfo = { name: string; sector: string };

const STORAGE_KEY = "portfolio-pro-v4-sector-autofill";
const colors = ["#2563eb", "#16a34a", "#f97316", "#9333ea", "#dc2626", "#0891b2"];

// 台股產業對照表：依使用者提供 Excel 內「上市/上櫃/興櫃產業類別對照表」產生，共 1134 筆。
const TW_STOCK_INFO: Record<string, TwStockInfo> = {
  "1107": { name: "建台水泥", sector: "其他" },
  "1333": { name: "恩得利", sector: "電子零組件業" },
  "1336": { name: "台翰", sector: "電腦及週邊設備業" },
  "1408": { name: "中興紡織", sector: "管理股票" },
  "1435": { name: "中福振業", sector: "電子通路業" },
  "1437": { name: "勤益", sector: "半導體業" },
  "1453": { name: "大將電子", sector: "紡織纖維" },
  "1462": { name: "東雲", sector: "管理股票" },
  "1471": { name: "首利實業", sector: "電子零組件業" },
  "1532": { name: "勤美", sector: "鋼鐵工業" },
  "1558": { name: "伸興", sector: "電機機械" },
  "1563": { name: "巧新", sector: "電機機械" },
  "1565": { name: "精華光學", sector: "生技醫療" },
  "1566": { name: "毅金", sector: "電機機械" },
  "1568": { name: "倉佑", sector: "電機機械" },
  "1569": { name: "濱川", sector: "電腦及週邊設備業" },
  "1570": { name: "力肯實業", sector: "電機機械" },
  "1573": { name: "鼎朋", sector: "電機機械" },
  "1577": { name: "立格", sector: "電機機械" },
  "1580": { name: "新麥", sector: "電機機械" },
  "1582": { name: "信錦", sector: "電子零組件業" },
  "1583": { name: "程泰", sector: "電機機械" },
  "1584": { name: "精剛", sector: "其他" },
  "1585": { name: "鎧鉅", sector: "電子零組件業" },
  "1604": { name: "聲寶", sector: "電腦及週邊設備業" },
  "1701": { name: "中國化學", sector: "生技醫療業" },
  "1702": { name: "南僑化工", sector: "食品工業" },
  "1704": { name: "李長榮化工", sector: "化學工業" },
  "1707": { name: "葡萄王生技", sector: "生技醫療業" },
  "1708": { name: "東南碱業", sector: "化學工業" },
  "1709": { name: "和益化工", sector: "化學工業" },
  "1710": { name: "東聯化學", sector: "化學工業" },
  "1711": { name: "永光化學", sector: "化學工業" },
  "1712": { name: "興農", sector: "化學工業" },
  "1713": { name: "國泰化工", sector: "化學工業" },
  "1714": { name: "和桐化學", sector: "化學工業" },
  "1715": { name: "亞洲化學", sector: "塑膠工業" },
  "1716": { name: "永信藥品", sector: "生技醫療業" },
  "1717": { name: "長興化學", sector: "化學工業" },
  "1718": { name: "中國人纖", sector: "化學工業" },
  "1720": { name: "生達製藥", sector: "生技醫療業" },
  "1721": { name: "三晃", sector: "化學工業" },
  "1722": { name: "台肥", sector: "化學工業" },
  "1723": { name: "中鋼碳素", sector: "化學工業" },
  "1724": { name: "台硝", sector: "化學工業" },
  "1725": { name: "元禎企業", sector: "化學工業" },
  "1726": { name: "永記造漆", sector: "化學工業" },
  "1727": { name: "中華化學", sector: "化學工業" },
  "1729": { name: "必翔實業", sector: "生技醫療業" },
  "1730": { name: "花仙子", sector: "化學工業" },
  "1731": { name: "美吾華", sector: "生技醫療業" },
  "1732": { name: "毛寶", sector: "化學工業" },
  "1733": { name: "五鼎生物", sector: "生技醫療業" },
  "1734": { name: "杏輝藥品", sector: "生技醫療業" },
  "1735": { name: "日勝化工", sector: "化學工業" },
  "1736": { name: "喬山健康", sector: "生技醫療業" },
  "1737": { name: "臺鹽實業", sector: "化學工業" },
  "1742": { name: "台蠟", sector: "化學工業" },
  "1752": { name: "南光", sector: "生技醫療" },
  "1760": { name: "寶齡", sector: "化學工業" },
  "1776": { name: "展宇", sector: "化學工業" },
  "1777": { name: "生泰", sector: "生技醫療" },
  "1781": { name: "合世生醫", sector: "生技醫療" },
  "1784": { name: "訊聯", sector: "生技醫療" },
  "1785": { name: "光洋科", sector: "其他電子業" },
  "1787": { name: "福盈科", sector: "化學工業" },
  "1788": { name: "杏昌", sector: "生技醫療" },
  "1794": { name: "露絲科", sector: "化學工業" },
  "1795": { name: "美時", sector: "生技醫療" },
  "1799": { name: "紅電醫", sector: "生技醫療" },
  "1807": { name: "羅馬", sector: "管理股票" },
  "1808": { name: "國賓環保", sector: "建材營造" },
  "1814": { name: "東光訊", sector: "電機機械" },
  "1815": { name: "富喬工業", sector: "電子零組件業" },
  "2035": { name: "唐榮公司", sector: "鋼鐵工業" },
  "2049": { name: "上銀", sector: "電機機械" },
  "2056": { name: "璋釔", sector: "鋼鐵工業" },
  "2059": { name: "川湖", sector: "電子零組件業" },
  "2060": { name: "永發", sector: "鋼鐵工業" },
  "2061": { name: "風青", sector: "其他" },
  "2062": { name: "橋椿", sector: "其他" },
  "2113": { name: "中光橡", sector: "橡膠工業" },
  "2114": { name: "鑫永銓", sector: "橡膠工業" },
  "2221": { name: "大甲", sector: "其他" },
  "2229": { name: "富海", sector: "電機機械" },
  "2301": { name: "光寶科技", sector: "電腦及週邊設備業" },
  "2302": { name: "麗正科技", sector: "半導體業" },
  "2303": { name: "聯華電子", sector: "半導體業" },
  "2305": { name: "全友電腦", sector: "電腦及週邊設備業" },
  "2308": { name: "台達電子", sector: "電子零組件業" },
  "2311": { name: "日月光", sector: "半導體業" },
  "2312": { name: "金寶電子", sector: "其他電子業" },
  "2313": { name: "華通電腦", sector: "電子零組件業" },
  "2314": { name: "台揚科技", sector: "通信網路業" },
  "2315": { name: "神達電腦", sector: "電腦及週邊設備業" },
  "2316": { name: "楠梓電子", sector: "電子零組件業" },
  "2317": { name: "鴻海精密", sector: "其他電子業" },
  "2321": { name: "東訊", sector: "通信網路業" },
  "2323": { name: "中環", sector: "光電業" },
  "2324": { name: "仁寶電腦", sector: "電腦及週邊設備業" },
  "2325": { name: "矽品精密", sector: "半導體業" },
  "2326": { name: "亞瑟", sector: "管理股票" },
  "2327": { name: "國巨", sector: "電子零組件業" },
  "2328": { name: "廣宇", sector: "電子零組件業" },
  "2329": { name: "華泰電子", sector: "半導體業" },
  "2330": { name: "台灣積電", sector: "半導體業" },
  "2331": { name: "精英電腦", sector: "電腦及週邊設備業" },
  "2332": { name: "友訊科技", sector: "通信網路業" },
  "2333": { name: "碧悠電子", sector: "光電業" },
  "2336": { name: "致伸科技", sector: "電腦及週邊設備業" },
  "2337": { name: "旺宏電子", sector: "半導體業" },
  "2338": { name: "台灣光罩", sector: "半導體業" },
  "2340": { name: "光磊科技", sector: "光電業" },
  "2341": { name: "英群企業", sector: "電腦及週邊設備業" },
  "2342": { name: "台灣茂矽", sector: "半導體業" },
  "2344": { name: "華邦電子", sector: "半導體業" },
  "2345": { name: "智邦科技", sector: "通信網路業" },
  "2347": { name: "聯強國際", sector: "電子通路業" },
  "2348": { name: "力廣科技", sector: "電子通路業" },
  "2349": { name: "錸德科技", sector: "光電業" },
  "2350": { name: "環隆電氣", sector: "其他電子業" },
  "2351": { name: "順德工業", sector: "半導體業" },
  "2352": { name: "明基電通", sector: "電腦及週邊設備業" },
  "2353": { name: "宏碁", sector: "電腦及週邊設備業" },
  "2354": { name: "鴻準精密", sector: "其他電子業" },
  "2355": { name: "敬鵬工業", sector: "電子零組件業" },
  "2356": { name: "英業達", sector: "電腦及週邊設備業" },
  "2357": { name: "華碩電腦", sector: "電腦及週邊設備業" },
  "2358": { name: "美格科技", sector: "電腦及週邊設備業" },
  "2359": { name: "所羅門", sector: "電子通路業" },
  "2360": { name: "致茂電子", sector: "其他電子業" },
  "2361": { name: "鴻友科技", sector: "電腦及週邊設備業" },
  "2362": { name: "藍天電腦", sector: "電腦及週邊設備業" },
  "2363": { name: "矽統科技", sector: "半導體業" },
  "2364": { name: "倫飛電腦", sector: "電腦及週邊設備業" },
  "2365": { name: "昆盈", sector: "電腦及週邊設備業" },
  "2367": { name: "燿華電子", sector: "電子零組件業" },
  "2368": { name: "金像電子", sector: "電子零組件業" },
  "2369": { name: "菱生精密", sector: "半導體業" },
  "2371": { name: "大同", sector: "其他電子業" },
  "2373": { name: "震旦行", sector: "其他電子業" },
  "2374": { name: "佳能企業", sector: "光電業" },
  "2375": { name: "智寶電子", sector: "電子零組件業" },
  "2376": { name: "技嘉科技", sector: "電腦及週邊設備業" },
  "2377": { name: "微星科技", sector: "電腦及週邊設備業" },
  "2379": { name: "瑞昱半導體", sector: "半導體業" },
  "2380": { name: "虹光精密", sector: "電腦及週邊設備業" },
  "2381": { name: "華宇電腦", sector: "電腦及週邊設備業" },
  "2382": { name: "廣達電腦", sector: "電腦及週邊設備業" },
  "2383": { name: "台光電子", sector: "電子零組件業" },
  "2384": { name: "勝華科技", sector: "光電業" },
  "2385": { name: "群光電子", sector: "電腦及週邊設備業" },
  "2387": { name: "精元電腦", sector: "電腦及週邊設備業" },
  "2388": { name: "威盛電子", sector: "半導體業" },
  "2390": { name: "云辰電子", sector: "其他電子業" },
  "2391": { name: "合勤科技", sector: "通信網路業" },
  "2392": { name: "正崴精密", sector: "電子零組件業" },
  "2393": { name: "億光電子", sector: "光電業" },
  "2395": { name: "研華", sector: "電腦及週邊設備業" },
  "2396": { name: "精碟科技", sector: "光電業" },
  "2397": { name: "友通資訊", sector: "電腦及週邊設備業" },
  "2399": { name: "映泰", sector: "電腦及週邊設備業" },
  "2401": { name: "凌陽科技", sector: "半導體業" },
  "2402": { name: "毅嘉科技", sector: "通信網路業" },
  "2403": { name: "友尚", sector: "電子通路業" },
  "2404": { name: "漢唐集成", sector: "其他電子業" },
  "2405": { name: "浩鑫", sector: "電腦及週邊設備業" },
  "2406": { name: "國碩科技", sector: "光電業" },
  "2408": { name: "南亞科技", sector: "半導體業" },
  "2409": { name: "友達光電", sector: "光電業" },
  "2410": { name: "鼎大科技", sector: "管理股票" },
  "2411": { name: "飛瑞", sector: "其他電子業" },
  "2412": { name: "中華電信", sector: "通信網路業" },
  "2413": { name: "環隆科技", sector: "電子零組件業" },
  "2414": { name: "精技電腦", sector: "電子通路業" },
  "2415": { name: "錩新科技", sector: "電子零組件業" },
  "2417": { name: "圓剛科技", sector: "電腦及週邊設備業" },
  "2418": { name: "雅新實業", sector: "其他電子業" },
  "2419": { name: "仲琦科技", sector: "通信網路業" },
  "2420": { name: "新巨企業", sector: "電子零組件業" },
  "2421": { name: "建準工業", sector: "電子零組件業" },
  "2423": { name: "固緯電子", sector: "其他電子業" },
  "2424": { name: "隴華電子", sector: "電腦及週邊設備業" },
  "2425": { name: "華東承啟", sector: "半導體業" },
  "2426": { name: "鼎元科技", sector: "光電業" },
  "2427": { name: "三商電腦", sector: "資訊服務業" },
  "2428": { name: "興勤電子", sector: "電子零組件業" },
  "2429": { name: "永兆精密", sector: "電子零組件業" },
  "2430": { name: "燦坤實業", sector: "電子通路業" },
  "2431": { name: "聯昌電子", sector: "電子零組件業" },
  "2432": { name: "倚天資訊", sector: "通信網路業" },
  "2433": { name: "互盛", sector: "其他電子業" },
  "2434": { name: "統懋半導體", sector: "半導體業" },
  "2436": { name: "偉詮電子", sector: "半導體業" },
  "2437": { name: "旺詮", sector: "電子零組件業" },
  "2438": { name: "英誌企業", sector: "電腦及週邊設備業" },
  "2439": { name: "美律實業", sector: "通信網路業" },
  "2440": { name: "太空梭科技", sector: "電子零組件業" },
  "2441": { name: "超豐電子", sector: "半導體業" },
  "2442": { name: "美齊科技", sector: "電腦及週邊設備業" },
  "2443": { name: "利碟", sector: "光電業" },
  "2444": { name: "友旺科技", sector: "通信網路業" },
  "2446": { name: "全懋精密", sector: "半導體業" },
  "2447": { name: "鼎新電腦", sector: "資訊服務業" },
  "2448": { name: "晶元光電", sector: "光電業" },
  "2449": { name: "京元電子", sector: "半導體業" },
  "2450": { name: "神腦國際", sector: "通信網路業" },
  "2451": { name: "創見資訊", sector: "半導體業" },
  "2452": { name: "乾坤科技", sector: "電子零組件業" },
  "2453": { name: "凌群電腦", sector: "資訊服務業" },
  "2454": { name: "聯發科技", sector: "半導體業" },
  "2455": { name: "全新光電", sector: "通信網路業" },
  "2456": { name: "奇力新電子", sector: "電子零組件業" },
  "2457": { name: "飛宏企業", sector: "電子零組件業" },
  "2458": { name: "義隆電子", sector: "半導體業" },
  "2459": { name: "敦吉科技", sector: "電子通路業" },
  "2460": { name: "建通精密", sector: "電子零組件業" },
  "2461": { name: "光群科技", sector: "其他電子業" },
  "2462": { name: "台灣良得", sector: "電子零組件業" },
  "2463": { name: "研揚科技", sector: "電腦及週邊設備業" },
  "2464": { name: "盟立自動化", sector: "其他電子業" },
  "2465": { name: "麗臺科技", sector: "電腦及週邊設備業" },
  "2466": { name: "冠西電子", sector: "光電業" },
  "2467": { name: "志聖工業", sector: "電子零組件業" },
  "2468": { name: "華經資訊", sector: "資訊服務業" },
  "2469": { name: "力信興業", sector: "電子零組件業" },
  "2471": { name: "資通電腦", sector: "資訊服務業" },
  "2472": { name: "立隆電子", sector: "電子零組件業" },
  "2473": { name: "思源科技", sector: "半導體業" },
  "2474": { name: "可成科技", sector: "電腦及週邊設備業" },
  "2475": { name: "中華映管", sector: "光電業" },
  "2476": { name: "鉅祥企業", sector: "電子零組件業" },
  "2477": { name: "美隆工業", sector: "其他電子業" },
  "2478": { name: "大毅科技", sector: "電子零組件業" },
  "2479": { name: "和立聯合", sector: "光電業" },
  "2480": { name: "敦陽科技", sector: "資訊服務業" },
  "2481": { name: "強茂", sector: "半導體業" },
  "2482": { name: "連宇", sector: "其他電子業" },
  "2483": { name: "百容電子", sector: "電子零組件業" },
  "2484": { name: "希華晶體", sector: "電子零組件業" },
  "2485": { name: "兆赫電子", sector: "通信網路業" },
  "2486": { name: "一詮精密", sector: "光電業" },
  "2488": { name: "漢平電子", sector: "其他電子業" },
  "2489": { name: "瑞軒科技", sector: "光電業" },
  "2491": { name: "訊碟科技", sector: "光電業" },
  "2492": { name: "華新科技", sector: "電子零組件業" },
  "2493": { name: "揚博科技", sector: "電子零組件業" },
  "2494": { name: "突破通訊", sector: "通信網路業" },
  "2495": { name: "普安科技", sector: "其他電子業" },
  "2496": { name: "卓越光纖", sector: "通信網路業" },
  "2497": { name: "怡利電子", sector: "其他電子業" },
  "2498": { name: "宏達電子", sector: "通信網路業" },
  "2499": { name: "東貝光電", sector: "光電業" },
  "2514": { name: "龍邦開發", sector: "其他" },
  "2577": { name: "亞昕", sector: "建材營造" },
  "2591": { name: "高逸", sector: "其他電子業" },
  "2592": { name: "志品科", sector: "其他" },
  "2616": { name: "山隆通運", sector: "油電燃氣業" },
  "2628": { name: "正利", sector: "航運業" },
  "2633": { name: "高鐵", sector: "航運業" },
  "2636": { name: "台驊", sector: "航運業" },
  "2718": { name: "桃園店", sector: "觀光事業" },
  "2897": { name: "臺工銀", sector: "金融業" },
  "2916": { name: "滿心", sector: "貿易百貨" },
  "2920": { name: "海景", sector: "觀光事業" },
  "2921": { name: "和樂", sector: "貿易百貨" },
  "3002": { name: "歐格電子", sector: "電腦及週邊設備業" },
  "3003": { name: "健和興端子", sector: "電子零組件業" },
  "3004": { name: "宏達科技", sector: "其他電子業" },
  "3005": { name: "神基科技", sector: "電腦及週邊設備業" },
  "3006": { name: "晶豪科技", sector: "半導體業" },
  "3008": { name: "大立光電", sector: "光電業" },
  "3009": { name: "奇美電子", sector: "光電業" },
  "3010": { name: "華立企業", sector: "電子通路業" },
  "3011": { name: "今晧實業", sector: "電子零組件業" },
  "3013": { name: "晟銘電子", sector: "電腦及週邊設備業" },
  "3014": { name: "聯陽半導體", sector: "半導體業" },
  "3015": { name: "全漢企業", sector: "電子零組件業" },
  "3016": { name: "嘉晶電子", sector: "半導體業" },
  "3017": { name: "奇鋐科技", sector: "電腦及週邊設備業" },
  "3018": { name: "同開科技", sector: "其他電子業" },
  "3019": { name: "亞洲光學", sector: "光電業" },
  "3020": { name: "奇普仕", sector: "電子通路業" },
  "3021": { name: "衛道科技", sector: "資訊服務業" },
  "3022": { name: "威達電", sector: "電腦及週邊設備業" },
  "3023": { name: "信邦電子", sector: "電子零組件業" },
  "3024": { name: "憶聲電子", sector: "光電業" },
  "3025": { name: "星通資訊", sector: "通信網路業" },
  "3026": { name: "禾伸堂", sector: "電子零組件業" },
  "3027": { name: "盛達電業", sector: "通信網路業" },
  "3028": { name: "增你強", sector: "電子通路業" },
  "3029": { name: "零壹科技", sector: "資訊服務業" },
  "3030": { name: "德律科技", sector: "其他電子業" },
  "3031": { name: "佰鴻工業", sector: "光電業" },
  "3032": { name: "偉訓科技", sector: "電子零組件業" },
  "3033": { name: "威健實業", sector: "電子通路業" },
  "3034": { name: "聯詠科技", sector: "半導體業" },
  "3035": { name: "智原科技", sector: "半導體業" },
  "3036": { name: "文曄科技", sector: "電子通路業" },
  "3037": { name: "欣興電子", sector: "電子零組件業" },
  "3038": { name: "全台晶像", sector: "光電業" },
  "3040": { name: "遠見科技", sector: "電子通路業" },
  "3041": { name: "揚智科技", sector: "半導體業" },
  "3042": { name: "台灣晶技", sector: "電子零組件業" },
  "3043": { name: "科風", sector: "其他電子業" },
  "3044": { name: "健鼎科技", sector: "電子零組件業" },
  "3045": { name: "台灣大哥大", sector: "通信網路業" },
  "3046": { name: "建碁", sector: "電腦及週邊設備業" },
  "3047": { name: "訊舟科技", sector: "通信網路業" },
  "3048": { name: "益登科技", sector: "電子通路業" },
  "3049": { name: "和鑫光電", sector: "光電業" },
  "3050": { name: "鈺德科技", sector: "光電業" },
  "3051": { name: "力特光電", sector: "光電業" },
  "3052": { name: "夆典科技", sector: "其他電子業" },
  "3053": { name: "鼎營科技", sector: "其他電子業" },
  "3054": { name: "萬國電腦", sector: "電腦及週邊設備業" },
  "3055": { name: "蔚華科技", sector: "電子通路業" },
  "3056": { name: "駿億電子", sector: "半導體業" },
  "3057": { name: "喬鼎資訊", sector: "電腦及週邊設備業" },
  "3058": { name: "立德電子", sector: "電子零組件業" },
  "3059": { name: "華晶科技", sector: "光電業" },
  "3060": { name: "銘異科技", sector: "電腦及週邊設備業" },
  "3061": { name: "璨圓光電", sector: "光電業" },
  "3062": { name: "建漢科技", sector: "通信網路業" },
  "3063": { name: "飛信半導體", sector: "半導體業" },
  "3064": { name: "泰偉電子", sector: "其他電子業" },
  "3065": { name: "大眾電", sector: "通信網路業" },
  "3066": { name: "李洲科技", sector: "光電業" },
  "3067": { name: "全域", sector: "其他電子業" },
  "3068": { name: "美磊", sector: "電子零組件業" },
  "3069": { name: "寶晟科", sector: "電腦及週邊設備業" },
  "3071": { name: "協禧電機", sector: "電腦及週邊設備業" },
  "3073": { name: "普格", sector: "半導體業" },
  "3074": { name: "群環", sector: "電腦及週邊設備業" },
  "3075": { name: "億泰利", sector: "資訊服務業" },
  "3078": { name: "僑威科技", sector: "電子零組件業" },
  "3079": { name: "宏億", sector: "半導體業" },
  "3080": { name: "威力盟", sector: "光電業" },
  "3083": { name: "中華網龍", sector: "資訊服務業" },
  "3085": { name: "久大", sector: "資訊服務業" },
  "3086": { name: "華義國際", sector: "資訊服務業" },
  "3087": { name: "翔準", sector: "半導體業" },
  "3088": { name: "艾訊公司", sector: "電腦及週邊設備業" },
  "3089": { name: "展成科技", sector: "電子零組件業" },
  "3090": { name: "日電貿", sector: "電子零組件業" },
  "3092": { name: "鴻碩", sector: "電子零組件業" },
  "3093": { name: "港建", sector: "其他電子業" },
  "3094": { name: "聯傑", sector: "半導體業" },
  "3095": { name: "及成", sector: "通信網路業" },
  "3096": { name: "碩良", sector: "半導體業" },
  "3097": { name: "拍檔", sector: "電腦及週邊設備業" },
  "3098": { name: "前進", sector: "資訊服務業" },
  "3099": { name: "頂倫", sector: "電子零組件業" },
  "3109": { name: "精鼎科", sector: "生技醫療" },
  "3114": { name: "好德科技", sector: "電子零組件業" },
  "3115": { name: "寶島極", sector: "電子零組件業" },
  "3118": { name: "進階", sector: "生技醫療" },
  "3126": { name: "信億科技", sector: "電腦及週邊設備業" },
  "3127": { name: "能元", sector: "其他電子業" },
  "3128": { name: "昇銳電子", sector: "光電業" },
  "3130": { name: "一零四", sector: "資訊服務業" },
  "3138": { name: "耀登", sector: "通信網路業" },
  "3139": { name: "台固", sector: "通信網路業" },
  "3141": { name: "晶宏", sector: "半導體業" },
  "3142": { name: "遠茂光電", sector: "管理股票" },
  "3144": { name: "新揚科", sector: "電子零組件業" },
  "3149": { name: "正達", sector: "光電業" },
  "3152": { name: "璟德", sector: "電子零組件業" },
  "3161": { name: "幸亞", sector: "電子零組件業" },
  "3162": { name: "精確實業", sector: "電機機械" },
  "3164": { name: "景岳", sector: "生技醫療" },
  "3166": { name: "偉僑", sector: "通信網路業" },
  "3167": { name: "大量", sector: "電子零組件業" },
  "3168": { name: "眾福科", sector: "光電業" },
  "3169": { name: "亞信", sector: "半導體業" },
  "3171": { name: "天馳科技", sector: "電腦及週邊設備業" },
  "3176": { name: "基亞", sector: "生技醫療" },
  "3178": { name: "公準", sector: "半導體業" },
  "3186": { name: "聯笙", sector: "半導體業" },
  "3188": { name: "安茂微", sector: "半導體業" },
  "3189": { name: "景碩科技", sector: "半導體業" },
  "3191": { name: "和進", sector: "電子零組件業" },
  "3195": { name: "統寶", sector: "光電業" },
  "3202": { name: "樺晟電子", sector: "電子零組件業" },
  "3205": { name: "天騵生化", sector: "生技醫療" },
  "3206": { name: "志豐電子", sector: "電子零組件業" },
  "3207": { name: "耀勝", sector: "電子零組件業" },
  "3209": { name: "全科", sector: "電子通路業" },
  "3211": { name: "順達科", sector: "電腦及週邊設備業" },
  "3213": { name: "茂訊電腦", sector: "電腦及週邊設備業" },
  "3217": { name: "優群科技", sector: "電腦及週邊設備業" },
  "3218": { name: "大學光", sector: "生技醫療" },
  "3219": { name: "倚強科技", sector: "半導體業" },
  "3221": { name: "台灣嘉碩", sector: "通信網路業" },
  "3224": { name: "三顧", sector: "電子通路業" },
  "3226": { name: "至寶電腦", sector: "電子零組件業" },
  "3227": { name: "原相", sector: "半導體業" },
  "3228": { name: "金麗科技", sector: "半導體業" },
  "3229": { name: "晟鈦", sector: "電子零組件業" },
  "3230": { name: "錦明實", sector: "光電業" },
  "3231": { name: "緯創資通", sector: "電腦及週邊設備業" },
  "3232": { name: "昱捷", sector: "電子通路業" },
  "3234": { name: "光環", sector: "通信網路業" },
  "3236": { name: "千如", sector: "電子零組件業" },
  "3237": { name: "永洋", sector: "通信網路業" },
  "3252": { name: "宏連", sector: "半導體業" },
  "3256": { name: "凱悌", sector: "電子通路業" },
  "3259": { name: "鑫創", sector: "半導體業" },
  "3260": { name: "威剛科技", sector: "半導體業" },
  "3264": { name: "欣銓科技", sector: "半導體業" },
  "3265": { name: "台曜電子", sector: "半導體業" },
  "3266": { name: "弘如洋", sector: "生技醫療" },
  "3267": { name: "世訊", sector: "電腦及週邊設備業" },
  "3268": { name: "海德威", sector: "半導體業" },
  "3271": { name: "其樂達", sector: "半導體業" },
  "3272": { name: "東碩", sector: "電子零組件業" },
  "3276": { name: "宇環", sector: "電子零組件業" },
  "3279": { name: "三全", sector: "電子通路業" },
  "3282": { name: "商杰", sector: "電子通路業" },
  "3284": { name: "太普高", sector: "其他" },
  "3285": { name: "微端", sector: "光電業" },
  "3287": { name: "廣寰科", sector: "電腦及週邊設備業" },
  "3288": { name: "點晶科技", sector: "電子零組件業" },
  "3289": { name: "宜特科技", sector: "其他電子業" },
  "3290": { name: "東浦精密", sector: "通信網路業" },
  "3291": { name: "遠翔科", sector: "半導體業" },
  "3293": { name: "鈊象電子", sector: "資訊服務業" },
  "3294": { name: "英濟", sector: "電子零組件業" },
  "3296": { name: "勝德", sector: "電子零組件業" },
  "3297": { name: "杭特", sector: "光電業" },
  "3298": { name: "圓創", sector: "半導體業" },
  "3299": { name: "帛漢", sector: "電子零組件業" },
  "3303": { name: "岱稜", sector: "化學工業" },
  "3304": { name: "瀚邦", sector: "半導體業" },
  "3305": { name: "昇貿科技", sector: "其他電子業" },
  "3306": { name: "鼎天國際", sector: "通信網路業" },
  "3307": { name: "遠業", sector: "光電業" },
  "3308": { name: "聯德", sector: "電子零組件業" },
  "3309": { name: "拓洋", sector: "電子零組件業" },
  "3310": { name: "佳穎", sector: "電子零組件業" },
  "3311": { name: "閎暉實業", sector: "通信網路業" },
  "3312": { name: "弘憶國際", sector: "電子通路業" },
  "3313": { name: "斐成", sector: "電子零組件業" },
  "3314": { name: "數聯", sector: "資訊服務業" },
  "3315": { name: "宣昶", sector: "電子通路業" },
  "3317": { name: "尼克森", sector: "半導體業" },
  "3318": { name: "和光", sector: "其他電子業" },
  "3321": { name: "同泰", sector: "電子零組件業" },
  "3322": { name: "建舜電", sector: "電子零組件業" },
  "3323": { name: "加百裕", sector: "電腦及週邊設備業" },
  "3324": { name: "雙鴻科技", sector: "其他電子業" },
  "3325": { name: "旭品科技", sector: "電腦及週邊設備業" },
  "3332": { name: "幸康", sector: "電子零組件業" },
  "3334": { name: "主向位", sector: "通信網路業" },
  "3338": { name: "泰碩", sector: "電子零組件業" },
  "3339": { name: "泰谷光電", sector: "光電業" },
  "3342": { name: "飛虹電", sector: "半導體業" },
  "3349": { name: "寶德", sector: "電腦及週邊設備業" },
  "3350": { name: "邰港", sector: "生技醫療" },
  "3354": { name: "律勝科技", sector: "電子零組件業" },
  "3356": { name: "奇偶科技", sector: "資訊服務業" },
  "3360": { name: "尚立", sector: "電子通路業" },
  "3361": { name: "快特", sector: "其他電子業" },
  "3362": { name: "先進光電", sector: "光電業" },
  "3363": { name: "上詮", sector: "通信網路業" },
  "3367": { name: "英華達", sector: "其他電子業" },
  "3369": { name: "鐵研", sector: "電子零組件業" },
  "3372": { name: "典範", sector: "半導體業" },
  "3373": { name: "熱映", sector: "其他電子業" },
  "3374": { name: "精材", sector: "半導體業" },
  "3376": { name: "新日興", sector: "電子零組件業" },
  "3379": { name: "彬台", sector: "電機機械" },
  "3380": { name: "明泰科技", sector: "通信網路業" },
  "3383": { name: "新世紀", sector: "光電業" },
  "3388": { name: "崇越電", sector: "其他" },
  "3390": { name: "旭軟", sector: "電子零組件業" },
  "3394": { name: "龍泰", sector: "其他電子業" },
  "3396": { name: "普樺", sector: "電腦及週邊設備業" },
  "3397": { name: "協泰", sector: "半導體業" },
  "3402": { name: "漢科系統", sector: "其他電子業" },
  "3406": { name: "玉晶光電", sector: "光電業" },
  "3411": { name: "宜揚", sector: "半導體業" },
  "3412": { name: "寰波", sector: "通信網路業" },
  "3413": { name: "沛鑫", sector: "半導體業" },
  "3414": { name: "榮眾", sector: "其他電子業" },
  "3416": { name: "融程電", sector: "電腦及週邊設備業" },
  "3419": { name: "譁裕", sector: "通信網路業" },
  "3422": { name: "億泰興", sector: "電子零組件業" },
  "3423": { name: "聚興", sector: "電子通路業" },
  "3431": { name: "長天科技", sector: "通信網路業" },
  "3434": { name: "哲固", sector: "電腦及週邊設備業" },
  "3435": { name: "德之傑", sector: "其他電子業" },
  "3437": { name: "先進電", sector: "光電業" },
  "3438": { name: "類比科", sector: "半導體業" },
  "3441": { name: "聯一光", sector: "光電業" },
  "3443": { name: "創意電子", sector: "半導體業" },
  "3444": { name: "利機", sector: "電子通路業" },
  "3450": { name: "聯鈞光電", sector: "其他電子業" },
  "3452": { name: "益通光能", sector: "光電業" },
  "3454": { name: "晶睿", sector: "通信網路業" },
  "3455": { name: "由田", sector: "其他電子業" },
  "3465": { name: "祥業", sector: "通信網路業" },
  "3466": { name: "致振", sector: "其他電子業" },
  "3469": { name: "銓祐科", sector: "電腦及週邊設備業" },
  "3472": { name: "友荃", sector: "油電燃氣業" },
  "3474": { name: "華亞科技", sector: "半導體業" },
  "3475": { name: "富晶", sector: "半導體業" },
  "3480": { name: "泰安科", sector: "電腦及週邊設備業" },
  "3481": { name: "群創光電", sector: "光電業" },
  "3482": { name: "力華", sector: "半導體業" },
  "3483": { name: "力致", sector: "電腦及週邊設備業" },
  "3484": { name: "崧騰", sector: "電子零組件業" },
  "3489": { name: "筌寶", sector: "電腦及週邊設備業" },
  "3490": { name: "單井", sector: "其他電子業" },
  "3491": { name: "昇達科", sector: "通信網路業" },
  "3492": { name: "長盛", sector: "通信網路業" },
  "3494": { name: "誠研", sector: "電腦及週邊設備業" },
  "3496": { name: "大朋電", sector: "電子零組件業" },
  "3498": { name: "陽程", sector: "其他電子業" },
  "3499": { name: "環天科", sector: "通信網路業" },
  "3501": { name: "維熹", sector: "電子零組件業" },
  "3502": { name: "鉅航", sector: "電子零組件業" },
  "3503": { name: "東又悅", sector: "電子零組件業" },
  "3504": { name: "揚明光學", sector: "光電業" },
  "3505": { name: "聯線上", sector: "資訊服務業" },
  "3506": { name: "友昱", sector: "半導體業" },
  "3507": { name: "力群", sector: "電子零組件業" },
  "3508": { name: "位速", sector: "通信網路業" },
  "3512": { name: "能緹", sector: "電子零組件業" },
  "3514": { name: "昱晶", sector: "光電業" },
  "3515": { name: "華擎", sector: "電腦及週邊設備業" },
  "3516": { name: "亞帝歐", sector: "光電業" },
  "3517": { name: "曜富", sector: "光電業" },
  "3518": { name: "柏騰", sector: "電腦及週邊設備業" },
  "3519": { name: "綠能", sector: "光電業" },
  "3520": { name: "振維", sector: "光電業" },
  "3521": { name: "鴻翊", sector: "電腦及週邊設備業" },
  "3522": { name: "宏森", sector: "光電業" },
  "3523": { name: "迎輝", sector: "光電業" },
  "3524": { name: "正勛", sector: "電子零組件業" },
  "3526": { name: "凡甲", sector: "電子零組件業" },
  "3527": { name: "聚積", sector: "半導體業" },
  "3529": { name: "力旺", sector: "其他電子業" },
  "3530": { name: "晶相光", sector: "半導體業" },
  "3531": { name: "先益", sector: "光電業" },
  "3532": { name: "台勝科", sector: "半導體業" },
  "3533": { name: "嘉澤", sector: "電子零組件業" },
  "3534": { name: "雷凌", sector: "半導體業" },
  "3535": { name: "晶彩科", sector: "光電業" },
  "3536": { name: "誠創", sector: "光電業" },
  "3537": { name: "堡達", sector: "電子通路業" },
  "3538": { name: "曜鵬", sector: "半導體業" },
  "3540": { name: "曜越", sector: "電腦及週邊設備業" },
  "3541": { name: "西柏", sector: "其他電子業" },
  "3542": { name: "芽莊", sector: "電子零組件業" },
  "3543": { name: "州巧", sector: "光電業" },
  "3546": { name: "宇峻", sector: "資訊服務業" },
  "3547": { name: "凱鼎", sector: "光電業" },
  "3548": { name: "兆利", sector: "電子零組件業" },
  "3549": { name: "控創", sector: "電腦及週邊設備業" },
  "3551": { name: "世禾", sector: "其他電子業" },
  "3552": { name: "同致", sector: "電子零組件業" },
  "3553": { name: "力積", sector: "半導體業" },
  "3554": { name: "精品", sector: "資訊服務業" },
  "3555": { name: "擎泰", sector: "半導體業" },
  "3556": { name: "禾瑞亞", sector: "半導體業" },
  "3557": { name: "嘉威", sector: "光電業" },
  "3558": { name: "神準", sector: "通信網路業" },
  "3559": { name: "全智科", sector: "半導體業" },
  "3560": { name: "建欣科", sector: "電子零組件業" },
  "3561": { name: "昇陽科", sector: "光電業" },
  "3562": { name: "頂晶科", sector: "光電業" },
  "3563": { name: "牧德", sector: "其他電子業" },
  "3701": { name: "大眾投控", sector: "電腦及週邊設備業" },
  "3702": { name: "大聯大", sector: "電子通路業" },
  "4102": { name: "永日化工", sector: "生技醫療" },
  "4103": { name: "百略醫學", sector: "生技醫療" },
  "4104": { name: "東貿", sector: "生技醫療" },
  "4105": { name: "台灣東洋", sector: "生技醫療" },
  "4106": { name: "雃博", sector: "生技醫療業" },
  "4107": { name: "邦拓生技", sector: "生技醫療" },
  "4108": { name: "懷特新藥", sector: "生技醫療" },
  "4109": { name: "加捷科技", sector: "生技醫療" },
  "4111": { name: "濟生化學", sector: "生技醫療" },
  "4113": { name: "聯上生技", sector: "生技醫療" },
  "4114": { name: "健喬信元", sector: "生技醫療" },
  "4116": { name: "三豐醫", sector: "生技醫療" },
  "4117": { name: "普生", sector: "生技醫療" },
  "4119": { name: "旭富製藥", sector: "生技醫療業" },
  "4120": { name: "友華", sector: "生技醫療" },
  "4121": { name: "優盛醫學", sector: "生技醫療" },
  "4123": { name: "晟德", sector: "生技醫療" },
  "4124": { name: "期美", sector: "生技醫療" },
  "4125": { name: "喬聯", sector: "生技醫療" },
  "4126": { name: "太醫", sector: "生技醫療" },
  "4127": { name: "天良生技", sector: "生技醫療" },
  "4128": { name: "中天生技", sector: "生技醫療" },
  "4129": { name: "聯合骨科", sector: "生技醫療" },
  "4130": { name: "健亞", sector: "生技醫療" },
  "4131": { name: "晶宇生技", sector: "生技醫療" },
  "4205": { name: "恆義", sector: "食品工業" },
  "4207": { name: "環泰", sector: "食品工業" },
  "4303": { name: "信立", sector: "塑膠工業" },
  "4304": { name: "勝昱", sector: "塑膠工業" },
  "4305": { name: "世坤", sector: "塑膠工業" },
  "4306": { name: "炎洲", sector: "塑膠工業" },
  "4401": { name: "東隆興業", sector: "紡織纖維" },
  "4402": { name: "福大", sector: "紡織纖維" },
  "4406": { name: "新昕纖維", sector: "紡織纖維" },
  "4408": { name: "聯明紡織", sector: "紡織纖維" },
  "4413": { name: "赤崁", sector: "紡織纖維" },
  "4415": { name: "成豐生技", sector: "紡織纖維" },
  "4416": { name: "福纖", sector: "建材營造" },
  "4417": { name: "金洲海洋", sector: "紡織纖維" },
  "4419": { name: "松懋工業", sector: "紡織纖維" },
  "4420": { name: "光明絲織", sector: "紡織纖維" },
  "4426": { name: "利勤實業", sector: "紡織纖維" },
  "4502": { name: "源恆", sector: "電機機械" },
  "4503": { name: "金雨", sector: "電機機械" },
  "4506": { name: "崇友", sector: "電機機械" },
  "4510": { name: "高鋒工業", sector: "電機機械" },
  "4513": { name: "福裕事業", sector: "電機機械" },
  "4523": { name: "永彰機電", sector: "電機機械" },
  "4527": { name: "方土霖", sector: "電機機械" },
  "4528": { name: "江興鍛壓", sector: "電機機械" },
  "4529": { name: "力武電機", sector: "電機機械" },
  "4530": { name: "宏易精密", sector: "電機機械" },
  "4533": { name: "協易機械", sector: "電機機械" },
  "4534": { name: "三林", sector: "電機機械" },
  "4535": { name: "至興精機", sector: "電機機械" },
  "4609": { name: "唐鋒實業", sector: "電器電纜" },
  "4702": { name: "中美實", sector: "化學工業" },
  "4703": { name: "金美克能", sector: "化學工業" },
  "4706": { name: "大恭化學", sector: "化學工業" },
  "4707": { name: "磐亞", sector: "化學工業" },
  "4711": { name: "永純化工", sector: "化學工業" },
  "4712": { name: "南璋", sector: "化學工業" },
  "4714": { name: "永捷", sector: "化學工業" },
  "4716": { name: "大立高", sector: "化學工業" },
  "4720": { name: "德淵", sector: "化學工業" },
  "4721": { name: "美琪瑪", sector: "化學工業" },
  "4722": { name: "國精", sector: "化學工業" },
  "4725": { name: "信昌化", sector: "化學工業" },
  "4727": { name: "康齡醫", sector: "生技醫療" },
  "4801": { name: "碼斯特", sector: "玻璃陶瓷" },
  "4903": { name: "聯光通", sector: "通信網路業" },
  "4904": { name: "遠傳電信", sector: "通信網路業" },
  "4905": { name: "台聯電訊", sector: "通信網路業" },
  "4906": { name: "正文科技", sector: "通信網路業" },
  "4907": { name: "正華", sector: "通信網路業" },
  "4908": { name: "前鼎", sector: "通信網路業" },
  "4909": { name: "新復興", sector: "通信網路業" },
  "5007": { name: "三星科技", sector: "鋼鐵工業" },
  "5009": { name: "榮剛", sector: "鋼鐵工業" },
  "5011": { name: "久陽", sector: "鋼鐵工業" },
  "5013": { name: "強新工業", sector: "鋼鐵工業" },
  "5014": { name: "建錩實業", sector: "鋼鐵工業" },
  "5015": { name: "華祺", sector: "鋼鐵工業" },
  "5016": { name: "松和工業", sector: "鋼鐵工業" },
  "5017": { name: "新泰伸", sector: "鋼鐵工業" },
  "5102": { name: "富強", sector: "橡膠工業" },
  "5201": { name: "凱衛資訊", sector: "資訊服務業" },
  "5202": { name: "力新國際", sector: "資訊服務業" },
  "5203": { name: "訊連科技", sector: "資訊服務業" },
  "5204": { name: "得捷", sector: "資訊服務業" },
  "5205": { name: "漢康科技", sector: "資訊服務業" },
  "5206": { name: "經緯科技", sector: "資訊服務業" },
  "5207": { name: "飛雅", sector: "管理股票" },
  "5209": { name: "新鼎系統", sector: "資訊服務業" },
  "5210": { name: "寶碩", sector: "資訊服務業" },
  "5211": { name: "蒙恬", sector: "資訊服務業" },
  "5212": { name: "凌網科技", sector: "資訊服務業" },
  "5213": { name: "捷鴻", sector: "資訊服務業" },
  "5301": { name: "祥裕電子", sector: "電子零組件業" },
  "5302": { name: "太欣", sector: "半導體業" },
  "5304": { name: "大霸電子", sector: "通信網路業" },
  "5305": { name: "敦南科技", sector: "光電業" },
  "5306": { name: "訊康", sector: "通信網路業" },
  "5309": { name: "系統電子", sector: "電子零組件業" },
  "5310": { name: "天剛資訊", sector: "資訊服務業" },
  "5312": { name: "寶島科", sector: "其他" },
  "5314": { name: "世紀民生", sector: "半導體業" },
  "5315": { name: "光聯科技", sector: "光電業" },
  "5317": { name: "凱美", sector: "電子零組件業" },
  "5318": { name: "佳鼎科技", sector: "電子零組件業" },
  "5321": { name: "九德電子", sector: "電子零組件業" },
  "5324": { name: "華昕電子", sector: "半導體業" },
  "5326": { name: "漢磊", sector: "半導體業" },
  "5328": { name: "華容公司", sector: "電子零組件業" },
  "5340": { name: "建榮工業", sector: "電子零組件業" },
  "5344": { name: "立衛科技", sector: "半導體業" },
  "5345": { name: "天揚", sector: "電子零組件業" },
  "5346": { name: "力晶", sector: "半導體業" },
  "5347": { name: "世界", sector: "半導體業" },
  "5348": { name: "系通科技", sector: "通信網路業" },
  "5349": { name: "先豐通訊", sector: "電子零組件業" },
  "5351": { name: "鈺創科技", sector: "半導體業" },
  "5353": { name: "台林通信", sector: "通信網路業" },
  "5355": { name: "佳總", sector: "電子零組件業" },
  "5356": { name: "協益電子", sector: "電子零組件業" },
  "5364": { name: "浩騰科技", sector: "電子零組件業" },
  "5371": { name: "中光電", sector: "電腦及週邊設備業" },
  "5376": { name: "東正元", sector: "管理股票" },
  "5381": { name: "合正科技", sector: "電子零組件業" },
  "5383": { name: "金利精密", sector: "其他電子業" },
  "5384": { name: "捷元", sector: "電腦及週邊設備業" },
  "5386": { name: "青雲國際", sector: "電腦及週邊設備業" },
  "5387": { name: "茂德科技", sector: "半導體業" },
  "5388": { name: "中磊電子", sector: "通信網路業" },
  "5392": { name: "應華精密", sector: "光電業" },
  "5395": { name: "普揚", sector: "光電業" },
  "5398": { name: "力瑋", sector: "電子零組件業" },
  "5403": { name: "中菲電腦", sector: "資訊服務業" },
  "5410": { name: "國眾電腦", sector: "資訊服務業" },
  "5414": { name: "磐英", sector: "電腦及週邊設備業" },
  "5425": { name: "台半", sector: "半導體業" },
  "5426": { name: "振發", sector: "電腦及週邊設備業" },
  "5432": { name: "達威光電", sector: "光電業" },
  "5434": { name: "崇越科技", sector: "電子通路業" },
  "5438": { name: "東友科技", sector: "電腦及週邊設備業" },
  "5439": { name: "高技", sector: "電子零組件業" },
  "5443": { name: "均豪精密", sector: "光電業" },
  "5450": { name: "寶聯", sector: "電腦及週邊設備業" },
  "5452": { name: "佶優", sector: "其他電子業" },
  "5455": { name: "訊利電", sector: "半導體業" },
  "5457": { name: "宣德", sector: "電子零組件業" },
  "5460": { name: "同協電子", sector: "電子零組件業" },
  "5464": { name: "霖宏科技", sector: "電子零組件業" },
  "5465": { name: "富驊", sector: "電腦及週邊設備業" },
  "5466": { name: "泰林", sector: "半導體業" },
  "5467": { name: "聯福生", sector: "電子通路業" },
  "5468": { name: "台晶", sector: "半導體業" },
  "5469": { name: "瀚宇博德", sector: "電子零組件業" },
  "5471": { name: "松翰科技", sector: "半導體業" },
  "5474": { name: "聰泰科技", sector: "電腦及週邊設備業" },
  "5475": { name: "德宏工業", sector: "電子零組件業" },
  "5478": { name: "智冠", sector: "資訊服務業" },
  "5480": { name: "統盟電子", sector: "電子零組件業" },
  "5481": { name: "華韡電子", sector: "電子零組件業" },
  "5483": { name: "中美矽晶", sector: "半導體業" },
  "5484": { name: "慧友電子", sector: "光電業" },
  "5487": { name: "通泰", sector: "半導體業" },
  "5488": { name: "松普科技", sector: "電子零組件業" },
  "5489": { name: "彩富電子", sector: "其他電子業" },
  "5490": { name: "同亨", sector: "電腦及週邊設備業" },
  "5491": { name: "連展科技", sector: "電子零組件業" },
  "5492": { name: "亞智科技", sector: "其他電子業" },
  "5493": { name: "三聯科技", sector: "其他電子業" },
  "5498": { name: "凱威電子", sector: "電子通路業" },
  "5501": { name: "金腦科", sector: "管理股票" },
  "5505": { name: "和旺", sector: "建材營造" },
  "5506": { name: "長鴻", sector: "建材營造" },
  "5508": { name: "永信建設", sector: "建材營造" },
  "5511": { name: "德昌營造", sector: "建材營造" },
  "5512": { name: "力麒", sector: "建材營造" },
  "5514": { name: "三豐建設", sector: "建材營造" },
  "5516": { name: "雙喜營造", sector: "建材營造" },
  "5519": { name: "隆大營造", sector: "建材營造" },
  "5520": { name: "力泰建設", sector: "建材營造" },
  "5521": { name: "工信", sector: "建材營造" },
  "5522": { name: "遠雄建設", sector: "建材營造" },
  "5523": { name: "宏都", sector: "建材營造" },
  "5529": { name: "志嘉建設", sector: "建材營造" },
  "5530": { name: "大漢", sector: "建材營造" },
  "5533": { name: "皇鼎建設", sector: "建材營造" },
  "5601": { name: "臺聯貨櫃", sector: "航運業" },
  "5603": { name: "陸海", sector: "航運業" },
  "5604": { name: "中連貨運", sector: "航運業" },
  "5605": { name: "遠航", sector: "航運業" },
  "5609": { name: "中菲行", sector: "航運業" },
  "5701": { name: "劍湖山", sector: "觀光事業" },
  "5703": { name: "亞都麗緻", sector: "觀光事業" },
  "5704": { name: "知本老爺", sector: "觀光事業" },
  "5706": { name: "鳳凰", sector: "觀光事業" },
  "5810": { name: "寶華商銀", sector: "金融業" },
  "5818": { name: "華僑銀行", sector: "金融業" },
  "5820": { name: "日盛金控", sector: "金融業" },
  "5902": { name: "德記", sector: "貿易百貨" },
  "5903": { name: "全家", sector: "貿易百貨" },
  "5904": { name: "寶雅", sector: "貿易百貨" },
  "5905": { name: "南仁湖", sector: "貿易百貨" },
  "6008": { name: "中信證", sector: "金融業" },
  "6015": { name: "宏遠證", sector: "金融業" },
  "6016": { name: "康和證", sector: "金融業" },
  "6020": { name: "大展證", sector: "金融業" },
  "6021": { name: "大慶證", sector: "金融業" },
  "6022": { name: "大眾證", sector: "金融業" },
  "6023": { name: "寶來期", sector: "金融業" },
  "6101": { name: "弘捷", sector: "電子零組件業" },
  "6103": { name: "合邦電子", sector: "半導體業" },
  "6104": { name: "創惟科技", sector: "半導體業" },
  "6105": { name: "瑞傳科技", sector: "電腦及週邊設備業" },
  "6107": { name: "華美電子", sector: "電子零組件業" },
  "6108": { name: "競國實業", sector: "電子零組件業" },
  "6109": { name: "亞元科技", sector: "通信網路業" },
  "6110": { name: "艾群科技", sector: "資訊服務業" },
  "6111": { name: "大宇資訊", sector: "資訊服務業" },
  "6112": { name: "聚碩科技", sector: "通信網路業" },
  "6113": { name: "亞矽科技", sector: "電子通路業" },
  "6114": { name: "翔昇電子", sector: "電子零組件業" },
  "6115": { name: "鎰勝工業", sector: "電子零組件業" },
  "6116": { name: "瀚宇彩晶", sector: "光電業" },
  "6117": { name: "迎廣科技", sector: "電腦及週邊設備業" },
  "6118": { name: "建達國際", sector: "電子通路業" },
  "6119": { name: "大傳企業", sector: "電子通路業" },
  "6120": { name: "輔祥實業", sector: "光電業" },
  "6121": { name: "新普", sector: "電腦及週邊設備業" },
  "6122": { name: "擎邦國際", sector: "電機機械" },
  "6123": { name: "上奇科技", sector: "電腦及週邊設備業" },
  "6124": { name: "業強科技", sector: "電子零組件業" },
  "6125": { name: "廣運", sector: "光電業" },
  "6126": { name: "信音", sector: "電子零組件業" },
  "6127": { name: "九豪精密", sector: "電子零組件業" },
  "6128": { name: "上福全球", sector: "電腦及週邊設備業" },
  "6129": { name: "普誠科技", sector: "半導體業" },
  "6130": { name: "亞全科技", sector: "半導體業" },
  "6131": { name: "悠克電子", sector: "光電業" },
  "6133": { name: "金橋科技", sector: "電子零組件業" },
  "6134": { name: "萬旭", sector: "電子零組件業" },
  "6135": { name: "佳營", sector: "電子通路業" },
  "6136": { name: "富爾特", sector: "通信網路業" },
  "6138": { name: "茂達電子", sector: "半導體業" },
  "6139": { name: "亞翔工程", sector: "其他電子業" },
  "6140": { name: "訊達電腦", sector: "資訊服務業" },
  "6141": { name: "柏承科技", sector: "電子零組件業" },
  "6142": { name: "友勁科技", sector: "通信網路業" },
  "6143": { name: "振曜科技", sector: "通信網路業" },
  "6144": { name: "得利影視", sector: "其他電子業" },
  "6145": { name: "勁永國際", sector: "半導體業" },
  "6146": { name: "耕興", sector: "其他電子業" },
  "6147": { name: "頎邦科技", sector: "半導體業" },
  "6148": { name: "和平資訊", sector: "資訊服務業" },
  "6149": { name: "軍成科技", sector: "資訊服務業" },
  "6150": { name: "撼訊科技", sector: "電腦及週邊設備業" },
  "6151": { name: "晉倫科技", sector: "其他電子業" },
  "6152": { name: "百一電子", sector: "通信網路業" },
  "6153": { name: "嘉聯益", sector: "電子零組件業" },
  "6154": { name: "順發", sector: "電子通路業" },
  "6155": { name: "鈞寶電子", sector: "電子零組件業" },
  "6156": { name: "科橋電子", sector: "光電業" },
  "6158": { name: "禾昌", sector: "電子零組件業" },
  "6159": { name: "詮鼎", sector: "電子通路業" },
  "6160": { name: "欣技資訊", sector: "電腦及週邊設備業" },
  "6161": { name: "捷波", sector: "電腦及週邊設備業" },
  "6163": { name: "華電網", sector: "通信網路業" },
  "6164": { name: "華興電子", sector: "光電業" },
  "6165": { name: "捷泰精密", sector: "電子零組件業" },
  "6166": { name: "凌華科技", sector: "電腦及週邊設備業" },
  "6167": { name: "久正光電", sector: "光電業" },
  "6168": { name: "宏齊科技", sector: "光電業" },
  "6169": { name: "昱泉國際", sector: "資訊服務業" },
  "6170": { name: "統振", sector: "通信網路業" },
  "6171": { name: "亞銳士", sector: "電子通路業" },
  "6172": { name: "互億科技", sector: "電腦及週邊設備業" },
  "6173": { name: "信昌電陶", sector: "電子零組件業" },
  "6174": { name: "安碁科技", sector: "電子零組件業" },
  "6175": { name: "立敦", sector: "電子零組件業" },
  "6176": { name: "瑞儀光電", sector: "光電業" },
  "6177": { name: "十全企業", sector: "電子通路業" },
  "6179": { name: "世仰科技", sector: "其他電子業" },
  "6180": { name: "遊戲橘子", sector: "資訊服務業" },
  "6182": { name: "合晶科技", sector: "半導體業" },
  "6183": { name: "關貿", sector: "資訊服務業" },
  "6185": { name: "幃翔精密", sector: "電子零組件業" },
  "6186": { name: "晶磊", sector: "半導體業" },
  "6187": { name: "萬潤", sector: "其他電子業" },
  "6188": { name: "廣明光電", sector: "電腦及週邊設備業" },
  "6189": { name: "豐藝電子", sector: "電子通路業" },
  "6190": { name: "萬泰", sector: "通信網路業" },
  "6191": { name: "精成科技", sector: "電子零組件業" },
  "6192": { name: "巨路國際", sector: "其他電子業" },
  "6194": { name: "育富", sector: "電子零組件業" },
  "6195": { name: "旭展電子", sector: "電子通路業" },
  "6196": { name: "帆宣系統", sector: "其他電子業" },
  "6197": { name: "佳必琪", sector: "其他電子業" },
  "6198": { name: "凌泰", sector: "半導體業" },
  "6199": { name: "精威科技", sector: "電腦及週邊設備業" },
  "6202": { name: "盛群半導體", sector: "半導體業" },
  "6203": { name: "海韻電", sector: "電子零組件業" },
  "6204": { name: "艾華電子", sector: "電子零組件業" },
  "6205": { name: "詮欣", sector: "電子零組件業" },
  "6206": { name: "飛捷科技", sector: "電腦及週邊設備業" },
  "6207": { name: "雷科", sector: "電子零組件業" },
  "6208": { name: "日揚", sector: "電子零組件業" },
  "6209": { name: "今國光學", sector: "光電業" },
  "6210": { name: "慶生電子", sector: "電子零組件業" },
  "6211": { name: "福登", sector: "電子零組件業" },
  "6212": { name: "理銘", sector: "其他電子業" },
  "6213": { name: "聯茂", sector: "電子零組件業" },
  "6214": { name: "精誠資訊", sector: "資訊服務業" },
  "6215": { name: "和椿科技", sector: "其他電子業" },
  "6216": { name: "居易科技", sector: "通信網路業" },
  "6217": { name: "中探針", sector: "電子零組件業" },
  "6218": { name: "豪勉科技", sector: "通信網路業" },
  "6219": { name: "視達", sector: "電腦及週邊設備業" },
  "6220": { name: "岳豐", sector: "電子零組件業" },
  "6221": { name: "晉泰", sector: "資訊服務業" },
  "6222": { name: "上揚科技", sector: "電腦及週邊設備業" },
  "6223": { name: "旺矽", sector: "半導體業" },
  "6224": { name: "聚鼎", sector: "電子零組件業" },
  "6225": { name: "天瀚科技", sector: "光電業" },
  "6226": { name: "光鼎電子", sector: "光電業" },
  "6227": { name: "茂綸", sector: "電子通路業" },
  "6228": { name: "全譜科技", sector: "電腦及週邊設備業" },
  "6229": { name: "研通", sector: "半導體業" },
  "6230": { name: "超眾", sector: "電腦及週邊設備業" },
  "6231": { name: "系微", sector: "資訊服務業" },
  "6232": { name: "仕欽", sector: "電腦及週邊設備業" },
  "6233": { name: "旺玖科技", sector: "半導體業" },
  "6234": { name: "高僑", sector: "光電業" },
  "6235": { name: "華孚科技", sector: "電腦及週邊設備業" },
  "6236": { name: "凌越科技", sector: "半導體業" },
  "6237": { name: "驊訊", sector: "半導體業" },
  "6238": { name: "巨圖科技", sector: "其他電子業" },
  "6239": { name: "力成科技", sector: "半導體業" },
  "6240": { name: "統一元氣", sector: "資訊服務業" },
  "6241": { name: "享承科技", sector: "通信網路業" },
  "6242": { name: "聯豪科", sector: "電子零組件業" },
  "6243": { name: "迅杰科技", sector: "半導體業" },
  "6244": { name: "茂迪", sector: "光電業" },
  "6245": { name: "立端", sector: "通信網路業" },
  "6246": { name: "臺龍", sector: "光電業" },
  "6247": { name: "淇譽電", sector: "電腦及週邊設備業" },
  "6248": { name: "沛波", sector: "電子零組件業" },
  "6250": { name: "宇加", sector: "電子零組件業" },
  "6251": { name: "定穎", sector: "電子零組件業" },
  "6255": { name: "奈普光電", sector: "光電業" },
  "6257": { name: "矽格", sector: "半導體業" },
  "6259": { name: "百徽", sector: "電子通路業" },
  "6261": { name: "久元", sector: "半導體業" },
  "6263": { name: "普萊德科", sector: "通信網路業" },
  "6264": { name: "德士通", sector: "通信網路業" },
  "6265": { name: "方土昶", sector: "電子通路業" },
  "6266": { name: "泰詠電子", sector: "電子零組件業" },
  "6269": { name: "台郡科技", sector: "電子零組件業" },
  "6270": { name: "倍微科技", sector: "電子通路業" },
  "6271": { name: "同欣電", sector: "半導體業" },
  "6272": { name: "驊陞", sector: "電子零組件業" },
  "6274": { name: "台燿", sector: "電子零組件業" },
  "6275": { name: "元山科技", sector: "其他電子業" },
  "6276": { name: "名鐘", sector: "其他電子業" },
  "6277": { name: "宏正自動", sector: "電腦及週邊設備業" },
  "6278": { name: "台表科", sector: "光電業" },
  "6279": { name: "胡連", sector: "電子零組件業" },
  "6280": { name: "崇貿科技", sector: "半導體業" },
  "6281": { name: "全國電子", sector: "電子通路業" },
  "6282": { name: "康舒科技", sector: "電子零組件業" },
  "6283": { name: "淳安電子", sector: "其他電子業" },
  "6284": { name: "佳邦科技", sector: "電子零組件業" },
  "6285": { name: "啟碁科技", sector: "通信網路業" },
  "6286": { name: "立錡科技", sector: "半導體業" },
  "6287": { name: "元隆電子", sector: "半導體業" },
  "6289": { name: "華上光電", sector: "光電業" },
  "6290": { name: "良維科技", sector: "電子零組件業" },
  "6291": { name: "沛亨", sector: "半導體業" },
  "6292": { name: "迅德興業", sector: "電子零組件業" },
  "6294": { name: "智基科技", sector: "光電業" },
  "6298": { name: "崴強科技", sector: "電腦及週邊設備業" },
  "6401": { name: "助群", sector: "建材營造" },
  "6402": { name: "基泰營造", sector: "建材營造" },
  "6502": { name: "國隆", sector: "紡織纖維" },
  "6504": { name: "南六", sector: "其他" },
  "6505": { name: "台塑石化", sector: "油電燃氣業" },
  "6506": { name: "雙邦", sector: "化學工業" },
  "6507": { name: "新力美", sector: "化學工業" },
  "6508": { name: "惠光化學", sector: "塑膠工業" },
  "6509": { name: "聚和", sector: "化學工業" },
  "6601": { name: "三益科", sector: "電機機械" },
  "6603": { name: "富強鑫", sector: "電機機械" },
  "6604": { name: "儒億", sector: "電機機械" },
  "6606": { name: "建德", sector: "電機機械" },
  "6608": { name: "慶鴻", sector: "電機機械" },
  "6609": { name: "瀧澤科", sector: "電機機械" },
  "6701": { name: "達和", sector: "航運業" },
  "8008": { name: "建興電子", sector: "電腦及週邊設備業" },
  "8016": { name: "矽創電子", sector: "半導體業" },
  "8017": { name: "展茂", sector: "光電業" },
  "8019": { name: "金山", sector: "電子零組件業" },
  "8021": { name: "尖點", sector: "其他電子業" },
  "8024": { name: "佑華", sector: "半導體業" },
  "8026": { name: "康和資", sector: "資訊服務業" },
  "8027": { name: "鈦昇", sector: "電機機械" },
  "8028": { name: "昇陽", sector: "半導體業" },
  "8030": { name: "基丞", sector: "電機機械" },
  "8032": { name: "光菱電子", sector: "電子通路業" },
  "8034": { name: "榮群", sector: "通信網路業" },
  "8036": { name: "光華", sector: "其他電子業" },
  "8038": { name: "長園科", sector: "電子零組件業" },
  "8039": { name: "台虹科技", sector: "電子零組件業" },
  "8040": { name: "九暘", sector: "半導體業" },
  "8041": { name: "東精電", sector: "電機機械" },
  "8042": { name: "金山電", sector: "電子零組件業" },
  "8043": { name: "密望實企", sector: "電子零組件業" },
  "8044": { name: "網路家庭", sector: "資訊服務業" },
  "8045": { name: "達運", sector: "通信網路業" },
  "8046": { name: "南亞電", sector: "電子零組件業" },
  "8047": { name: "星雲電腦", sector: "其他電子業" },
  "8048": { name: "德勝", sector: "通信網路業" },
  "8049": { name: "晶采光電", sector: "光電業" },
  "8050": { name: "廣積科技", sector: "電腦及週邊設備業" },
  "8053": { name: "巨擘科技", sector: "光電業" },
  "8054": { name: "安國", sector: "半導體業" },
  "8056": { name: "達虹", sector: "光電業" },
  "8060": { name: "力竑", sector: "電腦及週邊設備業" },
  "8064": { name: "東捷", sector: "光電業" },
  "8065": { name: "天瑞", sector: "電子零組件業" },
  "8066": { name: "福葆電子", sector: "半導體業" },
  "8067": { name: "志旭國際", sector: "電子通路業" },
  "8068": { name: "全達", sector: "電子通路業" },
  "8069": { name: "元太科技", sector: "光電業" },
  "8070": { name: "長華電材", sector: "電子通路業" },
  "8071": { name: "豐聲科技", sector: "光電業" },
  "8072": { name: "陞泰科技", sector: "光電業" },
  "8074": { name: "鉅橡企業", sector: "電子零組件業" },
  "8076": { name: "伍豐科技", sector: "電腦及週邊設備業" },
  "8077": { name: "冠華科技", sector: "光電業" },
  "8078": { name: "華寶通訊", sector: "通信網路業" },
  "8079": { name: "誠遠科技", sector: "半導體業" },
  "8080": { name: "奧斯特", sector: "電子零組件業" },
  "8081": { name: "致新", sector: "半導體業" },
  "8082": { name: "捷超", sector: "通信網路業" },
  "8083": { name: "瑞穎", sector: "電機機械" },
  "8084": { name: "巨虹電子", sector: "半導體業" },
  "8085": { name: "福華", sector: "其他電子業" },
  "8086": { name: "宏捷科", sector: "半導體業" },
  "8087": { name: "華鎂光碟", sector: "光電業" },
  "8088": { name: "品安", sector: "半導體業" },
  "8091": { name: "翔名科技", sector: "電子零組件業" },
  "8092": { name: "建暐精密", sector: "其他電子業" },
  "8093": { name: "保銳", sector: "電子零組件業" },
  "8094": { name: "卓立", sector: "通信網路業" },
  "8096": { name: "擎亞科技", sector: "電子通路業" },
  "8097": { name: "鴻松精密", sector: "通信網路業" },
  "8099": { name: "大同世界", sector: "資訊服務業" },
  "8101": { name: "華冠通訊", sector: "通信網路業" },
  "8103": { name: "瀚荃", sector: "電子零組件業" },
  "8105": { name: "凌巨科技", sector: "光電業" },
  "8107": { name: "大億科", sector: "光電業" },
  "8109": { name: "博大", sector: "電子零組件業" },
  "8110": { name: "華東科技", sector: "半導體業" },
  "8111": { name: "立碁電子", sector: "光電業" },
  "8112": { name: "至上電子", sector: "電子通路業" },
  "8114": { name: "振樺電子", sector: "電腦及週邊設備業" },
  "8115": { name: "帝聞", sector: "電子零組件業" },
  "8121": { name: "越峯電子", sector: "電子零組件業" },
  "8122": { name: "神通", sector: "資訊服務業" },
  "8127": { name: "利汎", sector: "半導體業" },
  "8130": { name: "聯達電", sector: "電子零組件業" },
  "8131": { name: "福懋科", sector: "半導體業" },
  "8157": { name: "宏麗", sector: "半導體業" },
  "8163": { name: "達方", sector: "光電業" },
  "8165": { name: "弘電", sector: "電子零組件業" },
  "8172": { name: "勝開", sector: "半導體業" },
  "8176": { name: "智捷", sector: "通信網路業" },
  "8182": { name: "加高電子", sector: "電子零組件業" },
  "8183": { name: "台灣精星", sector: "其他電子業" },
  "8189": { name: "智灝", sector: "通信網路業" },
  "8191": { name: "洲磊", sector: "光電業" },
  "8197": { name: "研能", sector: "電腦及週邊設備業" },
  "8199": { name: "廣鎵", sector: "光電業" },
  "8201": { name: "無敵", sector: "其他電子業" },
  "8210": { name: "勤誠興業", sector: "電腦及週邊設備業" },
  "8213": { name: "志超", sector: "電子零組件業" },
  "8215": { name: "達信", sector: "光電業" },
  "8225": { name: "華矽", sector: "半導體業" },
  "8227": { name: "巨有科", sector: "半導體業" },
  "8234": { name: "新漢電腦", sector: "電腦及週邊設備業" },
  "8240": { name: "華宏新技", sector: "光電業" },
  "8249": { name: "菱光科技", sector: "電子零組件業" },
  "8255": { name: "朋程科技", sector: "電機機械" },
  "8261": { name: "富鼎先進", sector: "半導體業" },
  "8264": { name: "台視訊", sector: "電腦及週邊設備業" },
  "8266": { name: "中日新", sector: "光電業" },
  "8271": { name: "宇瞻", sector: "半導體業" },
  "8277": { name: "商丞", sector: "半導體業" },
  "8281": { name: "歐普羅", sector: "其他電子業" },
  "8287": { name: "英格爾", sector: "電子零組件業" },
  "8289": { name: "泰藝電", sector: "電子零組件業" },
  "8291": { name: "尚茂", sector: "電子零組件業" },
  "8297": { name: "金橋電", sector: "電腦及週邊設備業" },
  "8299": { name: "群聯電子", sector: "電腦及週邊設備業" },
  "8349": { name: "友信國際", sector: "鋼鐵工業" },
  "8351": { name: "新東亞", sector: "半導體業" },
  "8354": { name: "冠郝", sector: "塑膠工業" },
  "8361": { name: "金協昌", sector: "電子零組件業" },
  "8374": { name: "羅昇", sector: "電機機械" },
  "8383": { name: "千附", sector: "其他電子業" },
  "8390": { name: "金益鼎", sector: "其他" },
  "8705": { name: "東隆五金", sector: "其他" },
  "8905": { name: "裕國冷凍", sector: "其他" },
  "8906": { name: "花王企業", sector: "其他" },
  "8908": { name: "欣雄", sector: "油電燃氣業" },
  "8913": { name: "華夏資", sector: "其他" },
  "8916": { name: "光隆", sector: "其他" },
  "8917": { name: "欣泰", sector: "油電燃氣業" },
  "8921": { name: "沈氏藝印", sector: "其他" },
  "8923": { name: "時報文化", sector: "其他" },
  "8924": { name: "大田精密", sector: "其他" },
  "8925": { name: "偉盟", sector: "其他" },
  "8926": { name: "台灣汽電", sector: "油電燃氣業" },
  "8927": { name: "北基", sector: "油電燃氣業" },
  "8928": { name: "鉅明", sector: "其他" },
  "8929": { name: "富堡", sector: "其他" },
  "8930": { name: "青鋼", sector: "鋼鐵工業" },
  "8931": { name: "大園汽電", sector: "油電燃氣業" },
  "8932": { name: "宏大拉鍊", sector: "其他" },
  "8933": { name: "愛地雅", sector: "其他" },
  "8934": { name: "世亘", sector: "其他" },
  "8935": { name: "邦泰複合", sector: "其他" },
  "8936": { name: "國統國際", sector: "其他" },
  "8937": { name: "合騏工業", sector: "其他" },
  "8938": { name: "明安", sector: "其他" },
  "8940": { name: "新天地", sector: "觀光事業" },
  "8941": { name: "關中", sector: "貿易百貨" },
  "8942": { name: "森鉅", sector: "其他" },
  "8996": { name: "高力", sector: "電機機械" },
  "9908": { name: "大台北瓦斯", sector: "油電燃氣業" },
  "9912": { name: "偉聯科技", sector: "電腦及週邊設備業" },
  "9918": { name: "欣欣天然氣", sector: "油電燃氣業" },
  "9926": { name: "新海瓦斯", sector: "油電燃氣業" },
  "9931": { name: "欣高石油氣", sector: "油電燃氣業" },
  "9937": { name: "全國加油站", sector: "油電燃氣業" },
  "9946": { name: "金革科技", sector: "其他" },
  "9949": { name: "琉園", sector: "其他" },
  "9950": { name: "萬國通路", sector: "塑膠工業" },
  "9951": { name: "皇田工業", sector: "電機機械" },
  "9953": { name: "東森電", sector: "其他" },
  "9955": { name: "佳龍", sector: "其他" },
  "9957": { name: "燁聯", sector: "鋼鐵工業" },
  "9958": { name: "世紀鋼", sector: "鋼鐵工業" },
  "9960": { name: "邁達康", sector: "貿易百貨" },
  "9961": { name: "儀大", sector: "貿易百貨業" },
  "9962": { name: "有益鋼鐵", sector: "鋼鐵工業" },
  "9965": { name: "永儲", sector: "航運業" }
};

const defaultPositions: Position[] = [
  {
    id: "demo-tw-2330",
    market: "TW",
    symbol: "2330",
    name: "台灣積電",
    shares: 10,
    avgCost: 850,
    currentPrice: 980,
    currency: "TWD",
    sector: "半導體業",
    note: "示範資料，可刪除",
  },
  {
    id: "demo-us-aapl",
    market: "US",
    symbol: "AAPL",
    name: "Apple",
    shares: 5,
    avgCost: 185,
    currentPrice: 212,
    currency: "USD",
    sector: "Technology",
    note: "示範資料，可刪除",
  },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function marketCurrency(market: Market) {
  return market === "US" ? "USD" : "TWD";
}

function fmt(value: number, currency = "TWD", digits = 0) {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  const symbol = currency === "USD" ? "US$" : "NT$";
  return `${symbol}${safe.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })}`;
}

function pct(value: number) {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `${safe >= 0 ? "+" : ""}${safe.toFixed(2)}%`;
}

function normMarket(value: any): Market {
  return String(value || "TW").toUpperCase().includes("US") ? "US" : "TW";
}

function normalizeSymbol(symbol: string, market?: Market) {
  const raw = String(symbol || "").trim().toUpperCase();
  if (!raw) return "";
  if (market === "TW" && /^\d+$/.test(raw)) return raw.padStart(4, "0");
  return raw;
}

function lookupTwStockInfo(symbol: string): TwStockInfo | null {
  const key = normalizeSymbol(symbol, "TW");
  return TW_STOCK_INFO[key] || null;
}

function normalizePosition(raw: any): Position {
  const market = normMarket(raw.market || raw.市場);
  const symbol = normalizeSymbol(raw.symbol || raw.代號 || "", market);
  const twInfo = market === "TW" ? lookupTwStockInfo(symbol) : null;

  return {
    id: raw.id || makeId(),
    market,
    symbol,
    name: String(raw.name || raw.stock_name || raw.名稱 || twInfo?.name || "").trim(),
    shares: Number(raw.shares || raw.股數 || 0),
    avgCost: Number(raw.avgCost ?? raw.avg_cost ?? raw.平均成本 ?? 0),
    currentPrice: Number(raw.currentPrice ?? raw.current_price ?? raw.現價 ?? raw.price ?? raw.avgCost ?? raw.avg_cost ?? raw.平均成本 ?? 0),
    currency: raw.currency || raw.幣別 || marketCurrency(market),
    sector: String(raw.sector || raw.產業 || twInfo?.sector || "未分類"),
    note: String(raw.note || raw.備註 || ""),
    updatedAt: raw.updated_at || raw.updatedAt,
  };
}

function normalizeTrade(raw: any): Trade {
  const market = normMarket(raw.market || raw.市場);
  const rawSide = String(raw.side || raw.買賣 || "BUY");
  const side: TradeSide = rawSide.toUpperCase().includes("SELL") || rawSide.includes("賣") ? "SELL" : "BUY";
  return {
    id: raw.id || makeId(),
    date: raw.date || raw.trade_date || raw.交易日期 || today(),
    market,
    symbol: normalizeSymbol(raw.symbol || raw.代號 || "", market),
    side,
    shares: Number(raw.shares || raw.股數 || 0),
    price: Number(raw.price || raw.成交價 || 0),
    fee: Number(raw.fee || raw.手續費 || 0),
    tax: Number(raw.tax || raw.交易稅 || 0),
    currency: raw.currency || raw.幣別 || marketCurrency(market),
    note: String(raw.note || raw.備註 || ""),
  };
}

function normalizeDividend(raw: any): Dividend {
  const market = normMarket(raw.market || raw.市場);
  return {
    id: raw.id || makeId(),
    payDate: raw.payDate || raw.pay_date || raw.配息日 || today(),
    market,
    symbol: normalizeSymbol(raw.symbol || raw.代號 || "", market),
    shares: Number(raw.shares || raw.股數 || 0),
    amountPerShare: Number(raw.amountPerShare ?? raw.amount_per_share ?? raw.每股股利 ?? 0),
    withholdingTax: Number(raw.withholdingTax ?? raw.withholding_tax ?? raw.扣繳稅 ?? 0),
    currency: raw.currency || raw.幣別 || marketCurrency(market),
    note: String(raw.note || raw.備註 || ""),
  };
}

export default function Page() {
  const [tab, setTab] = useState("dashboard");
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [fxRate, setFxRate] = useState(32.2);
  const [email, setEmail] = useState("");
  const [sessionEmail, setSessionEmail] = useState("");
  const [status, setStatus] = useState("輸入 Email 後寄送登入連結。登入後瀏覽器會保留登入狀態。");
  const [sectorLookupMessage, setSectorLookupMessage] = useState("");
  const [positionForm, setPositionForm] = useState({ market: "TW", symbol: "", name: "", shares: "", avgCost: "", currentPrice: "", sector: "", note: "" });
  const [tradeForm, setTradeForm] = useState({ date: today(), market: "TW", symbol: "", side: "BUY", shares: "", price: "", fee: "", tax: "", note: "" });
  const [dividendForm, setDividendForm] = useState({ payDate: today(), market: "TW", symbol: "", shares: "", amountPerShare: "", withholdingTax: "", note: "" });

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        setPositions(saved.positions || defaultPositions);
        setTrades(saved.trades || []);
        setDividends(saved.dividends || []);
        setFxRate(saved.fxRate || 32.2);
      } catch {
        setPositions(defaultPositions);
      }
    } else {
      setPositions(defaultPositions);
    }

    supabase.auth.getSession().then(({ data }) => {
      const userEmail = data.session?.user.email || "";
      setSessionEmail(userEmail);
      if (userEmail) setStatus(`已登入：${userEmail}`);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const userEmail = session?.user.email || "";
      setSessionEmail(userEmail);
      setStatus(userEmail ? `已登入：${userEmail}` : "目前未登入。請輸入 Email 並寄送登入連結。");
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ positions, trades, dividends, fxRate }));
  }, [positions, trades, dividends, fxRate]);

  const enriched = useMemo(() => positions.map((p) => {
    const toTwd = p.currency === "USD" ? fxRate : 1;
    const cost = Number(p.shares) * Number(p.avgCost);
    const value = Number(p.shares) * Number(p.currentPrice);
    const pnl = value - cost;
    return {
      ...p,
      cost,
      value,
      pnl,
      pnlPct: cost ? (pnl / cost) * 100 : 0,
      avgCostTwd: Number(p.avgCost) * toTwd,
      costTwd: cost * toTwd,
      valueTwd: value * toTwd,
      pnlTwd: pnl * toTwd,
    };
  }), [positions, fxRate]);

  const realizedDetails = useMemo(() => trades.filter((t) => t.side === "SELL").map((t) => {
    const position = positions.find((p) => p.market === t.market && p.symbol === t.symbol);
    const avgCost = position?.avgCost || 0;
    const pnlLocal = (Number(t.price) - avgCost) * Number(t.shares) - Number(t.fee || 0) - Number(t.tax || 0);
    const pnlTwd = pnlLocal * (t.currency === "USD" ? fxRate : 1);
    return { ...t, avgCost, pnlLocal, pnlTwd };
  }), [trades, positions, fxRate]);

  const totals = useMemo(() => {
    const cost = enriched.reduce((sum, p) => sum + p.costTwd, 0);
    const value = enriched.reduce((sum, p) => sum + p.valueTwd, 0);
    const unrealized = value - cost;
    const realized = realizedDetails.reduce((sum, t) => sum + t.pnlTwd, 0);
    const dividendIncome = dividends.reduce((sum, d) => {
      const income = Number(d.shares) * Number(d.amountPerShare) - Number(d.withholdingTax || 0);
      return sum + income * (d.currency === "USD" ? fxRate : 1);
    }, 0);
    return { cost, value, unrealized, pnlPct: cost ? (unrealized / cost) * 100 : 0, realized, dividendIncome, totalReturn: unrealized + realized + dividendIncome };
  }, [enriched, realizedDetails, dividends, fxRate]);

  const allocation = useMemo(() => {
    const tw = enriched.filter((p) => p.market === "TW").reduce((sum, p) => sum + p.valueTwd, 0);
    const us = enriched.filter((p) => p.market === "US").reduce((sum, p) => sum + p.valueTwd, 0);
    return [{ name: "台股", value: tw }, { name: "美股", value: us }].filter((item) => item.value > 0);
  }, [enriched]);

  const monthlyReport = useMemo(() => {
    const map = new Map<string, any>();
    trades.forEach((t) => {
      const key = String(t.date).slice(0, 7);
      const item = map.get(key) || { month: key, buy: 0, sell: 0, dividends: 0 };
      const amount = Number(t.shares) * Number(t.price) * (t.currency === "USD" ? fxRate : 1);
      if (t.side === "BUY") item.buy += amount;
      else item.sell += amount;
      map.set(key, item);
    });
    dividends.forEach((d) => {
      const key = String(d.payDate).slice(0, 7);
      const item = map.get(key) || { month: key, buy: 0, sell: 0, dividends: 0 };
      item.dividends += (Number(d.shares) * Number(d.amountPerShare) - Number(d.withholdingTax || 0)) * (d.currency === "USD" ? fxRate : 1);
      map.set(key, item);
    });
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [trades, dividends, fxRate]);

  async function signIn() {
    if (!email) return setStatus("請輸入 Email。");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
    if (error) return setStatus(error.message);
    setStatus("已寄出登入連結，請到信箱點擊連結。登入後瀏覽器會保留登入狀態。");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSessionEmail("");
    setStatus("已登出。");
  }

  async function lookupYahooSector(symbol: string) {
    const normalizedSymbol = normalizeSymbol(symbol, "US");
    if (!normalizedSymbol) return "";

    try {
      setSectorLookupMessage(`正在查詢 Yahoo Finance：${normalizedSymbol}`);
      const response = await fetch(`/api/yahoo-sector?symbol=${encodeURIComponent(normalizedSymbol)}`);
      const data = await response.json();
      const sector = data.sector || data.industry || "";
      setSectorLookupMessage(
        sector
          ? `Yahoo Finance 產業分類：${sector}`
          : `Yahoo Finance 查無產業分類：${normalizedSymbol}`
      );
      return sector;
    } catch {
      setSectorLookupMessage("Yahoo Finance 查詢失敗，請稍後再試。");
      return "";
    }
  }

  async function autoFillPositionFormBySymbol(symbol: string, market: Market) {
    const normalizedSymbol = normalizeSymbol(symbol, market);
    if (!normalizedSymbol) return;

    if (market === "TW") {
      const info = lookupTwStockInfo(normalizedSymbol);
      if (info) {
        setPositionForm((prev) => ({ ...prev, symbol: normalizedSymbol, name: prev.name || info.name, sector: info.sector }));
        setSectorLookupMessage(`已依台股 Excel 對照表帶入：${info.name}／${info.sector}`);
      } else {
        setSectorLookupMessage(`台股 Excel 對照表查無代號：${normalizedSymbol}`);
      }
      return;
    }

    const sector = await lookupYahooSector(normalizedSymbol);
    if (sector) setPositionForm((prev) => ({ ...prev, symbol: normalizedSymbol, sector }));
  }

  async function autoFillExistingPositionBySymbol(id: string, symbol: string, market: Market) {
    const normalizedSymbol = normalizeSymbol(symbol, market);
    if (!normalizedSymbol) return;

    if (market === "TW") {
      const info = lookupTwStockInfo(normalizedSymbol);
      if (info) {
        setPositions((prev) => prev.map((p) => p.id === id ? { ...p, symbol: normalizedSymbol, name: p.name || info.name, sector: info.sector } : p));
        setSectorLookupMessage(`已依台股 Excel 對照表帶入：${info.name}／${info.sector}`);
      } else {
        setSectorLookupMessage(`台股 Excel 對照表查無代號：${normalizedSymbol}`);
      }
      return;
    }

    const sector = await lookupYahooSector(normalizedSymbol);
    if (sector) setPositions((prev) => prev.map((p) => p.id === id ? { ...p, symbol: normalizedSymbol, sector } : p));
  }

  async function loadCloud() {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return setStatus("請先登入。");
    setSessionEmail(user.email || "");

    const [positionsResult, tradesResult, dividendsResult] = await Promise.all([
      supabase.from("positions").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
      supabase.from("trades").select("*").eq("user_id", user.id),
      supabase.from("dividends").select("*").eq("user_id", user.id),
    ]);

    if (positionsResult.error || tradesResult.error || dividendsResult.error) {
      return setStatus(positionsResult.error?.message || tradesResult.error?.message || dividendsResult.error?.message || "讀取雲端資料失敗。");
    }
    setPositions((positionsResult.data || []).map(normalizePosition));
    setTrades((tradesResult.data || []).map(normalizeTrade));
    setDividends((dividendsResult.data || []).map(normalizeDividend));
    setStatus("已從 Supabase 讀取資料。");
  }

  async function saveCloud() {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return setStatus("請先登入。");

    const posRows = positions.map((p) => ({ id: p.id, user_id: user.id, market: p.market, symbol: p.symbol, stock_name: p.name, name: p.name, shares: p.shares, avg_cost: p.avgCost, current_price: p.currentPrice, currency: p.currency, sector: p.sector, note: p.note, updated_at: new Date().toISOString() }));
    const tradeRows = trades.map((t) => ({ id: t.id, user_id: user.id, trade_date: t.date, date: t.date, market: t.market, symbol: t.symbol, side: t.side, shares: t.shares, price: t.price, fee: t.fee, tax: t.tax, currency: t.currency, note: t.note }));
    const dividendRows = dividends.map((d) => ({ id: d.id, user_id: user.id, pay_date: d.payDate, market: d.market, symbol: d.symbol, shares: d.shares, amount_per_share: d.amountPerShare, withholding_tax: d.withholdingTax, currency: d.currency, note: d.note }));

    const [deletePositions, deleteTrades, deleteDividends] = await Promise.all([
      supabase.from("positions").delete().eq("user_id", user.id),
      supabase.from("trades").delete().eq("user_id", user.id),
      supabase.from("dividends").delete().eq("user_id", user.id),
    ]);
    if (deletePositions.error || deleteTrades.error || deleteDividends.error) return setStatus(deletePositions.error?.message || deleteTrades.error?.message || deleteDividends.error?.message || "刪除雲端舊資料失敗。");

    const results = [];
    if (posRows.length > 0) results.push(await supabase.from("positions").insert(posRows));
    if (tradeRows.length > 0) results.push(await supabase.from("trades").insert(tradeRows));
    if (dividendRows.length > 0) results.push(await supabase.from("dividends").insert(dividendRows));
    const failed = results.find((result) => result.error);
    if (failed?.error) return setStatus(failed.error.message || "同步失敗。");
    setStatus("已同步至 Supabase。本機資料已完整覆蓋雲端資料。");
  }

  function updatePosition(id: string, field: keyof Position, value: any) {
    setPositions(positions.map((p) => {
      if (p.id !== id) return p;
      const updated = { ...p, [field]: value } as Position;
      if (field === "market") {
        updated.market = value as Market;
        updated.currency = marketCurrency(value as Market);
      }
      if (["shares", "avgCost", "currentPrice"].includes(field)) (updated as any)[field] = Number(value) || 0;
      if (field === "symbol") updated.symbol = normalizeSymbol(String(value), p.market);
      return updated;
    }));
  }

  function applyTradeToPositions(trade: Trade) {
    const tradeShares = Number(trade.shares);
    const tradePrice = Number(trade.price);
    const tradeFeeTax = Number(trade.fee || 0) + Number(trade.tax || 0);

    if (tradeShares <= 0 || tradePrice <= 0) {
      setStatus("交易股數與成交價必須大於 0。");
      return false;
    }

    const existing = positions.find((p) => p.market === trade.market && p.symbol === trade.symbol);

    if (trade.side === "BUY") {
      const twInfo = trade.market === "TW" ? lookupTwStockInfo(trade.symbol) : null;
      if (existing) {
        const oldShares = Number(existing.shares);
        const oldCost = oldShares * Number(existing.avgCost);
        const newCost = tradeShares * tradePrice + tradeFeeTax;
        const newShares = oldShares + tradeShares;
        const newAvgCost = newShares > 0 ? (oldCost + newCost) / newShares : tradePrice;
        setPositions(positions.map((p) => p.id === existing.id ? { ...p, shares: newShares, avgCost: Number(newAvgCost.toFixed(4)), currentPrice: tradePrice, currency: marketCurrency(trade.market), name: p.name || twInfo?.name || "", sector: p.sector === "未分類" && twInfo ? twInfo.sector : p.sector } : p));
      } else {
        const avgCost = (tradeShares * tradePrice + tradeFeeTax) / tradeShares;
        const newPosition: Position = {
          id: makeId(),
          market: trade.market,
          symbol: trade.symbol,
          name: twInfo?.name || "",
          shares: tradeShares,
          avgCost: Number(avgCost.toFixed(4)),
          currentPrice: tradePrice,
          currency: marketCurrency(trade.market),
          sector: twInfo?.sector || "未分類",
          note: "由買進交易自動建立",
        };
        setPositions([newPosition, ...positions]);
      }
      return true;
    }

    if (!existing) {
      setStatus(`找不到 ${trade.market} ${trade.symbol} 的庫存，無法新增賣出交易。`);
      return false;
    }

    if (tradeShares > Number(existing.shares)) {
      setStatus(`賣出股數 ${tradeShares} 大於目前庫存 ${existing.shares}，請先修正。`);
      return false;
    }

    const remainingShares = Number(existing.shares) - tradeShares;
    if (remainingShares <= 0) {
      setPositions(positions.filter((p) => p.id !== existing.id));
    } else {
      setPositions(positions.map((p) => p.id === existing.id ? { ...p, shares: remainingShares, currentPrice: tradePrice } : p));
    }
    return true;
  }

  function addPosition() {
    if (!positionForm.symbol || !positionForm.shares || !positionForm.avgCost) return setStatus("股票代號、股數、平均成本為必填。");
    const market = positionForm.market as Market;
    const symbol = normalizeSymbol(positionForm.symbol, market);
    const twInfo = market === "TW" ? lookupTwStockInfo(symbol) : null;
    const newPosition: Position = { id: makeId(), market, symbol, name: positionForm.name.trim() || twInfo?.name || "", shares: Number(positionForm.shares), avgCost: Number(positionForm.avgCost), currentPrice: Number(positionForm.currentPrice || positionForm.avgCost), currency: marketCurrency(market), sector: positionForm.sector.trim() || twInfo?.sector || "未分類", note: positionForm.note.trim() };
    setPositions([newPosition, ...positions]);
    setPositionForm({ market: "TW", symbol: "", name: "", shares: "", avgCost: "", currentPrice: "", sector: "", note: "" });
    setStatus("已新增庫存。本機已自動保存。");
  }

  function addTrade() {
    if (!tradeForm.symbol || !tradeForm.shares || !tradeForm.price) return setStatus("交易紀錄至少需輸入代號、股數與成交價。");
    const market = tradeForm.market as Market;
    const trade: Trade = { id: makeId(), date: tradeForm.date || today(), market, symbol: normalizeSymbol(tradeForm.symbol, market), side: tradeForm.side as TradeSide, shares: Number(tradeForm.shares), price: Number(tradeForm.price), fee: Number(tradeForm.fee || 0), tax: Number(tradeForm.tax || 0), currency: marketCurrency(market), note: tradeForm.note.trim() };

    const applied = applyTradeToPositions(trade);
    if (!applied) return;

    setTrades([trade, ...trades]);
    setTradeForm({ date: today(), market: "TW", symbol: "", side: "BUY", shares: "", price: "", fee: "", tax: "", note: "" });
    setStatus(trade.side === "BUY" ? "已新增買進交易，並自動更新庫存股數與平均成本。若要永久保存，請按同步到雲端。" : "已新增賣出交易，並自動扣減庫存股數。若要永久保存，請按同步到雲端。");
  }

  function addDividend() {
    if (!dividendForm.symbol || !dividendForm.shares || !dividendForm.amountPerShare) return setStatus("股利紀錄至少需輸入代號、股數與每股股利。");
    const market = dividendForm.market as Market;
    const dividend: Dividend = { id: makeId(), payDate: dividendForm.payDate || today(), market, symbol: normalizeSymbol(dividendForm.symbol, market), shares: Number(dividendForm.shares), amountPerShare: Number(dividendForm.amountPerShare), withholdingTax: Number(dividendForm.withholdingTax || 0), currency: marketCurrency(market), note: dividendForm.note.trim() };
    setDividends([dividend, ...dividends]);
    setDividendForm({ payDate: today(), market: "TW", symbol: "", shares: "", amountPerShare: "", withholdingTax: "", note: "" });
    setStatus("已新增股利配息紀錄。若要永久保存，請按同步到雲端。");
  }

  function exportCsv() {
    const header = ["market", "symbol", "name", "shares", "avgCost", "currentPrice", "currency", "sector", "note"];
    const rows = positions.map((p) => header.map((h) => `"${String((p as any)[h] ?? "").replaceAll('"', '""')}"`).join(","));
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "positions.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importExcel(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;
    const workbook = XLSX.read(await file.arrayBuffer());
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    const imported = rows.map(normalizePosition).filter((p) => p.symbol);
    setPositions([...imported, ...positions]);
    setStatus(`已匯入 ${imported.length} 筆 Excel 資料。`);
    event.target.value = "";
  }

  return (
    <main className="min-h-screen p-4 md:p-8 bg-slate-50">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-blue-700 font-medium">Portfolio Pro</p>
            <h1 className="text-3xl md:text-4xl font-bold">台股 + 美股投資庫存與績效追蹤</h1>
            <p className="text-slate-600 mt-2">Email 無密碼登入 + Supabase 雲端同步版</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={exportCsv} className="btn"><Download size={16} />匯出CSV</button>
            <label className="btn bg-white text-slate-700 cursor-pointer"><Upload size={16} />匯入Excel<input type="file" accept=".xlsx,.xls" onChange={importExcel} className="hidden" /></label>
          </div>
        </header>

        <nav className="bg-white p-2 rounded-3xl shadow-sm flex flex-wrap gap-2">
          {[["dashboard", "總覽"], ["positions", "庫存"], ["trades", "交易紀錄"], ["dividends", "股利配息"], ["reports", "報表"], ["settings", "登入/雲端"]].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 rounded-2xl ${tab === key ? "bg-blue-600 text-white" : "hover:bg-slate-100"}`}>{label}</button>
          ))}
        </nav>

        <div className="bg-blue-50 text-blue-900 rounded-2xl p-3 text-sm">{status}</div>

        {tab === "dashboard" && (
          <section className="space-y-6">
            <div className="grid md:grid-cols-4 gap-4">
              <Metric icon={<WalletCards />} title="總市值" value={fmt(totals.value)} sub={`成本 ${fmt(totals.cost)}`} />
              <Metric icon={<TrendingUp />} title="未實現損益" value={fmt(totals.unrealized)} sub={pct(totals.pnlPct)} positive={totals.unrealized >= 0} />
              <Metric icon={<ReceiptText />} title="已實現損益" value={fmt(totals.realized)} sub="依賣出交易估算" positive={totals.realized >= 0} />
              <Metric icon={<Coins />} title="股利收入" value={fmt(totals.dividendIncome)} sub={`總報酬 ${fmt(totals.totalReturn)}`} positive={totals.dividendIncome >= 0} />
            </div>
            <div className="grid xl:grid-cols-3 gap-6">
              <Card className="xl:col-span-2"><h2 className="text-xl font-semibold mb-4">月度統計</h2><div className="h-72"><ResponsiveContainer><BarChart data={monthlyReport}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip formatter={(v) => fmt(Number(v))} /><Legend /><Bar dataKey="buy" name="買進" fill="#2563eb" /><Bar dataKey="sell" name="賣出" fill="#16a34a" /><Bar dataKey="dividends" name="股利" fill="#f97316" /></BarChart></ResponsiveContainer></div></Card>
              <Card><h2 className="text-xl font-semibold mb-4">市場配置</h2><div className="h-72"><ResponsiveContainer><PieChart><Pie data={allocation} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>{allocation.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip formatter={(v) => fmt(Number(v))} /><Legend /></PieChart></ResponsiveContainer></div><label className="text-sm flex items-center gap-2">USD/TWD<input type="number" value={fxRate} onChange={(e) => setFxRate(Number(e.target.value) || 0)} className="input w-28" /></label></Card>
            </div>
          </section>
        )}

        {tab === "positions" && (
          <section className="grid xl:grid-cols-3 gap-6">
            <Card>
              <h2 className="text-xl font-semibold mb-3">新增庫存</h2>
              <div className="grid grid-cols-2 gap-3">
                <select className="input" value={positionForm.market} onChange={(e) => setPositionForm({ ...positionForm, market: e.target.value, sector: "", name: "" })}><option value="TW">台股</option><option value="US">美股</option></select>
                <input className="input" placeholder="代號" value={positionForm.symbol} onChange={(e) => { const next = e.target.value.trim().toUpperCase(); setPositionForm({ ...positionForm, symbol: next }); if (positionForm.market === "TW") { const info = lookupTwStockInfo(next); if (info) setPositionForm((prev) => ({ ...prev, symbol: next, name: prev.name || info.name, sector: info.sector })); } }} onBlur={() => autoFillPositionFormBySymbol(positionForm.symbol, positionForm.market as Market)} />
                <input className="input" placeholder="名稱" value={positionForm.name} onChange={(e) => setPositionForm({ ...positionForm, name: e.target.value })} />
                <input className="input" placeholder="產業" value={positionForm.sector} onChange={(e) => setPositionForm({ ...positionForm, sector: e.target.value })} />
                <input className="input" type="number" placeholder="股數" value={positionForm.shares} onChange={(e) => setPositionForm({ ...positionForm, shares: e.target.value })} />
                <input className="input" type="number" placeholder="平均成本" value={positionForm.avgCost} onChange={(e) => setPositionForm({ ...positionForm, avgCost: e.target.value })} />
                <input className="input" type="number" placeholder="現價" value={positionForm.currentPrice} onChange={(e) => setPositionForm({ ...positionForm, currentPrice: e.target.value })} />
                <input className="input" placeholder="備註" value={positionForm.note} onChange={(e) => setPositionForm({ ...positionForm, note: e.target.value })} />
              </div>
              {sectorLookupMessage && <div className="mt-3 rounded-2xl bg-slate-100 p-3 text-sm text-slate-600">{sectorLookupMessage}</div>}
              <button onClick={addPosition} className="btn w-full mt-3"><Plus size={16} />新增持股</button>
            </Card>
            <Card className="xl:col-span-2">
              <h2 className="text-xl font-semibold mb-4">庫存明細（可直接修改所有欄位）</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1200px] text-sm">
                  <thead><tr className="bg-slate-100 text-slate-600"><th className="p-3">市場</th><th className="p-3">代號</th><th className="p-3">名稱</th><th className="p-3 text-right">股數</th><th className="p-3 text-right">平均成本</th><th className="p-3 text-right">現價</th><th className="p-3">產業</th><th className="p-3 text-right">市值</th><th className="p-3 text-right">損益</th><th className="p-3">備註</th><th className="p-3 text-center">操作</th></tr></thead>
                  <tbody>{enriched.map((p) => <tr key={p.id} className="border-b">
                    <td className="p-2"><select className="input w-20" value={p.market} onChange={(e) => updatePosition(p.id, "market", e.target.value)}><option value="TW">TW</option><option value="US">US</option></select></td>
                    <td className="p-2"><input className="input w-24" value={p.symbol} onChange={(e) => { const next = e.target.value.trim().toUpperCase(); updatePosition(p.id, "symbol", next); if (p.market === "TW") { const info = lookupTwStockInfo(next); if (info) setPositions((prev) => prev.map((item) => item.id === p.id ? { ...item, name: item.name || info.name, sector: info.sector } : item)); } }} onBlur={() => autoFillExistingPositionBySymbol(p.id, p.symbol, p.market)} /></td>
                    <td className="p-2"><input className="input w-32" value={p.name} onChange={(e) => updatePosition(p.id, "name", e.target.value)} /></td>
                    <td className="p-2 text-right"><input className="input w-24 text-right" type="number" value={p.shares} onChange={(e) => updatePosition(p.id, "shares", e.target.value)} /></td>
                    <td className="p-2 text-right"><input className="input w-24 text-right" type="number" value={p.avgCost} onChange={(e) => updatePosition(p.id, "avgCost", e.target.value)} />{p.currency === "USD" && <div className="text-xs text-slate-500">{fmt(p.avgCostTwd)}</div>}</td>
                    <td className="p-2 text-right"><input className="input w-24 text-right" type="number" value={p.currentPrice} onChange={(e) => updatePosition(p.id, "currentPrice", e.target.value)} /></td>
                    <td className="p-2"><input className="input w-28" value={p.sector} onChange={(e) => updatePosition(p.id, "sector", e.target.value)} /></td>
                    <td className="p-2 text-right"><div>{fmt(p.value, p.currency, p.currency === "USD" ? 2 : 0)}</div><div className="text-xs text-slate-500">{fmt(p.valueTwd)}</div></td>
                    <td className={`p-2 text-right font-semibold ${p.pnl >= 0 ? "text-red-600" : "text-emerald-600"}`}>{fmt(p.pnl, p.currency, p.currency === "USD" ? 2 : 0)}<div className="text-xs text-slate-500">{fmt(p.pnlTwd)}</div></td>
                    <td className="p-2"><input className="input w-40" value={p.note} onChange={(e) => updatePosition(p.id, "note", e.target.value)} /></td>
                    <td className="p-2 text-center"><button onClick={() => { setPositions(positions.filter((x) => x.id !== p.id)); setStatus("已從網站刪除。若要同步刪除雲端資料，請按同步到雲端。"); }} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button></td>
                  </tr>)}</tbody>
                </table>
              </div>
            </Card>
          </section>
        )}

        {tab === "trades" && <TradeSection tradeForm={tradeForm} setTradeForm={setTradeForm} trades={trades} setTrades={setTrades} addTrade={addTrade} realizedDetails={realizedDetails} fxRate={fxRate} />}
        {tab === "dividends" && <DividendSection dividendForm={dividendForm} setDividendForm={setDividendForm} dividends={dividends} setDividends={setDividends} addDividend={addDividend} fxRate={fxRate} />}

        {tab === "reports" && <Card><h2 className="text-xl font-semibold">績效報表</h2><p className="text-slate-500 mt-1">目前顯示目前庫存、已實現損益與股利收入。下一版可加 XIRR / TWR。</p><div className="grid md:grid-cols-4 gap-4 mt-5"><Metric title="投入成本" value={fmt(totals.cost)} sub="目前庫存" /><Metric title="總報酬" value={fmt(totals.totalReturn)} sub="未實現+已實現+股利" positive={totals.totalReturn >= 0} /><Metric title="已實現" value={fmt(totals.realized)} sub="賣出交易估算" positive={totals.realized >= 0} /><Metric title="股利收入" value={fmt(totals.dividendIncome)} sub="配息紀錄" positive={totals.dividendIncome >= 0} /></div></Card>}

        {tab === "settings" && <Card><h2 className="text-xl font-semibold mb-4">登入 / Supabase 雲端同步</h2><p className="text-sm text-slate-500 mb-3">登入狀態：{sessionEmail || "未登入"}</p><div className="grid md:grid-cols-2 gap-3 max-w-3xl"><input className="input" placeholder="請輸入 Email" value={email} onChange={(e) => setEmail(e.target.value)} /><button onClick={signIn} className="btn"><LogIn size={16} />寄送登入連結</button></div><div className="flex flex-wrap gap-2 mt-3"><button onClick={signOut} className="btn bg-slate-700"><LogOut size={16} />登出</button><button onClick={saveCloud} className="btn"><Save size={16} />同步到雲端</button><button onClick={loadCloud} className="btn"><RefreshCw size={16} />讀取雲端</button></div><div className="mt-4 text-sm text-slate-600">本網站採 Email 無密碼登入。第一次登入需到信箱點擊登入連結；登入後，瀏覽器會保留登入狀態，通常不需要每次重新收信。同步到雲端會讓 Supabase 資料完全等於目前網站資料。</div></Card>}
      </div>
    </main>
  );
}

function TradeSection({ tradeForm, setTradeForm, trades, setTrades, addTrade, realizedDetails, fxRate }: any) {
  return <section className="grid xl:grid-cols-3 gap-6"><Card><h2 className="text-xl font-semibold mb-3">新增交易紀錄</h2><div className="grid grid-cols-2 gap-3"><input className="input" type="date" value={tradeForm.date} onChange={(e) => setTradeForm({ ...tradeForm, date: e.target.value })} /><select className="input" value={tradeForm.market} onChange={(e) => setTradeForm({ ...tradeForm, market: e.target.value })}><option value="TW">台股</option><option value="US">美股</option></select><input className="input" placeholder="代號" value={tradeForm.symbol} onChange={(e) => setTradeForm({ ...tradeForm, symbol: e.target.value.trim().toUpperCase() })} /><select className="input" value={tradeForm.side} onChange={(e) => setTradeForm({ ...tradeForm, side: e.target.value })}><option value="BUY">買進</option><option value="SELL">賣出</option></select><input className="input" type="number" placeholder="股數" value={tradeForm.shares} onChange={(e) => setTradeForm({ ...tradeForm, shares: e.target.value })} /><input className="input" type="number" placeholder="成交價" value={tradeForm.price} onChange={(e) => setTradeForm({ ...tradeForm, price: e.target.value })} /><input className="input" type="number" placeholder="手續費" value={tradeForm.fee} onChange={(e) => setTradeForm({ ...tradeForm, fee: e.target.value })} /><input className="input" type="number" placeholder="交易稅" value={tradeForm.tax} onChange={(e) => setTradeForm({ ...tradeForm, tax: e.target.value })} /><input className="input col-span-2" placeholder="備註" value={tradeForm.note} onChange={(e) => setTradeForm({ ...tradeForm, note: e.target.value })} /></div><button onClick={addTrade} className="btn w-full mt-3"><Plus size={16} />新增交易</button></Card><Card className="xl:col-span-2"><h2 className="text-xl font-semibold mb-4">交易紀錄 / 已實現損益</h2><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="bg-slate-100 text-slate-600"><th className="p-3">日期</th><th className="p-3">市場</th><th className="p-3">代號</th><th className="p-3">買賣</th><th className="p-3 text-right">股數</th><th className="p-3 text-right">成交價</th><th className="p-3 text-right">費稅</th><th className="p-3 text-right">已實現TWD</th><th className="p-3">備註</th><th></th></tr></thead><tbody>{trades.map((t: Trade) => { const detail = realizedDetails.find((r: any) => r.id === t.id); const amountTwd = detail ? detail.pnlTwd : 0; return <tr key={t.id} className="border-b"><td className="p-2">{t.date}</td><td className="p-2">{t.market}</td><td className="p-2 font-semibold">{t.symbol}</td><td className="p-2">{t.side === "BUY" ? "買進" : "賣出"}</td><td className="p-2 text-right">{t.shares.toLocaleString()}</td><td className="p-2 text-right">{fmt(t.price, t.currency, t.currency === "USD" ? 2 : 0)}</td><td className="p-2 text-right">{fmt(t.fee + t.tax, t.currency, t.currency === "USD" ? 2 : 0)}</td><td className={`p-2 text-right font-semibold ${amountTwd >= 0 ? "text-red-600" : "text-emerald-600"}`}>{t.side === "SELL" ? fmt(amountTwd) : "-"}</td><td className="p-2">{t.note}</td><td className="p-2"><button onClick={() => setTrades(trades.filter((x: Trade) => x.id !== t.id))} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button></td></tr>})}</tbody></table></div></Card></section>;
}

function DividendSection({ dividendForm, setDividendForm, dividends, setDividends, addDividend, fxRate }: any) {
  return <section className="grid xl:grid-cols-3 gap-6"><Card><h2 className="text-xl font-semibold mb-3">新增股利配息</h2><div className="grid grid-cols-2 gap-3"><input className="input" type="date" value={dividendForm.payDate} onChange={(e) => setDividendForm({ ...dividendForm, payDate: e.target.value })} /><select className="input" value={dividendForm.market} onChange={(e) => setDividendForm({ ...dividendForm, market: e.target.value })}><option value="TW">台股</option><option value="US">美股</option></select><input className="input" placeholder="代號" value={dividendForm.symbol} onChange={(e) => setDividendForm({ ...dividendForm, symbol: e.target.value.trim().toUpperCase() })} /><input className="input" type="number" placeholder="股數" value={dividendForm.shares} onChange={(e) => setDividendForm({ ...dividendForm, shares: e.target.value })} /><input className="input" type="number" placeholder="每股股利/配息" value={dividendForm.amountPerShare} onChange={(e) => setDividendForm({ ...dividendForm, amountPerShare: e.target.value })} /><input className="input" type="number" placeholder="扣繳稅" value={dividendForm.withholdingTax} onChange={(e) => setDividendForm({ ...dividendForm, withholdingTax: e.target.value })} /><input className="input col-span-2" placeholder="備註" value={dividendForm.note} onChange={(e) => setDividendForm({ ...dividendForm, note: e.target.value })} /></div><button onClick={addDividend} className="btn w-full mt-3"><Plus size={16} />新增股利</button></Card><Card className="xl:col-span-2"><h2 className="text-xl font-semibold mb-4">股利 / 配息紀錄</h2><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead><tr className="bg-slate-100 text-slate-600"><th className="p-3">配息日</th><th className="p-3">市場</th><th className="p-3">代號</th><th className="p-3 text-right">股數</th><th className="p-3 text-right">每股</th><th className="p-3 text-right">扣繳稅</th><th className="p-3 text-right">淨收入TWD</th><th className="p-3">備註</th><th></th></tr></thead><tbody>{dividends.map((d: Dividend) => { const net = (d.shares * d.amountPerShare - d.withholdingTax) * (d.currency === "USD" ? fxRate : 1); return <tr key={d.id} className="border-b"><td className="p-2">{d.payDate}</td><td className="p-2">{d.market}</td><td className="p-2 font-semibold">{d.symbol}</td><td className="p-2 text-right">{d.shares.toLocaleString()}</td><td className="p-2 text-right">{fmt(d.amountPerShare, d.currency, d.currency === "USD" ? 2 : 0)}</td><td className="p-2 text-right">{fmt(d.withholdingTax, d.currency, d.currency === "USD" ? 2 : 0)}</td><td className="p-2 text-right font-semibold text-red-600">{fmt(net)}</td><td className="p-2">{d.note}</td><td className="p-2"><button onClick={() => setDividends(dividends.filter((x: Dividend) => x.id !== d.id))} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button></td></tr>})}</tbody></table></div></Card></section>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-3xl p-5 shadow-sm ring-1 ring-slate-200 ${className}`}>{children}</div>;
}

function Metric({ icon, title, value, sub, positive }: { icon?: React.ReactNode; title: string; value: string; sub?: string; positive?: boolean }) {
  return <Card><div className="flex justify-between"><div><p className="text-sm text-slate-500">{title}</p><p className={`text-2xl font-bold mt-2 ${positive === true ? "text-red-600" : positive === false ? "text-emerald-600" : ""}`}>{value}</p><p className="text-sm text-slate-500 mt-1">{sub}</p></div>{icon && <div className="text-blue-700 bg-blue-50 rounded-2xl p-3 h-fit">{icon}</div>}</div></Card>;
}

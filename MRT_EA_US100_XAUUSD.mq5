//+------------------------------------------------------------------+
//|                                       MRT_EA_US100_XAUUSD.mq5     |
//|                          Macro Reflexive Trend Expert Advisor     |
//|                                            (MRT EA) v1.10         |
//|                                                                  |
//|  Built for US100 and XAUUSD. Symbol-flexible.                    |
//|  DESIGNED FOR BACKTESTING FIRST, NOT BLIND LIVE TRADING.         |
//+------------------------------------------------------------------+
//
//  =====================================================================
//  PHILOSOPHY (strict hierarchy, NOT equal voting):
//    1. Macro creates the thesis            (manual score, -6..+6)
//    2. Reflexivity confirms belief         (manual score, 0..5)
//    3. Higher-timeframe trend = direction  (H4 EMA + structure)
//    4. Setup model (breakout / pullback)   (price action)
//    5. Entry trigger                       (EntryTF structure shift)
//    6. Stop loss & take profit             (structure / ATR)
//    7. Risk-based position sizing          (% equity per trade)
//    8. Trade management                    (BE, trail, partials)
//    9. Pyramiding ONLY after +1R profit    (off by default)
//   10. Backtest logging & diagnostics      (Experts log + CSV)
//
//  The EA will NOT trade unless macro bias, HTF trend, and the entry
//  trigger all agree. Neutral macro = no trade (Manual Macro Mode).
//
//  =====================================================================
//  SAFETY (hard rules enforced in code):
//    - No martingale, no grid recovery, no averaging down.
//    - Lot size NEVER increases after a loss.
//    - Never pyramids into a losing trade.
//    - Never trades without a stop loss.
//    - Skips if stop distance invalid / below broker stop level.
//    - Skips if spread above the per-symbol maximum.
//    - Skips if reward:risk below the configured minimum.
//    - Skips if max daily loss / max daily trades / max daily losses hit.
//    - Skips on neutral macro unless Technical-Only Mode is selected.
//    - Skips if HTF trend disagrees with the intended direction.
//
//  =====================================================================
//  SETTINGS GUIDE
//  --------------------------------------------------------------------
//  Manual Macro Mode (default, highest confidence):
//    StrategyMode = MODE_MANUAL_MACRO.
//    Each session set ManualMacroScore (-6..+6) and ManualReflexivityScore
//    (0..5) from your own macro board. >= +3 => longs only,
//    <= -3 => shorts only, between -2..+2 => no trade.
//    Reflexivity must be >= 2 for full-size trades.
//
//  Technical-Only Mode (lower confidence, prints a warning):
//    StrategyMode = MODE_TECHNICAL_ONLY.
//    Macro + reflexivity filters are bypassed; direction comes from the
//    H4 trend only. Use only to study the mechanical edge.
//
//  Backtest Diagnostic Mode:
//    StrategyMode = MODE_BACKTEST_DIAGNOSTIC. Same gating as Manual Macro
//    Mode but logs the reason for every taken/skipped trade.
//
//  How to backtest US100:
//    Attach to a US100/NAS100/USTEC chart. Strategy Tester -> pick the
//    H4/H1/M15 alignment, "Every tick based on real ticks", realistic
//    spread + commission. US100 defaults prefer the PULLBACK setup.
//
//  How to backtest XAUUSD:
//    Attach to XAUUSD/GOLD. XAUUSD defaults prefer the BREAKOUT/RETEST
//    setup. Test it SEPARATELY from US100 (never merge the samples).
//
//  Adjust risk:        RiskPercentPerTrade (0.25..0.50 while testing).
//  Disable pyramiding: EnablePyramiding = false (this is the default).
//  Macro/reflexivity:  ManualMacroScore + ManualReflexivityScore inputs.
//
//  =====================================================================
//  BACKTEST CHECKLIST
//    [ ] Test US100 and XAUUSD as SEPARATE samples.
//    [ ] Minimum 100 trades per symbol before drawing conclusions.
//    [ ] Use realistic spread AND commission.
//    [ ] Add slippage assumptions (SlippagePoints) where possible.
//    [ ] Track: expectancy(R), profit factor, max drawdown, win rate,
//        average win(R), average loss(R) - gross AND net of costs.
//
//  =====================================================================
//  WARNINGS
//    * This strategy is NOT guaranteed profitable. It is a hypothesis.
//    * Manual macro input must be maintained by the trader; MT5 does NOT
//      know real yields, Fed expectations or geopolitics automatically.
//    * Backtest results do NOT guarantee live performance.
//    * Do NOT go live unless results show positive expectancy AFTER costs.
//    * Leveraged CFDs/indices/gold can lose money rapidly.
//  =====================================================================
//
#property copyright "MRT EA"
#property link      "https://www.mql5.com"
#property version   "1.10"
#property strict
#property description "Macro Reflexive Trend EA for US100 & XAUUSD. Backtest-first, risk-managed."

#include <Trade/Trade.mqh>

//==================================================================
// ENUMS
//==================================================================
enum ENUM_STRATEGY_MODE
{
   MODE_MANUAL_MACRO       = 0,  // Manual macro + reflexivity gating
   MODE_TECHNICAL_ONLY     = 1,  // Trend only (lower confidence)
   MODE_BACKTEST_DIAGNOSTIC= 2   // Manual gating + verbose reasons
};

enum ENUM_SETUP_MODE
{
   SETUP_BREAKOUT_ONLY = 0,
   SETUP_PULLBACK_ONLY = 1,
   SETUP_BOTH          = 2
};

enum ENUM_TRAIL_MODE
{
   TRAIL_ATR              = 0,
   TRAIL_STRUCTURE        = 1,
   TRAIL_EMA              = 2,
   TRAIL_ATR_OR_STRUCTURE = 3
};

enum ENUM_SYM_CLASS { SYM_US100=0, SYM_XAUUSD=1, SYM_OTHER=2 };

//==================================================================
// INPUTS
//==================================================================
// --- Strategy mode ---
input ENUM_STRATEGY_MODE StrategyMode = MODE_MANUAL_MACRO;
input ENUM_SETUP_MODE    SetupMode    = SETUP_BOTH;

// --- Symbol classification ---
input bool   AllowOtherSymbols = false;
input string US100Symbols      = "US100,NAS100,USTEC,NASDAQ100,NAS100.cash,US100.cash";
input string XAUUSDSymbols     = "XAUUSD,GOLD,XAUUSD.r,GOLD.cash";

// --- Manual macro / reflexivity ---
input int    ManualMacroScore             = 0;     // -6..+6
input int    ManualReflexivityScore       = 0;     //  0..5
input bool   RequireReflexivityConfirmation = true;
input double LowReflexivityRiskMultiplier = 0.5;   // used only if confirmation NOT required

// --- Timeframes ---
input ENUM_TIMEFRAMES TrendTF = PERIOD_H4;
input ENUM_TIMEFRAMES SetupTF = PERIOD_H1;
input ENUM_TIMEFRAMES EntryTF = PERIOD_M15;

// --- Trend filter ---
input int  EMAFastPeriod          = 50;
input int  EMASlowPeriod          = 200;
input bool RequireEMA50Filter     = true;
input bool RequireEMA200Filter    = false;
input bool RequireStructureFilter = true;
input bool RequireDonchianTrendFilter = false;

// --- Donchian ---
input int    DonchianFastPeriod      = 20;
input int    DonchianSlowPeriod      = 55;
input bool   UseFastDonchianBreakout = true;
input bool   UseSlowDonchianBreakout = false;
input bool   RequireBreakoutRetest   = true;
input int    RetestLookbackBars      = 12;
input double RetestToleranceATR      = 0.25;

// --- Pullback ---
input bool   UseEMAZonePullback        = true;
input int    PullbackEMA               = 50;
input double PullbackEMAToleranceATR   = 0.5;
input bool   UsePreviousBreakoutRetest = true;
input bool   UseSwingStructureTrigger  = true;

// --- Structure ---
input int SwingLeftBars        = 2;
input int SwingRightBars       = 2;
input int StructureLookbackBars= 50;

// --- ATR ---
input int    ATRPeriod                 = 14;
input bool   UseATRStop                = true;
input double ATRStopMultiplier         = 1.5;
input double MinATRMultiplierForStop   = 1.0;  // widen stop to at least this many ATR
input double MaxATRMultiplierForStop   = 4.0;  // skip trade if stop wider than this
input bool   UseATRBufferOnStructureStop = true;
input double StructureStopATRBuffer    = 0.25;

// --- Risk ---
input bool   UseFixedLot            = false;
input double FixedLotSize           = 0.01;
input double RiskPercentPerTrade    = 0.5;   // 0.25..0.5 while testing
input double MaxDailyLossPercent    = 1.0;
input int    MaxTradesPerDay        = 2;
input int    MaxLossesPerDay        = 2;
input double MinimumRewardRisk      = 2.0;
input double MaxTotalOpenRiskPercent= 1.0;
input bool   UseMinLotIfBelowCalc   = false;  // if calc lot < broker min: false=skip, true=use min

// --- Daily controls ---
input bool EnableDailyRiskControls = true;
input bool EmergencyCloseAtDailyLoss = false;

// --- Breakeven / trailing ---
input bool            MoveToBreakeven       = true;
input double          BreakevenAtR          = 1.0;
input double          BreakevenOffsetPoints = 0;
input bool            UseTrailingStop       = true;
input ENUM_TRAIL_MODE TrailMode             = TRAIL_ATR_OR_STRUCTURE;
input double          TrailStartR           = 1.5;
input double          TrailATRMultiplier    = 2.0;

// --- Partial take profit ---
input bool   UsePartialTakeProfit = true;
input double TP1_R                = 1.0;
input double TP2_R                = 2.0;
input double TP1_ClosePercent     = 50.0;
input double TP2_ClosePercent     = 30.0;
input bool   UseRunner            = true;
input double RunnerPercent        = 20.0;  // informational; remainder is the runner

// --- Pyramiding (OFF by default) ---
input bool   EnablePyramiding         = false;
input int    MaxPyramidAdds           = 2;
input double PyramidAddRiskPercent    = 0.25;
input double FirstAddAtR              = 1.0;
input double SecondAddAtR             = 2.0;
input bool   RequireBreakevenBeforeAdd= true;

// --- Spread / session / news filters ---
input bool   EnableSpreadFilter    = true;
input double MaxSpreadPoints_US100 = 50;
input double MaxSpreadPoints_XAUUSD= 30;
input double MaxSpreadPoints_Other = 30;

input bool   EnableSessionFilter   = false;
input int    SessionStartHour      = 7;
input int    SessionEndHour        = 20;
input bool   UseBrokerTime         = true;

input bool   ManualNewsBlock       = false;
input bool   EnableNewsTimeFilter  = false;
input string BlockedNewsTimes      = "";   // e.g. "13:30,15:00" (server time HH:MM)
input int    MinutesBeforeNewsBlock= 10;
input int    MinutesAfterNewsBlock = 10;

// --- Execution ---
input long MagicNumber         = 26062026;
input bool AllowIntrabarEntries= false;
input int  SlippagePoints      = 20;

// --- Logging ---
input bool   VerboseLogging  = true;
input bool   EnableCSVLogging = true;
input string CSVFileName      = "MRT_EA_Journal.csv";

//==================================================================
// GLOBALS
//==================================================================
CTrade        trade;
ENUM_SYM_CLASS g_symClass = SYM_OTHER;
datetime      g_lastEntryBarTime = 0;

// Indicator handle caches (generic, created lazily)
struct HandleEntry { ENUM_TIMEFRAMES tf; int period; int handle; };
HandleEntry g_maCache[];
HandleEntry g_atrCache[];

// Per-position registry to track initial risk / partial state
struct PosInfo
{
   ulong    ticket;
   datetime openTime;
   int      dir;          // +1 long, -1 short
   double   openPrice;
   double   initialSL;
   double   initialVolume;
   double   riskDist;     // |open - initialSL|
   bool     tp1Done;
   bool     tp2Done;
   bool     beDone;
};
PosInfo g_pos[];

//==================================================================
// SMALL HELPERS
//==================================================================
double GetAsk()  { return SymbolInfoDouble(_Symbol, SYMBOL_ASK); }
double GetBid()  { return SymbolInfoDouble(_Symbol, SYMBOL_BID); }
double NormalizePrice(double p) { return NormalizeDouble(p, _Digits); }

string UpperCopy(string s) { string t=s; StringToUpper(t); return t; }

// True if 'symbol' contains any comma-separated alias in 'csv'
bool SymbolMatchesList(string symbol, string csv)
{
   string up = UpperCopy(symbol);
   string parts[];
   int n = StringSplit(csv, (ushort)StringGetCharacter(",",0), parts);
   for(int i=0;i<n;i++)
   {
      string a = UpperCopy(parts[i]);
      StringTrimLeft(a); StringTrimRight(a);
      if(StringLen(a)>0 && StringFind(up, a) >= 0) return true;
   }
   return false;
}

ENUM_SYM_CLASS ClassifySymbol()
{
   if(SymbolMatchesList(_Symbol, US100Symbols))  return SYM_US100;
   if(SymbolMatchesList(_Symbol, XAUUSDSymbols)) return SYM_XAUUSD;
   return SYM_OTHER;
}

//==================================================================
// INDICATOR ACCESS (safe, cached)
//==================================================================
int GetMAHandle(ENUM_TIMEFRAMES tf, int period)
{
   for(int i=0;i<ArraySize(g_maCache);i++)
      if(g_maCache[i].tf==tf && g_maCache[i].period==period)
         return g_maCache[i].handle;
   int h = iMA(_Symbol, tf, period, 0, MODE_EMA, PRICE_CLOSE);
   if(h==INVALID_HANDLE) return INVALID_HANDLE;
   int n=ArraySize(g_maCache); ArrayResize(g_maCache,n+1);
   g_maCache[n].tf=tf; g_maCache[n].period=period; g_maCache[n].handle=h;
   return h;
}

int GetATRHandle(ENUM_TIMEFRAMES tf, int period)
{
   for(int i=0;i<ArraySize(g_atrCache);i++)
      if(g_atrCache[i].tf==tf && g_atrCache[i].period==period)
         return g_atrCache[i].handle;
   int h = iATR(_Symbol, tf, period);
   if(h==INVALID_HANDLE) return INVALID_HANDLE;
   int n=ArraySize(g_atrCache); ArrayResize(g_atrCache,n+1);
   g_atrCache[n].tf=tf; g_atrCache[n].period=period; g_atrCache[n].handle=h;
   return h;
}

// Returns EMA value at 'shift'; 0.0 means unavailable -> callers treat as invalid
double GetEMA(ENUM_TIMEFRAMES tf, int period, int shift)
{
   int h = GetMAHandle(tf, period);
   if(h==INVALID_HANDLE) return 0.0;
   double buf[];
   if(CopyBuffer(h, 0, shift, 1, buf) < 1) return 0.0;
   return buf[0];
}

// Returns ATR value at 'shift'; 0.0 means unavailable
double GetATR(ENUM_TIMEFRAMES tf, int period, int shift)
{
   int h = GetATRHandle(tf, period);
   if(h==INVALID_HANDLE) return 0.0;
   double buf[];
   if(CopyBuffer(h, 0, shift, 1, buf) < 1) return 0.0;
   return buf[0];
}

// Donchian channel using COMPLETED candles only (caller supplies start shift)
double GetDonchianHigh(ENUM_TIMEFRAMES tf, int period, int shift)
{
   if(period<1) return 0.0;
   int idx = iHighest(_Symbol, tf, MODE_HIGH, period, shift);
   if(idx < 0) return 0.0;
   return iHigh(_Symbol, tf, idx);
}
double GetDonchianLow(ENUM_TIMEFRAMES tf, int period, int shift)
{
   if(period<1) return 0.0;
   int idx = iLowest(_Symbol, tf, MODE_LOW, period, shift);
   if(idx < 0) return 0.0;
   return iLow(_Symbol, tf, idx);
}

//==================================================================
// MARKET STRUCTURE (simple fractal swings, non-repainting)
//==================================================================
// A swing high at 'shift' needs SwingLeftBars older and SwingRightBars
// newer bars all lower. Caller must ensure shift >= SwingRightBars.
bool IsSwingHigh(ENUM_TIMEFRAMES tf, int shift)
{
   if(shift < SwingRightBars) return false;
   double h = iHigh(_Symbol, tf, shift);
   if(h<=0) return false;
   for(int i=1;i<=SwingLeftBars;i++)
      if(iHigh(_Symbol, tf, shift+i) >= h) return false;   // older side
   for(int i=1;i<=SwingRightBars;i++)
      if(iHigh(_Symbol, tf, shift-i) >= h) return false;   // newer side
   return true;
}
bool IsSwingLow(ENUM_TIMEFRAMES tf, int shift)
{
   if(shift < SwingRightBars) return false;
   double l = iLow(_Symbol, tf, shift);
   if(l<=0) return false;
   for(int i=1;i<=SwingLeftBars;i++)
      if(iLow(_Symbol, tf, shift+i) <= l) return false;
   for(int i=1;i<=SwingRightBars;i++)
      if(iLow(_Symbol, tf, shift-i) <= l) return false;
   return true;
}

// Collect up to maxCount most-recent confirmed swing highs/lows
void CollectSwingHighs(ENUM_TIMEFRAMES tf, double &out[], int maxCount)
{
   ArrayResize(out,0);
   for(int s=SwingRightBars+1; s<=StructureLookbackBars; s++)
   {
      if(ArraySize(out)>=maxCount) break;
      if(IsSwingHigh(tf,s)) { int n=ArraySize(out); ArrayResize(out,n+1); out[n]=iHigh(_Symbol,tf,s); }
   }
}
void CollectSwingLows(ENUM_TIMEFRAMES tf, double &out[], int maxCount)
{
   ArrayResize(out,0);
   for(int s=SwingRightBars+1; s<=StructureLookbackBars; s++)
   {
      if(ArraySize(out)>=maxCount) break;
      if(IsSwingLow(tf,s)) { int n=ArraySize(out); ArrayResize(out,n+1); out[n]=iLow(_Symbol,tf,s); }
   }
}

double GetLastSwingHigh(ENUM_TIMEFRAMES tf)
{
   for(int s=SwingRightBars+1; s<=StructureLookbackBars; s++)
      if(IsSwingHigh(tf,s)) return iHigh(_Symbol,tf,s);
   return 0.0;
}
double GetLastSwingLow(ENUM_TIMEFRAMES tf)
{
   for(int s=SwingRightBars+1; s<=StructureLookbackBars; s++)
      if(IsSwingLow(tf,s)) return iLow(_Symbol,tf,s);
   return 0.0;
}

// HH+HL = bullish structure; LH+LL = bearish structure
bool HasBullishStructure(ENUM_TIMEFRAMES tf)
{
   double hi[], lo[];
   CollectSwingHighs(tf,hi,2);
   CollectSwingLows(tf,lo,2);
   if(ArraySize(hi)<2 || ArraySize(lo)<2) return false;
   return (hi[0]>hi[1] && lo[0]>lo[1]);
}
bool HasBearishStructure(ENUM_TIMEFRAMES tf)
{
   double hi[], lo[];
   CollectSwingHighs(tf,hi,2);
   CollectSwingLows(tf,lo,2);
   if(ArraySize(hi)<2 || ArraySize(lo)<2) return false;
   return (hi[0]<hi[1] && lo[0]<lo[1]);
}

// Entry trigger: last completed EntryTF candle breaks the recent minor
// swing high (bullish) / swing low (bearish). Pullback presence required.
bool EntryBullishStructureShift()
{
   double sh = GetLastSwingHigh(EntryTF);
   double sl = GetLastSwingLow(EntryTF);
   if(sh<=0 || sl<=0) return false;
   double c1 = iClose(_Symbol, EntryTF, 1);
   return (c1 > sh);   // close above minor swing high after a pullback low exists
}
bool EntryBearishStructureShift()
{
   double sh = GetLastSwingHigh(EntryTF);
   double sl = GetLastSwingLow(EntryTF);
   if(sh<=0 || sl<=0) return false;
   double c1 = iClose(_Symbol, EntryTF, 1);
   return (c1 < sl);   // close below minor swing low after a pullback high exists
}

//==================================================================
// TREND FILTER
//==================================================================
bool IsBullishTrend()
{
   double price = iClose(_Symbol, TrendTF, 1);
   if(price<=0) return false;
   bool ok = true;

   if(RequireEMA50Filter)
   {
      double e = GetEMA(TrendTF, EMAFastPeriod, 1);
      if(e<=0) return false;
      if(price <= e) ok=false;
   }
   if(RequireEMA200Filter)
   {
      double e1 = GetEMA(TrendTF, EMAFastPeriod, 1);
      double e2 = GetEMA(TrendTF, EMASlowPeriod, 1);
      if(e1<=0 || e2<=0) return false;
      if(!(e1 > e2)) ok=false;
   }
   if(RequireStructureFilter)
      if(!HasBullishStructure(TrendTF)) ok=false;
   if(RequireDonchianTrendFilter)
   {
      double dh = GetDonchianHigh(TrendTF, DonchianFastPeriod, 2);
      if(dh<=0 || price < dh) ok=false;
   }
   return ok;
}
bool IsBearishTrend()
{
   double price = iClose(_Symbol, TrendTF, 1);
   if(price<=0) return false;
   bool ok = true;

   if(RequireEMA50Filter)
   {
      double e = GetEMA(TrendTF, EMAFastPeriod, 1);
      if(e<=0) return false;
      if(price >= e) ok=false;
   }
   if(RequireEMA200Filter)
   {
      double e1 = GetEMA(TrendTF, EMAFastPeriod, 1);
      double e2 = GetEMA(TrendTF, EMASlowPeriod, 1);
      if(e1<=0 || e2<=0) return false;
      if(!(e1 < e2)) ok=false;
   }
   if(RequireStructureFilter)
      if(!HasBearishStructure(TrendTF)) ok=false;
   if(RequireDonchianTrendFilter)
   {
      double dl = GetDonchianLow(TrendTF, DonchianFastPeriod, 2);
      if(dl<=0 || price > dl) ok=false;
   }
   return ok;
}
// +1 bullish, -1 bearish, 0 neutral/range -> no trade
int GetTrendDirection()
{
   bool bull = IsBullishTrend();
   bool bear = IsBearishTrend();
   if(bull && !bear) return +1;
   if(bear && !bull) return -1;
   return 0;
}

//==================================================================
// MACRO / REFLEXIVITY LAYER (manual)
//==================================================================
bool MacroAllowsLong()
{
   if(StrategyMode==MODE_TECHNICAL_ONLY) return true;
   return (ManualMacroScore >= 3);
}
bool MacroAllowsShort()
{
   if(StrategyMode==MODE_TECHNICAL_ONLY) return true;
   return (ManualMacroScore <= -3);
}
bool ReflexivityAllowsTrade()
{
   if(StrategyMode==MODE_TECHNICAL_ONLY) return true;
   if(!RequireReflexivityConfirmation) return true; // allowed; risk reduced in sizing
   return (ManualReflexivityScore >= 2);
}
// Manual macro mode: +1 long-only, -1 short-only, 0 neutral (no trade).
int GetAllowedDirection()
{
   if(StrategyMode==MODE_TECHNICAL_ONLY) return GetTrendDirection();
   if(ManualMacroScore >= 3)  return +1;
   if(ManualMacroScore <= -3) return -1;
   return 0;
}

//==================================================================
// FILTERS
//==================================================================
bool IsSpreadAcceptable()
{
   if(!EnableSpreadFilter) return true;
   double spreadPts = (GetAsk()-GetBid())/_Point;
   double maxPts = MaxSpreadPoints_Other;
   if(g_symClass==SYM_US100)  maxPts = MaxSpreadPoints_US100;
   if(g_symClass==SYM_XAUUSD) maxPts = MaxSpreadPoints_XAUUSD;
   return (spreadPts <= maxPts);
}

bool IsWithinTradingSession()
{
   if(!EnableSessionFilter) return true;
   datetime now = UseBrokerTime ? TimeCurrent() : TimeLocal();
   MqlDateTime mt; TimeToStruct(now, mt);
   int h = mt.hour;
   if(SessionStartHour <= SessionEndHour)
      return (h >= SessionStartHour && h < SessionEndHour);
   // wrap-around window (e.g. 22 -> 6)
   return (h >= SessionStartHour || h < SessionEndHour);
}

bool IsNewsBlocked()
{
   if(ManualNewsBlock) return true;
   if(EnableNewsTimeFilter && StringLen(BlockedNewsTimes)>0)
   {
      datetime now = UseBrokerTime ? TimeCurrent() : TimeLocal();
      MqlDateTime mt; TimeToStruct(now, mt);
      int nowMin = mt.hour*60 + mt.min;
      string parts[];
      int n = StringSplit(BlockedNewsTimes, (ushort)StringGetCharacter(",",0), parts);
      for(int i=0;i<n;i++)
      {
         string p = parts[i]; StringTrimLeft(p); StringTrimRight(p);
         int c = StringFind(p, ":");
         if(c<=0) continue;
         int hh = (int)StringToInteger(StringSubstr(p,0,c));
         int mm = (int)StringToInteger(StringSubstr(p,c+1));
         int evMin = hh*60+mm;
         if(nowMin >= evMin-MinutesBeforeNewsBlock && nowMin <= evMin+MinutesAfterNewsBlock)
            return true;
      }
   }
   return false;
}

bool IsNewBar(ENUM_TIMEFRAMES tf)
{
   datetime t = iTime(_Symbol, tf, 0);
   static datetime last = 0;
   if(t != last) { last = t; return true; }
   return false;
}

//==================================================================
// DAILY RISK CONTROLS
//==================================================================
void GetTodayStats(double &pnl, int &trades, int &losses)
{
   pnl=0; trades=0; losses=0;
   datetime dayStart = (datetime)(((long)TimeCurrent()/86400)*86400);
   if(!HistorySelect(dayStart, TimeCurrent())) return;
   int total = HistoryDealsTotal();
   for(int i=0;i<total;i++)
   {
      ulong d = HistoryDealGetTicket(i);
      if(d==0) continue;
      if(HistoryDealGetInteger(d, DEAL_MAGIC) != MagicNumber) continue;
      long entry = HistoryDealGetInteger(d, DEAL_ENTRY);
      double prof = HistoryDealGetDouble(d, DEAL_PROFIT);
      double net  = prof + HistoryDealGetDouble(d, DEAL_SWAP) + HistoryDealGetDouble(d, DEAL_COMMISSION);
      pnl += net;
      if(entry==DEAL_ENTRY_IN)  trades++;
      if(entry==DEAL_ENTRY_OUT && prof < 0) losses++;
   }
}
double GetTodayRealizedPnL() { double p; int t,l; GetTodayStats(p,t,l); return p; }
int    GetTodayTradeCount()  { double p; int t,l; GetTodayStats(p,t,l); return t; }
int    GetTodayLossCount()   { double p; int t,l; GetTodayStats(p,t,l); return l; }

bool DailyRiskAllowsTrading()
{
   if(!EnableDailyRiskControls) return true;
   double pnl; int trades, losses;
   GetTodayStats(pnl, trades, losses);

   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   double lossLimit = -(MaxDailyLossPercent/100.0)*bal;
   if(bal>0 && pnl <= lossLimit) return false;
   if(trades >= MaxTradesPerDay)  return false;
   if(losses >= MaxLossesPerDay)  return false;
   return true;
}

//==================================================================
// POSITION HELPERS
//==================================================================
int CountEAPositions(string symbol, int dir) // dir: 0=any, +1 long, -1 short
{
   int cnt=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk==0) continue;
      if(!PositionSelectByTicket(tk)) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=MagicNumber) continue;
      if(PositionGetString(POSITION_SYMBOL)!=symbol) continue;
      long ptype = PositionGetInteger(POSITION_TYPE);
      int pdir = (ptype==POSITION_TYPE_BUY)? +1 : -1;
      if(dir==0 || dir==pdir) cnt++;
   }
   return cnt;
}
// Net direction of EA positions on symbol: +1 longs only, -1 shorts only, 0 mixed/none
int EADirection(string symbol)
{
   int longs = CountEAPositions(symbol, +1);
   int shorts= CountEAPositions(symbol, -1);
   if(longs>0 && shorts==0) return +1;
   if(shorts>0 && longs==0) return -1;
   return 0;
}

double CurrentOpenRiskPercent()
{
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   if(equity<=0) return 0;
   double tickVal = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize= SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickVal<=0 || tickSize<=0) return 0;
   double valuePerUnit = tickVal/tickSize;

   double riskMoney=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk==0) continue;
      if(!PositionSelectByTicket(tk)) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=MagicNumber) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      double open = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl   = PositionGetDouble(POSITION_SL);
      double vol  = PositionGetDouble(POSITION_VOLUME);
      if(sl<=0) continue; // no SL -> ignore here (should never happen)
      double dist = MathAbs(open-sl);
      riskMoney += dist*valuePerUnit*vol;
   }
   return (riskMoney/equity)*100.0;
}

//==================================================================
// RISK / SIZING
//==================================================================
double GetEffectiveRiskPercent()
{
   double r = RiskPercentPerTrade;
   if(StrategyMode!=MODE_TECHNICAL_ONLY
      && !RequireReflexivityConfirmation
      && ManualReflexivityScore < 2)
      r *= LowReflexivityRiskMultiplier;   // reduce risk on weak reflexivity
   return r;
}

double NormalizeVolume(double v)
{
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double maxV = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(step<=0) step=0.01;
   v = MathFloor(v/step + 0.0000001)*step;
   if(maxV>0 && v>maxV) v=maxV;
   if(v<0) v=0;
   return NormalizeDouble(v, 2);
}

double CalculateRewardRisk(double entry, double sl, double tp)
{
   double r = MathAbs(entry-sl);
   if(r<=0) return 0;
   return MathAbs(tp-entry)/r;
}

// Risk-based lot sizing. riskOverride>0 forces a specific % (used by pyramiding).
double CalculateLotSize(double entryPrice, double stopLossPrice, double riskOverride=-1)
{
   double minV = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);

   if(UseFixedLot)
   {
      double lf = NormalizeVolume(FixedLotSize);
      if(lf < minV) lf = minV;
      return lf;
   }

   double stopDist = MathAbs(entryPrice - stopLossPrice);
   if(stopDist<=0) return 0;

   double tickVal = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize= SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickVal<=0 || tickSize<=0) return 0;
   double valuePerUnit = tickVal/tickSize;  // account-currency value of a 1.0 price move per 1 lot

   double riskPct = (riskOverride>0 ? riskOverride : GetEffectiveRiskPercent());
   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   double riskMoney = equity * riskPct/100.0;
   if(riskMoney<=0) return 0;

   double raw  = riskMoney/(stopDist*valuePerUnit);
   double lots = NormalizeVolume(raw);

   if(lots < minV)
   {
      if(UseMinLotIfBelowCalc) lots = minV;   // accept min lot (may exceed target risk slightly)
      else return 0;                          // safer default: skip
   }
   return lots;
}

bool MarginOK(ENUM_ORDER_TYPE type, double lots, double price)
{
   double margin=0;
   if(!OrderCalcMargin(type, _Symbol, lots, price, margin)) return false;
   double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   return (margin <= freeMargin*0.9);
}

// Final gatekeeper before any order is sent
bool IsRiskAcceptable(double entry, double sl, double tp)
{
   double dist = MathAbs(entry-sl);
   if(dist<=0) return false;

   double rr = CalculateRewardRisk(entry, sl, tp);
   if(rr < MinimumRewardRisk - 0.0001) return false;

   long stopsLevelPts = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double minDist = stopsLevelPts*_Point;
   if(minDist>0 && dist < minDist) return false;
   if(minDist>0 && MathAbs(tp-entry) < minDist) return false;

   double spreadPrice = GetAsk()-GetBid();
   if(spreadPrice>0 && dist < spreadPrice*2.0) return false; // stop too small vs spread

   double atr = GetATR(EntryTF, ATRPeriod, 1);
   if(atr>0 && dist > MaxATRMultiplierForStop*atr) return false; // stop too wide

   return true;
}

//==================================================================
// STOPS / TARGETS
//==================================================================
double CalculateLongStop(string setupType)
{
   double atr   = GetATR(EntryTF, ATRPeriod, 1);
   double entry = GetAsk();
   double structStop = GetLastSwingLow(EntryTF);
   double buffer = (UseATRBufferOnStructureStop && atr>0) ? StructureStopATRBuffer*atr : 0;
   double sStop = (structStop>0) ? structStop - buffer : 0;

   double result = sStop;
   if(UseATRStop && atr>0)
   {
      double aStop = entry - ATRStopMultiplier*atr;
      result = (sStop>0) ? MathMin(sStop, aStop) : aStop; // wider (more conservative)
   }
   if(structStop<=0 || result<=0 || result>=entry)
   {
      if(atr>0) result = entry - ATRStopMultiplier*atr;
      else return 0;
   }
   // enforce minimum ATR distance to avoid noise stop-outs
   if(atr>0 && (entry-result) < MinATRMultiplierForStop*atr)
      result = entry - MinATRMultiplierForStop*atr;

   if(result<=0 || result>=entry) return 0;
   return result;
}
double CalculateShortStop(string setupType)
{
   double atr   = GetATR(EntryTF, ATRPeriod, 1);
   double entry = GetBid();
   double structStop = GetLastSwingHigh(EntryTF);
   double buffer = (UseATRBufferOnStructureStop && atr>0) ? StructureStopATRBuffer*atr : 0;
   double sStop = (structStop>0) ? structStop + buffer : 0;

   double result = sStop;
   if(UseATRStop && atr>0)
   {
      double aStop = entry + ATRStopMultiplier*atr;
      result = (sStop>0) ? MathMax(sStop, aStop) : aStop;
   }
   if(structStop<=0 || result<=entry)
   {
      if(atr>0) result = entry + ATRStopMultiplier*atr;
      else return 0;
   }
   if(atr>0 && (result-entry) < MinATRMultiplierForStop*atr)
      result = entry + MinATRMultiplierForStop*atr;

   if(result<=entry) return 0;
   return result;
}
double CalculateLongTP(double entry, double sl)
{
   double risk = entry-sl;
   if(risk<=0) return 0;
   double R = MathMax(TP2_R, MinimumRewardRisk);
   return entry + R*risk;
}
double CalculateShortTP(double entry, double sl)
{
   double risk = sl-entry;
   if(risk<=0) return 0;
   double R = MathMax(TP2_R, MinimumRewardRisk);
   return entry - R*risk;
}

//==================================================================
// SETUP MODELS
//==================================================================
// --- Setup A: Trend breakout (Turtle-style, optional retest) ---
bool CheckBreakoutLong()
{
   double atr = GetATR(SetupTF, ATRPeriod, 1);
   int per = DonchianFastPeriod;
   if(UseSlowDonchianBreakout && !UseFastDonchianBreakout) per = DonchianSlowPeriod;

   if(!RequireBreakoutRetest)
   {
      double level = GetDonchianHigh(SetupTF, per, 2); // prior high, excludes breakout bar
      if(level<=0) return false;
      return (iClose(_Symbol, SetupTF, 1) > level);
   }

   // Retest mode: breakout happened within lookback, price retested & held, entry confirms
   bool broke=false; double level=0;
   for(int k=1;k<=RetestLookbackBars;k++)
   {
      double lvl = GetDonchianHigh(SetupTF, per, k+1);
      if(lvl>0 && iClose(_Symbol, SetupTF, k) > lvl) { broke=true; level=lvl; break; }
   }
   if(!broke || atr<=0) return false;

   double lo1 = iLow(_Symbol, SetupTF, 1);
   bool retested = (lo1 <= level + RetestToleranceATR*atr) && (iClose(_Symbol, SetupTF, 1) >= level);
   if(!retested) return false;

   return EntryBullishStructureShift();
}
bool CheckBreakoutShort()
{
   double atr = GetATR(SetupTF, ATRPeriod, 1);
   int per = DonchianFastPeriod;
   if(UseSlowDonchianBreakout && !UseFastDonchianBreakout) per = DonchianSlowPeriod;

   if(!RequireBreakoutRetest)
   {
      double level = GetDonchianLow(SetupTF, per, 2);
      if(level<=0) return false;
      return (iClose(_Symbol, SetupTF, 1) < level);
   }

   bool broke=false; double level=0;
   for(int k=1;k<=RetestLookbackBars;k++)
   {
      double lvl = GetDonchianLow(SetupTF, per, k+1);
      if(lvl>0 && iClose(_Symbol, SetupTF, k) < lvl) { broke=true; level=lvl; break; }
   }
   if(!broke || atr<=0) return false;

   double hi1 = iHigh(_Symbol, SetupTF, 1);
   bool retested = (hi1 >= level - RetestToleranceATR*atr) && (iClose(_Symbol, SetupTF, 1) <= level);
   if(!retested) return false;

   return EntryBearishStructureShift();
}

// --- Setup B: Trend pullback / contrarian entry within bigger trend ---
bool CheckPullbackLong()
{
   double atr = GetATR(SetupTF, ATRPeriod, 1);
   if(atr<=0) return false;
   bool zone=false;

   if(UseEMAZonePullback)
   {
      double ema = GetEMA(SetupTF, PullbackEMA, 1);
      if(ema>0)
         for(int i=1;i<=RetestLookbackBars;i++)
         {
            double lo = iLow(_Symbol, SetupTF, i);
            if(lo <= ema + PullbackEMAToleranceATR*atr && lo >= ema - PullbackEMAToleranceATR*atr)
            { zone=true; break; }
         }
   }
   if(UsePreviousBreakoutRetest && !zone)
   {
      double lvl = GetDonchianHigh(SetupTF, DonchianFastPeriod, RetestLookbackBars+2);
      if(lvl>0 && MathAbs(iLow(_Symbol, SetupTF, 1) - lvl) <= RetestToleranceATR*atr) zone=true;
   }
   if(!zone) return false;

   if(UseSwingStructureTrigger && !EntryBullishStructureShift()) return false;
   return true;
}
bool CheckPullbackShort()
{
   double atr = GetATR(SetupTF, ATRPeriod, 1);
   if(atr<=0) return false;
   bool zone=false;

   if(UseEMAZonePullback)
   {
      double ema = GetEMA(SetupTF, PullbackEMA, 1);
      if(ema>0)
         for(int i=1;i<=RetestLookbackBars;i++)
         {
            double hi = iHigh(_Symbol, SetupTF, i);
            if(hi >= ema - PullbackEMAToleranceATR*atr && hi <= ema + PullbackEMAToleranceATR*atr)
            { zone=true; break; }
         }
   }
   if(UsePreviousBreakoutRetest && !zone)
   {
      double lvl = GetDonchianLow(SetupTF, DonchianFastPeriod, RetestLookbackBars+2);
      if(lvl>0 && MathAbs(iHigh(_Symbol, SetupTF, 1) - lvl) <= RetestToleranceATR*atr) zone=true;
   }
   if(!zone) return false;

   if(UseSwingStructureTrigger && !EntryBearishStructureShift()) return false;
   return true;
}

//==================================================================
// LOGGING
//==================================================================
void LogTradeDecision(string message)
{
   if(VerboseLogging || StrategyMode==MODE_BACKTEST_DIAGNOSTIC)
      Print("[MRT] ", _Symbol, " | ", message);
}

void WriteCSVOpen(string setupType, int dir, double entry, double sl, double tp,
                  double lots, double riskPct, double atr)
{
   if(!EnableCSVLogging) return;
   int fh = FileOpen(CSVFileName, FILE_READ|FILE_WRITE|FILE_CSV|FILE_ANSI|FILE_COMMON, ',');
   if(fh==INVALID_HANDLE) return;
   if(FileSize(fh)==0)
      FileWrite(fh, "Time","Symbol","Mode","Setup","Dir","Macro","Reflex","Trend",
                    "Entry","SL","TP","Lots","Risk%","ATR","Spread","Result","ExitReason","R");
   FileSeek(fh, 0, SEEK_END);
   double spreadPts = (GetAsk()-GetBid())/_Point;
   FileWrite(fh,
      TimeToString(TimeCurrent(), TIME_DATE|TIME_MINUTES|TIME_SECONDS),
      _Symbol,
      EnumToString(StrategyMode),
      setupType,
      (dir>0?"LONG":"SHORT"),
      ManualMacroScore,
      ManualReflexivityScore,
      GetTrendDirection(),
      DoubleToString(entry,_Digits),
      DoubleToString(sl,_Digits),
      DoubleToString(tp,_Digits),
      DoubleToString(lots,2),
      DoubleToString(riskPct,2),
      DoubleToString(atr,_Digits),
      DoubleToString(spreadPts,1),
      "OPEN","","" );
   FileClose(fh);
}

void WriteCSVClose(double profit)
{
   if(!EnableCSVLogging) return;
   int fh = FileOpen(CSVFileName, FILE_READ|FILE_WRITE|FILE_CSV|FILE_ANSI|FILE_COMMON, ',');
   if(fh==INVALID_HANDLE) return;
   FileSeek(fh, 0, SEEK_END);
   FileWrite(fh,
      TimeToString(TimeCurrent(), TIME_DATE|TIME_MINUTES|TIME_SECONDS),
      _Symbol,"","","","","","","","","","","","","",
      "CLOSE",
      (profit>=0?"WIN":"LOSS"),
      DoubleToString(profit,2));
   FileClose(fh);
}

//==================================================================
// TRADE EXECUTION
//==================================================================
bool ExecuteLongTrade(string setupType, double riskOverride=-1)
{
   double entry = GetAsk();
   double sl = CalculateLongStop(setupType);
   if(sl<=0 || sl>=entry) { LogTradeDecision("Skip LONG: invalid stop"); return false; }

   double tp = CalculateLongTP(entry, sl);
   if(tp<=0) { LogTradeDecision("Skip LONG: invalid TP"); return false; }

   if(!IsRiskAcceptable(entry, sl, tp)) { LogTradeDecision("Skip LONG: R:R/stop/spread filter"); return false; }

   double lots = CalculateLotSize(entry, sl, riskOverride);
   if(lots<=0) { LogTradeDecision("Skip LONG: lot calc failed/too small"); return false; }

   if(!MarginOK(ORDER_TYPE_BUY, lots, entry)) { LogTradeDecision("Skip LONG: insufficient margin"); return false; }

   sl = NormalizePrice(sl); tp = NormalizePrice(tp);
   if(!trade.Buy(lots, _Symbol, 0.0, sl, tp, "MRT "+setupType))
   { LogTradeDecision("Buy failed: "+trade.ResultRetcodeDescription()); return false; }

   double riskPct = (riskOverride>0?riskOverride:GetEffectiveRiskPercent());
   double atr = GetATR(EntryTF, ATRPeriod, 1);
   LogTradeDecision(StringFormat("OPEN LONG %s lots=%.2f entry=%.*f SL=%.*f TP=%.*f R:R=%.2f risk%%=%.2f",
      setupType, lots, _Digits, entry, _Digits, sl, _Digits, tp,
      CalculateRewardRisk(entry,sl,tp), riskPct));
   WriteCSVOpen(setupType, +1, entry, sl, tp, lots, riskPct, atr);
   return true;
}

bool ExecuteShortTrade(string setupType, double riskOverride=-1)
{
   double entry = GetBid();
   double sl = CalculateShortStop(setupType);
   if(sl<=entry) { LogTradeDecision("Skip SHORT: invalid stop"); return false; }

   double tp = CalculateShortTP(entry, sl);
   if(tp<=0) { LogTradeDecision("Skip SHORT: invalid TP"); return false; }

   if(!IsRiskAcceptable(entry, sl, tp)) { LogTradeDecision("Skip SHORT: R:R/stop/spread filter"); return false; }

   double lots = CalculateLotSize(entry, sl, riskOverride);
   if(lots<=0) { LogTradeDecision("Skip SHORT: lot calc failed/too small"); return false; }

   if(!MarginOK(ORDER_TYPE_SELL, lots, entry)) { LogTradeDecision("Skip SHORT: insufficient margin"); return false; }

   sl = NormalizePrice(sl); tp = NormalizePrice(tp);
   if(!trade.Sell(lots, _Symbol, 0.0, sl, tp, "MRT "+setupType))
   { LogTradeDecision("Sell failed: "+trade.ResultRetcodeDescription()); return false; }

   double riskPct = (riskOverride>0?riskOverride:GetEffectiveRiskPercent());
   double atr = GetATR(EntryTF, ATRPeriod, 1);
   LogTradeDecision(StringFormat("OPEN SHORT %s lots=%.2f entry=%.*f SL=%.*f TP=%.*f R:R=%.2f risk%%=%.2f",
      setupType, lots, _Digits, entry, _Digits, sl, _Digits, tp,
      CalculateRewardRisk(entry,sl,tp), riskPct));
   WriteCSVOpen(setupType, -1, entry, sl, tp, lots, riskPct, atr);
   return true;
}

//==================================================================
// POSITION REGISTRY (tracks initial risk + partial state)
//==================================================================
int FindPosIndex(ulong ticket)
{
   for(int i=0;i<ArraySize(g_pos);i++)
      if(g_pos[i].ticket==ticket) return i;
   return -1;
}

void SyncRegistry()
{
   // Add newly seen EA positions
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong tk = PositionGetTicket(i);
      if(tk==0) continue;
      if(!PositionSelectByTicket(tk)) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=MagicNumber) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;

      if(FindPosIndex(tk)<0)
      {
         double open = PositionGetDouble(POSITION_PRICE_OPEN);
         double sl   = PositionGetDouble(POSITION_SL);
         double vol  = PositionGetDouble(POSITION_VOLUME);
         long   ptype= PositionGetInteger(POSITION_TYPE);
         int n=ArraySize(g_pos); ArrayResize(g_pos,n+1);
         g_pos[n].ticket=tk;
         g_pos[n].openTime=(datetime)PositionGetInteger(POSITION_TIME);
         g_pos[n].dir=(ptype==POSITION_TYPE_BUY)?+1:-1;
         g_pos[n].openPrice=open;
         g_pos[n].initialSL=sl;
         g_pos[n].initialVolume=vol;
         g_pos[n].riskDist=(sl>0)?MathAbs(open-sl):0;
         g_pos[n].tp1Done=false;
         g_pos[n].tp2Done=false;
         g_pos[n].beDone=false;
      }
   }
   // Remove closed positions from registry
   for(int i=ArraySize(g_pos)-1;i>=0;i--)
   {
      if(!PositionSelectByTicket(g_pos[i].ticket))
      {
         for(int j=i;j<ArraySize(g_pos)-1;j++) g_pos[j]=g_pos[j+1];
         ArrayResize(g_pos, ArraySize(g_pos)-1);
      }
   }
}

//==================================================================
// TRADE MANAGEMENT (breakeven, partials, trailing) - never loosen
//==================================================================
void ManageBreakeven(int idx)
{
   if(!MoveToBreakeven || g_pos[idx].beDone) return;
   if(g_pos[idx].riskDist<=0) return;
   ulong tk = g_pos[idx].ticket;
   if(!PositionSelectByTicket(tk)) return;

   double open = g_pos[idx].openPrice;
   double R    = g_pos[idx].riskDist;
   double curSL= PositionGetDouble(POSITION_SL);
   double tp   = PositionGetDouble(POSITION_TP);
   double offset = BreakevenOffsetPoints*_Point;

   if(g_pos[idx].dir>0)
   {
      double price = GetBid();
      if(price >= open + BreakevenAtR*R)
      {
         double newSL = open + offset;
         if(newSL > curSL)
            if(trade.PositionModify(tk, NormalizePrice(newSL), tp)) g_pos[idx].beDone=true;
      }
   }
   else
   {
      double price = GetAsk();
      if(price <= open - BreakevenAtR*R)
      {
         double newSL = open - offset;
         if(curSL<=0 || newSL < curSL)
            if(trade.PositionModify(tk, NormalizePrice(newSL), tp)) g_pos[idx].beDone=true;
      }
   }
}

void ManagePartialTakeProfits(int idx)
{
   if(!UsePartialTakeProfit) return;
   if(g_pos[idx].riskDist<=0) return;
   ulong tk = g_pos[idx].ticket;
   if(!PositionSelectByTicket(tk)) return;

   double open = g_pos[idx].openPrice;
   double R    = g_pos[idx].riskDist;
   double curVol = PositionGetDouble(POSITION_VOLUME);
   double minV   = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double price  = (g_pos[idx].dir>0)? GetBid() : GetAsk();

   // TP1
   if(!g_pos[idx].tp1Done)
   {
      bool hit = (g_pos[idx].dir>0)? (price >= open + TP1_R*R) : (price <= open - TP1_R*R);
      if(hit)
      {
         double vol = NormalizeVolume(g_pos[idx].initialVolume * TP1_ClosePercent/100.0);
         if(vol>=minV && vol < curVol)
         {
            if(trade.PositionClosePartial(tk, vol)) { g_pos[idx].tp1Done=true; LogTradeDecision("Partial TP1 closed"); }
         }
         else g_pos[idx].tp1Done=true; // too small to split; flag done to avoid loops
      }
   }
   // TP2
   if(g_pos[idx].tp1Done && !g_pos[idx].tp2Done)
   {
      bool hit = (g_pos[idx].dir>0)? (price >= open + TP2_R*R) : (price <= open - TP2_R*R);
      if(hit)
      {
         if(PositionSelectByTicket(tk))
         {
            double cv = PositionGetDouble(POSITION_VOLUME);
            double vol = NormalizeVolume(g_pos[idx].initialVolume * TP2_ClosePercent/100.0);
            if(!UseRunner) vol = cv;                  // close all remaining if no runner
            if(vol>=minV && vol < cv)
            {
               if(trade.PositionClosePartial(tk, vol)) { g_pos[idx].tp2Done=true; LogTradeDecision("Partial TP2 closed; runner remains"); }
            }
            else g_pos[idx].tp2Done=true;
         }
      }
   }
}

void ManageTrailingStop(int idx)
{
   if(!UseTrailingStop) return;
   if(g_pos[idx].riskDist<=0) return;
   ulong tk = g_pos[idx].ticket;
   if(!PositionSelectByTicket(tk)) return;

   double open = g_pos[idx].openPrice;
   double R    = g_pos[idx].riskDist;
   double curSL= PositionGetDouble(POSITION_SL);
   double tp   = PositionGetDouble(POSITION_TP);
   double atr  = GetATR(EntryTF, ATRPeriod, 1);

   if(g_pos[idx].dir>0)
   {
      double price = GetBid();
      if(price < open + TrailStartR*R) return;       // only after trade proves itself

      double candidate = 0;
      double atrSL = (atr>0)? price - TrailATRMultiplier*atr : 0;
      double strSL = GetLastSwingLow(EntryTF);
      if(UseATRBufferOnStructureStop && atr>0 && strSL>0) strSL -= StructureStopATRBuffer*atr;

      if(TrailMode==TRAIL_ATR)        candidate = atrSL;
      else if(TrailMode==TRAIL_STRUCTURE) candidate = strSL;
      else if(TrailMode==TRAIL_EMA)   candidate = GetEMA(SetupTF, PullbackEMA, 1);
      else /* ATR_OR_STRUCTURE */     candidate = MathMax(atrSL, strSL); // tighter of the two

      if(candidate>0 && candidate < price && candidate > curSL) // never loosen, keep below price
         trade.PositionModify(tk, NormalizePrice(candidate), tp);
   }
   else
   {
      double price = GetAsk();
      if(price > open - TrailStartR*R) return;

      double candidate = 0;
      double atrSL = (atr>0)? price + TrailATRMultiplier*atr : 0;
      double strSL = GetLastSwingHigh(EntryTF);
      if(UseATRBufferOnStructureStop && atr>0 && strSL>0) strSL += StructureStopATRBuffer*atr;

      if(TrailMode==TRAIL_ATR)        candidate = atrSL;
      else if(TrailMode==TRAIL_STRUCTURE) candidate = strSL;
      else if(TrailMode==TRAIL_EMA)   candidate = GetEMA(SetupTF, PullbackEMA, 1);
      else
      {
         candidate = atrSL;
         if(strSL>0) candidate = MathMin(atrSL, strSL);
      }

      if(candidate>0 && candidate > price && (curSL<=0 || candidate < curSL))
         trade.PositionModify(tk, NormalizePrice(candidate), tp);
   }
}

void ManageOpenPositions()
{
   SyncRegistry();
   for(int i=0;i<ArraySize(g_pos);i++)
   {
      ManagePartialTakeProfits(i);
      ManageBreakeven(i);
      ManageTrailingStop(i);
   }
}

//==================================================================
// PYRAMIDING (optional, off by default). Never adds to a loser.
//==================================================================
double BaseProfitR(string symbol, int dir)
{
   // oldest EA position in 'dir'
   datetime best = 0; int idx=-1;
   for(int i=0;i<ArraySize(g_pos);i++)
   {
      if(g_pos[i].dir!=dir) continue;
      if(g_pos[i].riskDist<=0) continue;
      if(idx<0 || g_pos[i].openTime < best) { best=g_pos[i].openTime; idx=i; }
   }
   if(idx<0) return 0;
   double price = (dir>0)? GetBid() : GetAsk();
   double R = g_pos[idx].riskDist;
   return (dir>0)? (price-g_pos[idx].openPrice)/R : (g_pos[idx].openPrice-price)/R;
}
bool BaseAtBreakeven(string symbol, int dir)
{
   datetime best = 0; int idx=-1;
   for(int i=0;i<ArraySize(g_pos);i++)
   {
      if(g_pos[i].dir!=dir) continue;
      if(idx<0 || g_pos[i].openTime < best) { best=g_pos[i].openTime; idx=i; }
   }
   if(idx<0) return false;
   if(!PositionSelectByTicket(g_pos[idx].ticket)) return false;
   double sl = PositionGetDouble(POSITION_SL);
   double open = g_pos[idx].openPrice;
   if(sl<=0) return false;
   return (dir>0)? (sl >= open) : (sl <= open);
}

void CheckPyramidEntry()
{
   if(!EnablePyramiding) return;
   SyncRegistry();

   int dir = EADirection(_Symbol);
   if(dir==0) return; // none, or mixed (do not add)

   int adds = CountEAPositions(_Symbol, dir) - 1;
   if(adds < 0) adds = 0;
   if(adds >= MaxPyramidAdds) return;

   // base must already be profitable by the required R
   double reqR = (adds==0)? FirstAddAtR : SecondAddAtR;
   double pR = BaseProfitR(_Symbol, dir);
   if(pR < reqR) return;                        // NEVER add unless winning

   if(RequireBreakevenBeforeAdd && !BaseAtBreakeven(_Symbol, dir)) return;

   // trend and macro must still agree
   if(GetTrendDirection() != dir) return;
   if(StrategyMode!=MODE_TECHNICAL_ONLY)
   {
      if(dir>0 && ManualMacroScore < 3)  return;
      if(dir<0 && ManualMacroScore > -3) return;
   }

   // fresh valid signal required
   bool sig = (dir>0)? (CheckPullbackLong()||CheckBreakoutLong())
                     : (CheckPullbackShort()||CheckBreakoutShort());
   if(!sig) return;

   // total open risk cap
   if(CurrentOpenRiskPercent() + PyramidAddRiskPercent > MaxTotalOpenRiskPercent) return;
   if(!DailyRiskAllowsTrading()) return;
   if(!IsSpreadAcceptable() || IsNewsBlocked() || !IsWithinTradingSession()) return;

   if(dir>0) ExecuteLongTrade("PYRAMID", PyramidAddRiskPercent);
   else      ExecuteShortTrade("PYRAMID", PyramidAddRiskPercent);
}

//==================================================================
// MASTER GATE
//==================================================================
bool CanOpenNewTrade()
{
   // terminal / account / symbol trading permissions
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED)) { LogTradeDecision("Skip: terminal trade not allowed"); return false; }
   if(!MQLInfoInteger(MQL_TRADE_ALLOWED))          { LogTradeDecision("Skip: EA trading not allowed"); return false; }
   if(!AccountInfoInteger(ACCOUNT_TRADE_ALLOWED))  { LogTradeDecision("Skip: account trade not allowed"); return false; }
   long tradeMode = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_MODE);
   if(tradeMode==SYMBOL_TRADE_MODE_DISABLED)       { LogTradeDecision("Skip: symbol trade disabled"); return false; }

   if(g_symClass==SYM_OTHER && !AllowOtherSymbols) { LogTradeDecision("Skip: symbol not US100/XAUUSD and AllowOtherSymbols=false"); return false; }

   if(!DailyRiskAllowsTrading()) { LogTradeDecision("Skip: daily risk limit (loss/trades/losses) reached"); return false; }
   if(!IsSpreadAcceptable())     { LogTradeDecision("Skip: spread too high"); return false; }
   if(!IsWithinTradingSession()) { LogTradeDecision("Skip: outside trading session"); return false; }
   if(IsNewsBlocked())           { LogTradeDecision("Skip: news block active"); return false; }

   return true;
}

//==================================================================
// ENTRY EVALUATION (priority by symbol)
//==================================================================
// returns true if an order was sent
bool EvaluateLongSetups()
{
   bool pullbackFirst = (g_symClass==SYM_US100); // US100 prefers pullback; gold/other prefer breakout
   bool allowBreak  = (SetupMode==SETUP_BREAKOUT_ONLY || SetupMode==SETUP_BOTH);
   bool allowPull   = (SetupMode==SETUP_PULLBACK_ONLY || SetupMode==SETUP_BOTH);

   if(pullbackFirst)
   {
      if(allowPull && CheckPullbackLong())  return ExecuteLongTrade("PULLBACK");
      if(allowBreak && CheckBreakoutLong()) return ExecuteLongTrade("BREAKOUT");
   }
   else
   {
      if(allowBreak && CheckBreakoutLong()) return ExecuteLongTrade("BREAKOUT");
      if(allowPull && CheckPullbackLong())  return ExecuteLongTrade("PULLBACK");
   }
   return false;
}
bool EvaluateShortSetups()
{
   bool pullbackFirst = (g_symClass==SYM_US100);
   bool allowBreak  = (SetupMode==SETUP_BREAKOUT_ONLY || SetupMode==SETUP_BOTH);
   bool allowPull   = (SetupMode==SETUP_PULLBACK_ONLY || SetupMode==SETUP_BOTH);

   if(pullbackFirst)
   {
      if(allowPull && CheckPullbackShort())  return ExecuteShortTrade("PULLBACK");
      if(allowBreak && CheckBreakoutShort()) return ExecuteShortTrade("BREAKOUT");
   }
   else
   {
      if(allowBreak && CheckBreakoutShort()) return ExecuteShortTrade("BREAKOUT");
      if(allowPull && CheckPullbackShort())  return ExecuteShortTrade("PULLBACK");
   }
   return false;
}

//==================================================================
// EVENT HANDLERS
//==================================================================
int OnInit()
{
   g_symClass = ClassifySymbol();

   if(g_symClass==SYM_OTHER && !AllowOtherSymbols)
   {
      Print("[MRT] Symbol ", _Symbol, " is not recognized as US100/XAUUSD and AllowOtherSymbols=false. EA idle.");
      // Allow attach (so user can flip the input) but it will not trade.
   }

   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(SlippagePoints);
   trade.SetAsyncMode(false);

   // Warm up & validate core indicator handles
   if(GetMAHandle(TrendTF, EMAFastPeriod)==INVALID_HANDLE ||
      GetMAHandle(TrendTF, EMASlowPeriod)==INVALID_HANDLE ||
      GetMAHandle(SetupTF, PullbackEMA)==INVALID_HANDLE   ||
      GetATRHandle(EntryTF, ATRPeriod)==INVALID_HANDLE    ||
      GetATRHandle(SetupTF, ATRPeriod)==INVALID_HANDLE)
   {
      Print("[MRT] Failed to create indicator handles.");
      return INIT_FAILED;
   }

   if(StrategyMode==MODE_TECHNICAL_ONLY)
      Print("[MRT] WARNING: Technical-only mode active: macro/reflexivity filters disabled (lower confidence).");

   Print("[MRT] Init OK. Symbol=", _Symbol, " class=", EnumToString(g_symClass),
         " mode=", EnumToString(StrategyMode), " setup=", EnumToString(SetupMode),
         " macro=", ManualMacroScore, " reflex=", ManualReflexivityScore);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   // Release cached indicator handles
   for(int i=0;i<ArraySize(g_maCache);i++)  if(g_maCache[i].handle!=INVALID_HANDLE)  IndicatorRelease(g_maCache[i].handle);
   for(int i=0;i<ArraySize(g_atrCache);i++) if(g_atrCache[i].handle!=INVALID_HANDLE) IndicatorRelease(g_atrCache[i].handle);
   ArrayResize(g_maCache,0);
   ArrayResize(g_atrCache,0);
   Print("[MRT] Deinit. reason=", reason);
}

void OnTick()
{
   // 1) Manage existing positions every tick (BE, partials, trailing)
   ManageOpenPositions();

   // 2) Pyramiding (optional)
   if(EnablePyramiding) CheckPyramidEntry();

   // 3) Emergency daily-loss close (optional)
   if(EnableDailyRiskControls && EmergencyCloseAtDailyLoss)
   {
      double bal = AccountInfoDouble(ACCOUNT_BALANCE);
      if(bal>0 && GetTodayRealizedPnL() <= -(MaxDailyLossPercent/100.0)*bal)
      {
         for(int i=PositionsTotal()-1;i>=0;i--)
         {
            ulong tk = PositionGetTicket(i);
            if(tk==0) continue;
            if(!PositionSelectByTicket(tk)) continue;
            if(PositionGetInteger(POSITION_MAGIC)!=MagicNumber) continue;
            if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
            trade.PositionClose(tk);
         }
      }
   }

   // 4) New-entry evaluation only once per EntryTF bar (unless intrabar allowed)
   datetime entryBar = iTime(_Symbol, EntryTF, 0);
   bool newBar = (entryBar != g_lastEntryBarTime);
   if(newBar) g_lastEntryBarTime = entryBar;
   if(!newBar && !AllowIntrabarEntries) return;

   // 5) One initial position per symbol unless pyramiding handles the rest
   if(CountEAPositions(_Symbol, 0) > 0) return;

   // 6) Master gate
   if(!CanOpenNewTrade()) return;

   // 7) Direction from macro (or trend in technical-only)
   int dir = GetAllowedDirection();
   if(dir==0) { LogTradeDecision("Skip: neutral macro / no direction"); return; }

   // 8) HTF trend MUST agree with intended direction
   int trend = GetTrendDirection();
   if(trend==0)       { LogTradeDecision("Skip: HTF trend neutral/ranging"); return; }
   if(trend != dir)   { LogTradeDecision("Skip: HTF trend disagrees with macro direction"); return; }

   // 9) Reflexivity confirmation (manual)
   if(!ReflexivityAllowsTrade()) { LogTradeDecision("Skip: reflexivity score < 2"); return; }

   // 10) Setup evaluation + execution (priority by symbol)
   if(dir>0) EvaluateLongSetups();
   else      EvaluateShortSetups();
}

// Log closed deals (accurate net profit) to the CSV journal
void OnTradeTransaction(const MqlTradeTransaction& trans,
                        const MqlTradeRequest& request,
                        const MqlTradeResult& result)
{
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD) return;
   if(!HistoryDealSelect(trans.deal)) return;
   if(HistoryDealGetInteger(trans.deal, DEAL_MAGIC) != MagicNumber) return;
   if(HistoryDealGetString(trans.deal, DEAL_SYMBOL) != _Symbol) return;
   if(HistoryDealGetInteger(trans.deal, DEAL_ENTRY) != DEAL_ENTRY_OUT) return;

   double profit = HistoryDealGetDouble(trans.deal, DEAL_PROFIT)
                 + HistoryDealGetDouble(trans.deal, DEAL_SWAP)
                 + HistoryDealGetDouble(trans.deal, DEAL_COMMISSION);
   WriteCSVClose(profit);
}
//+------------------------------------------------------------------+

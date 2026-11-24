export interface Savings {
  // Numeric for manual entries; 'stock-<id>' for entries from the portfolio
  id: number | string;
  amount: number;
  description: string;
  category: 'ETFs' | 'Stocks' | 'Savings Account';
  month: string;
  year: number;
  created_at: string;
  // 'manual' = added via the allocation form; 'portfolio' = a stock quantity change
  source: 'manual' | 'portfolio';
  ticker?: string;
  sharesChange?: number;
  priceUsd?: number;
  usdEurRate?: number;
  priceEstimated?: boolean;
}

export interface SavingsAllocation {
  monthlyAmount: number;
  description: string;
  etfPercentage: number;
  savingsPercentage: number;
  selectedMonth: string;
  year: number;
}

export interface StockTicker {
  id: number;
  ticker: string;
  added_at: string;
}

// Response of adding a ticker; dividendsLoaded is false when dividend data
// couldn't be fetched yet (the next refresh fills it in)
export interface AddStockResult {
  id: number;
  ticker: string;
  isin: string;
  companyName?: string;
  dividendsLoaded: boolean;
  message: string;
}

// Stock data source and remaining request quota (Eulerpool)
export interface StockDataStatus {
  provider: string;
  prices: string;
  refreshIntervalHours: number;
  quota: {
    limit: number | null;
    remaining: number;
    resetsAt: string | null;
    updatedAt: string;
  } | null;
}

// Result of refreshing all stocks from the data provider
export interface StockRefreshSummary {
  total: number;
  refreshed: number;
  failed: { ticker: string; error: string }[];
  stoppedReason: string | null;
}

export interface StockQuote {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: string;
  companyName?: string;
}

export interface StockData {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: string;
  companyName?: string;
  dividendYield?: number;
  exDividendDate?: string;
  lastRefreshedAt?: string;
  overviewRefreshedAt?: string;
  quantity?: number;  // Add quantity for portfolio feature
  isin?: string;
  currency?: string;
}

// Portfolio feature types
export interface StockHolding {
  ticker: string;
  quantity: number;
  updatedAt: string;
}

export interface StockPortfolioItem {
  ticker: string;
  quantity: number;
  currentPrice: number;
  totalValue: number;
  change: number;
  changePercent: number;
  companyName?: string;
  dividendYield?: number;
}

export interface PortfolioSummary {
  totalValue: number;
  totalChange: number;
  totalChangePercent: number;
  stocksOwned: number;
  stocksWatched: number;
  totalStocks: number;
  holdings: StockPortfolioItem[];
}

export interface WatchlistWithHoldings {
  ticker: string;
  addedAt: string;
  quantity: number;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: string;
  companyName?: string;
  dividendYield?: number;
  exDividendDate?: string;
  lastRefreshedAt?: string;
  overviewRefreshedAt?: string;
}

// Dividend income projection types
export interface DividendStockContribution {
  ticker: string;
  annualDividend: number;
  quantity: number;
  currentPrice: number;
  dividendYield: number;
  companyName?: string;
}

export interface DividendProjection {
  year: number;
  totalDividend: number;
  stockBreakdown: DividendStockContribution[];
}

export interface DividendChartData {
  projections: DividendProjection[];
  reinvestedProjections: DividendProjection[];
  currentAnnualDividend: number;
  totalProjectedIncome: number;
  totalProjectedIncomeWithReinvestment: number;
  dividendStocksCount: number;
  yearsProjected: number;
}
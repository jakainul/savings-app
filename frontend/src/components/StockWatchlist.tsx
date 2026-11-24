import React, { useState, useEffect, useCallback } from 'react';
import StockForm from './StockForm';
import StockList from './StockList';
import PortfolioSummary from './PortfolioSummary';
import QuantityEditor from './QuantityEditor';
import StockPortfolioPieChart from './StockPortfolioPieChart';
import DividendIncomeChart from './DividendIncomeChart';
import { getStockWatchlist, addStockToWatchlist, removeStockFromWatchlist, getWatchlistWithHoldings, getPortfolioSummary, refreshAllStocks, getStockDataStatus } from '../api';
import { StockTicker, StockData, StockDataStatus, PortfolioSummary as PortfolioSummaryType } from '../types';

interface StockWithState extends StockData {
  loading: boolean;
  error: string | null;
}

interface StockWatchlistProps {
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  // Called after a quantity change, so savings (which include stock entries) can reload
  onHoldingsChanged?: () => void;
}

const StockWatchlist: React.FC<StockWatchlistProps> = ({ showToast, onHoldingsChanged }) => {
  const [watchlist, setWatchlist] = useState<StockTicker[]>([]);
  const [stocks, setStocks] = useState<StockWithState[]>([]);
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummaryType | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [editingStock, setEditingStock] = useState<{ ticker: string; quantity: number } | null>(null);
  const [dataStatus, setDataStatus] = useState<StockDataStatus | null>(null);

  // Data source and remaining Eulerpool quota (no Eulerpool request)
  const fetchDataStatus = useCallback(async () => {
    try {
      setDataStatus(await getStockDataStatus());
    } catch {
      setDataStatus(null);
    }
  }, []);

  // Fetch watchlist from database
  const fetchWatchlist = useCallback(async () => {
    try {
      const tickers = await getStockWatchlist();
      setWatchlist(tickers);
      return tickers;
    } catch (error) {
      showToast('Failed to load watchlist', 'error');
      return [];
    }
  }, [showToast]);

  // Fetch watchlist with holdings and quotes (no external API calls)
  const fetchWatchlistWithHoldings = useCallback(async () => {
    try {
      const data = await getWatchlistWithHoldings();
      const withState: StockWithState[] = data.map((d) => ({
        ...d,
        loading: false,
        error: null,
      }));
      setStocks(withState);
    } catch (error: any) {
      // If fetch fails, reflect error state per known watchlist
      const errorMessage = error.response?.data?.error || 'Failed to load data';
      const fallback: StockWithState[] = watchlist.map((t) => ({
        ticker: t.ticker,
        price: 0,
        change: 0,
        changePercent: 0,
        volume: 0,
        timestamp: '',
        quantity: 0,
        loading: false,
        error: errorMessage,
      }));
      setStocks(fallback);
    }
  }, [watchlist]);

  // Fetch portfolio summary for pie chart and summary card
  const fetchPortfolioSummary = useCallback(async () => {
    try {
      setPortfolioLoading(true);
      const summary = await getPortfolioSummary();
      setPortfolioSummary(summary);
    } catch (error) {
      // If no portfolio or error, set to null (pie chart won't render)
      setPortfolioSummary(null);
    } finally {
      setPortfolioLoading(false);
    }
  }, []);

  // Add stock to watchlist
  const handleAddStock = async (ticker: string) => {
    setIsAdding(true);
    try {
      const result = await addStockToWatchlist(ticker);
      if (result.dividendsLoaded === false) {
        showToast(`${result.message}. Dividend data will be filled in by the next refresh.`, 'info');
      } else {
        showToast(result.message || `${ticker} added to watchlist`, 'success');
      }
      fetchDataStatus();
      await fetchWatchlist();
      await fetchWatchlistWithHoldings();
      await fetchPortfolioSummary();
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to add ticker';
      showToast(errorMessage, 'error');
      throw error;
    } finally {
      setIsAdding(false);
    }
  };

  // Delete stock from watchlist
  const handleDeleteStock = async (ticker: string) => {
    try {
      await removeStockFromWatchlist(ticker);
      showToast(`${ticker} removed from watchlist`, 'success');
      await fetchWatchlist();
      await fetchWatchlistWithHoldings();
      await fetchPortfolioSummary();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to remove ticker', 'error');
    }
  };

  // Refresh view (reload data)
  // Refresh: fetch the latest closes from Eulerpool, then reload the view
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const summary = await refreshAllStocks();
      await fetchWatchlistWithHoldings();
      await fetchPortfolioSummary();
      await fetchDataStatus();
      onHoldingsChanged?.(); // stock savings entries use the latest prices
      if (summary.failed.length === 0) {
        showToast(`Updated ${summary.refreshed} stocks`, 'success');
      } else {
        const details = summary.failed.slice(0, 3).map((f) => `${f.ticker}: ${f.error}`).join('; ');
        showToast(`Updated ${summary.refreshed} of ${summary.total} stocks. ${details}`, summary.refreshed > 0 ? 'info' : 'error');
      }
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to refresh stock data', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Edit quantity
  const handleEditQuantity = (ticker: string, currentQuantity: number) => {
    setEditingStock({ ticker, quantity: currentQuantity });
  };

  // Handle quantity update success
  const handleQuantityUpdated = async () => {
    if (editingStock) {
      showToast(`Updated ${editingStock.ticker} quantity`, 'success');
      setEditingStock(null);
      await fetchWatchlistWithHoldings();
      await fetchPortfolioSummary();
      onHoldingsChanged?.();
    }
  };

  // Handle quantity editor cancel
  const handleCancelEdit = () => {
    setEditingStock(null);
  };

  // Initial load - run only once on mount
  useEffect(() => {
    const loadData = async () => {
      await fetchWatchlist();
      await fetchWatchlistWithHoldings();
      await fetchPortfolioSummary();
      await fetchDataStatus();
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty array = run only on mount

  // Auto-refresh view every 60 seconds (reloads stored data; no Eulerpool requests)
  useEffect(() => {
    if (!autoRefreshEnabled || watchlist.length === 0) return;

    const interval = setInterval(async () => {
      await fetchWatchlistWithHoldings();
      await fetchPortfolioSummary();
      await fetchDataStatus();
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, [autoRefreshEnabled, watchlist, fetchWatchlistWithHoldings, fetchPortfolioSummary, fetchDataStatus]);

  const quotaText = dataStatus?.quota
    ? `${dataStatus.quota.remaining.toLocaleString()}${dataStatus.quota.limit ? ` of ${dataStatus.quota.limit.toLocaleString()}` : ''}`
    : 'not known yet';

  return (
    <div className="stock-watchlist-section">
      <div className="section-header">
        <h2>📈 Stock Watchlist & Portfolio</h2>
        <label className="auto-refresh-toggle">
          <input
            type="checkbox"
            checked={autoRefreshEnabled}
            onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
          />
          <span>Auto-refresh (60s)</span>
        </label>
      </div>
      
      {watchlist.length > 0 && (
        <div className="watchlist-stats">
          <div className="stat-item">
            <strong>{watchlist.length}</strong> {watchlist.length === 1 ? 'stock' : 'stocks'} in watchlist
          </div>
          <div className="stat-item">
            📈 Prices: <strong>daily close</strong>, refreshed every {dataStatus?.refreshIntervalHours ?? 6} h
          </div>
          <div className="stat-item">
            🔑 Eulerpool requests left this month: <strong>{quotaText}</strong>
          </div>
        </div>
      )}
      
      <PortfolioSummary summary={portfolioSummary} loading={portfolioLoading} />
      
      <StockForm onAddStock={handleAddStock} isAdding={isAdding} />
      
      {editingStock && (
        <div className="modal-overlay" onClick={handleCancelEdit}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <QuantityEditor
              ticker={editingStock.ticker}
              currentQuantity={editingStock.quantity}
              onUpdate={handleQuantityUpdated}
              onCancel={handleCancelEdit}
            />
          </div>
        </div>
      )}
      
      <StockList
        stocks={stocks}
        onDeleteStock={handleDeleteStock}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        onEditQuantity={handleEditQuantity}
      />

      {portfolioSummary && portfolioSummary.stocksOwned > 0 && (
        <>
          <StockPortfolioPieChart 
            holdings={portfolioSummary.holdings}
            totalValue={portfolioSummary.totalValue}
          />
          
          <DividendIncomeChart 
            holdings={portfolioSummary.holdings}
            totalValue={portfolioSummary.totalValue}
            yearsToProject={20}
          />
        </>
      )}
      
      <p className="data-attribution">
        Data by <a href="https://eulerpool.com" target="_blank" rel="noopener noreferrer">Eulerpool</a> · daily closing prices
      </p>

      <style>{`
        .data-attribution {
          margin: 16px 0 0 0;
          font-size: 12px;
          color: #9ca3af;
          text-align: right;
        }

        .data-attribution a {
          color: inherit;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: white;
          padding: 20px;
          border-radius: 8px;
          max-width: 500px;
          width: 90%;
          max-height: 90vh;
          overflow: auto;
        }
      `}</style>
    </div>
  );
};

export default StockWatchlist;

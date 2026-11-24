import React, { useState, useMemo } from 'react';
import StockRow from './StockRow';
import { StockData } from '../types';

interface StockWithState extends StockData {
  loading: boolean;
  error: string | null;
}

interface StockListProps {
  stocks: StockWithState[];
  onDeleteStock: (ticker: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onEditQuantity?: (ticker: string, currentQuantity: number) => void;
}

type SortColumn = 'ticker' | 'price' | 'change' | 'dividend' | 'quantity' | 'value' | 'timestamp' | null;
type SortDirection = 'asc' | 'desc' | null;
type ViewMode = 'all' | 'portfolio' | 'watchlist';

const StockList: React.FC<StockListProps> = ({ stocks, onDeleteStock, onRefresh, isRefreshing, onEditQuantity }) => {
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('all');

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const filteredStocks = useMemo(() => {
    if (viewMode === 'all') return stocks;
    if (viewMode === 'portfolio') return stocks.filter(s => (s.quantity || 0) > 0);
    if (viewMode === 'watchlist') return stocks.filter(s => (s.quantity || 0) === 0);
    return stocks;
  }, [stocks, viewMode]);

  const sortedStocks = useMemo(() => {
    if (!sortColumn || !sortDirection) {
      return filteredStocks;
    }

    const sorted = [...filteredStocks].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortColumn) {
        case 'ticker':
          aValue = a.ticker.toLowerCase();
          bValue = b.ticker.toLowerCase();
          break;
        case 'price':
          aValue = a.price;
          bValue = b.price;
          break;
        case 'change':
          aValue = a.changePercent;
          bValue = b.changePercent;
          break;
        case 'dividend':
          aValue = a.dividendYield || 0;
          bValue = b.dividendYield || 0;
          break;
        case 'quantity':
          aValue = a.quantity || 0;
          bValue = b.quantity || 0;
          break;
        case 'value':
          aValue = (a.quantity || 0) * a.price;
          bValue = (b.quantity || 0) * b.price;
          break;
        case 'timestamp':
          aValue = new Date(a.timestamp).getTime();
          bValue = new Date(b.timestamp).getTime();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredStocks, sortColumn, sortDirection]);

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return '⇅';
    }
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  if (stocks.length === 0) {
    return (
      <div className="empty-state">
        <p>📊 Your watchlist is empty</p>
        <p className="empty-state-hint">Add some stock tickers above to start tracking!</p>
      </div>
    );
  }

  // Newest close date among all stocks: a stock with an older close is
  // marked as possibly out of date (the data provider hasn't updated it yet)
  const latestCloseDate = stocks.reduce((latest, s) => (s.timestamp && s.timestamp > latest ? s.timestamp : latest), '');

  const portfolioCount = stocks.filter(s => (s.quantity || 0) > 0).length;
  const watchlistCount = stocks.filter(s => (s.quantity || 0) === 0).length;

  return (
    <div className="stock-list-container">
      <div className="stock-list-header">
        <h3>Your Stocks ({sortedStocks.length})</h3>
        <div className="view-mode-toggle">
          <button 
            className={viewMode === 'all' ? 'active' : ''}
            onClick={() => setViewMode('all')}
          >
            All ({stocks.length})
          </button>
          <button 
            className={viewMode === 'portfolio' ? 'active' : ''}
            onClick={() => setViewMode('portfolio')}
          >
            Portfolio ({portfolioCount})
          </button>
          <button 
            className={viewMode === 'watchlist' ? 'active' : ''}
            onClick={() => setViewMode('watchlist')}
          >
            Watchlist ({watchlistCount})
          </button>
        </div>
        <button 
          onClick={onRefresh} 
          disabled={isRefreshing}
          className="btn-refresh"
        >
          {isRefreshing ? '🔄 Refreshing...' : '🔄 Refresh'}
        </button>
      </div>
      <div className="stock-table-container">
        <table className="stock-table">
          <thead>
            <tr>
              <th 
                className={`sortable ${sortColumn === 'ticker' ? 'sorted' : ''}`}
                onClick={() => handleSort('ticker')}
              >
                <div className="stock-table-header-content">
                  <span>Ticker / Company</span>
                  <span className="stock-table-sort-icon">{getSortIcon('ticker')}</span>
                </div>
              </th>
              <th 
                className={`sortable ${sortColumn === 'price' ? 'sorted' : ''}`}
                onClick={() => handleSort('price')}
              >
                <div className="stock-table-header-content">
                  <span>Price</span>
                  <span className="stock-table-sort-icon">{getSortIcon('price')}</span>
                </div>
              </th>
              <th 
                className={`sortable ${sortColumn === 'change' ? 'sorted' : ''}`}
                onClick={() => handleSort('change')}
              >
                <div className="stock-table-header-content">
                  <span>Change</span>
                  <span className="stock-table-sort-icon">{getSortIcon('change')}</span>
                </div>
              </th>
              <th 
                className={`sortable ${sortColumn === 'dividend' ? 'sorted' : ''}`}
                onClick={() => handleSort('dividend')}
              >
                <div className="stock-table-header-content">
                  <span>Dividend</span>
                  <span className="stock-table-sort-icon">{getSortIcon('dividend')}</span>
                </div>
              </th>
              <th 
                className={`sortable ${sortColumn === 'quantity' ? 'sorted' : ''}`}
                onClick={() => handleSort('quantity')}
              >
                <div className="stock-table-header-content">
                  <span>Quantity</span>
                  <span className="stock-table-sort-icon">{getSortIcon('quantity')}</span>
                </div>
              </th>
              <th 
                className={`sortable ${sortColumn === 'value' ? 'sorted' : ''}`}
                onClick={() => handleSort('value')}
              >
                <div className="stock-table-header-content">
                  <span>Value</span>
                  <span className="stock-table-sort-icon">{getSortIcon('value')}</span>
                </div>
              </th>
              <th 
                className={`sortable ${sortColumn === 'timestamp' ? 'sorted' : ''}`}
                onClick={() => handleSort('timestamp')}
              >
                <div className="stock-table-header-content">
                  <span>Last Updated</span>
                  <span className="stock-table-sort-icon">{getSortIcon('timestamp')}</span>
                </div>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedStocks.map((stock) => (
              <StockRow
                key={stock.ticker}
                stock={stock}
                loading={stock.loading}
                error={stock.error}
                onDelete={onDeleteStock}
                onEditQuantity={onEditQuantity}
                latestCloseDate={latestCloseDate}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StockList;

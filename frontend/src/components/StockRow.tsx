import React from 'react';
import { StockData } from '../types';

interface StockRowProps {
  stock: StockData;
  loading: boolean;
  error: string | null;
  onDelete: (ticker: string) => void;
  onEditQuantity?: (ticker: string, currentQuantity: number) => void;
  // Newest close date among all stocks ('YYYY-MM-DD'), to flag stale prices
  latestCloseDate?: string;
}

const StockRow: React.FC<StockRowProps> = ({ stock, loading, error, onDelete, onEditQuantity, latestCloseDate }) => {
  const formatPrice = (price: number): string => {
    return `$${price.toFixed(2)}`;
  };

  const formatValue = (quantity: number, price: number): string => {
    const value = quantity * price;
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatChange = (change: number): string => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}`;
  };

  const formatChangePercent = (changePercent: number): string => {
    const sign = changePercent >= 0 ? '+' : '';
    return `${sign}${changePercent.toFixed(2)}%`;
  };

  const formatDividendYield = (yield_value?: number): string => {
    if (!yield_value || yield_value === 0) return 'N/A';
    // dividendYield is already stored as percentage (e.g., 7.42 for 7.42%)
    // Backend calculates it from the last 12 months of dividends (stockRefresh.js)
    return `${yield_value.toFixed(2)}%`;
  };

  const formatTimestamp = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      
      return date.toLocaleDateString();
    } catch {
      return timestamp;
    }
  };

  // The price is the official close for this trading day ('YYYY-MM-DD')
  const formatCloseDate = (date: string): string => {
    const parsed = new Date(`${date.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return '';
    return `Close ${parsed.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`;
  };

    const getChangeColor = (change: number): string => {
    if (change > 0) return 'stock-row-positive';
    if (change < 0) return 'stock-row-negative';
    return 'stock-row-neutral';
  };

  if (loading) {
    return (
      <tr className="stock-row-loading">
        <td className="stock-row-ticker-cell">
          <span className="stock-row-ticker">{stock.ticker}</span>
        </td>
        <td colSpan={6} className="stock-row-loading-cell">Loading...</td>
        <td className="stock-row-actions">
          <button 
            className="stock-row-delete-btn"
            onClick={() => onDelete(stock.ticker)}
            title="Remove from watchlist"
          >
            ×
          </button>
        </td>
      </tr>
    );
  }

  if (error) {
    return (
      <tr className="stock-row-error">
        <td className="stock-row-ticker-cell">
          <span className="stock-row-ticker">{stock.ticker}</span>
        </td>
        <td colSpan={6} className="stock-row-error-cell">{error}</td>
        <td className="stock-row-actions">
          <button 
            className="stock-row-delete-btn"
            onClick={() => onDelete(stock.ticker)}
            title="Remove from watchlist"
          >
            ×
          </button>
        </td>
      </tr>
    );
  }

  const quantity = stock.quantity || 0;
  const isCloseOutdated = Boolean(stock.timestamp && latestCloseDate && stock.timestamp < latestCloseDate);

  return (
    <tr>
      <td className="stock-row-ticker-cell">
        <span className="stock-row-ticker">{stock.ticker}</span>
        {stock.companyName && <span className="stock-row-company">{stock.companyName}</span>}
      </td>
      <td>
        <span className="stock-row-price">{formatPrice(stock.price)}</span>
        {stock.timestamp && (
          isCloseOutdated ? (
            <span
              className="stock-row-close-date stock-row-close-date-stale"
              title="Eulerpool hasn't published a newer close for this stock yet. It updates automatically when it does."
            >
              {formatCloseDate(stock.timestamp)} ⚠️
            </span>
          ) : (
            <span className="stock-row-close-date">{formatCloseDate(stock.timestamp)}</span>
          )
        )}
      </td>
      <td>
        <span className={`stock-row-change ${getChangeColor(stock.change)}`}>
          {formatChange(stock.change)} ({formatChangePercent(stock.changePercent)})
        </span>
      </td>
      <td>
        <span className="stock-row-dividend">{formatDividendYield(stock.dividendYield)}</span>
      </td>
      <td className="stock-row-quantity">
        <span>{quantity}</span>
      </td>
      <td className="stock-row-value">
        <span className={quantity > 0 ? 'has-value' : ''}>
          {formatValue(quantity, stock.price)}
        </span>
      </td>
      <td>
        <div className="stock-row-timestamps">
          <div className="timestamp-item">
            📈 {stock.lastRefreshedAt ? formatTimestamp(stock.lastRefreshedAt) : 'Never'}
          </div>
          <div className="timestamp-item timestamp-overview">
            📋 {stock.overviewRefreshedAt ? formatTimestamp(stock.overviewRefreshedAt) : 'Never'}
          </div>
        </div>
      </td>
      <td className="stock-row-actions">
        {onEditQuantity && (
          <button 
            className="stock-row-edit-btn"
            onClick={() => onEditQuantity(stock.ticker, quantity)}
            title="Edit quantity"
          >
            ✏️
          </button>
        )}
        <button 
          className="stock-row-delete-btn"
          onClick={() => onDelete(stock.ticker)}
          title="Remove from watchlist"
        >
          ×
        </button>
      </td>
    </tr>
  );
};

export default StockRow;

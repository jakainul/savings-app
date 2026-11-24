import React from 'react';
import { PortfolioSummary as PortfolioSummaryType } from '../types';

interface PortfolioSummaryProps {
  summary: PortfolioSummaryType | null;
  loading: boolean;
}

const PortfolioSummary: React.FC<PortfolioSummaryProps> = ({ summary, loading }) => {
  if (loading) {
    return <div className="portfolio-summary loading">Loading portfolio...</div>;
  }

  if (!summary || summary.stocksOwned === 0) {
    return (
      <div className="portfolio-summary empty">
        <p>💼 No stocks in portfolio yet</p>
        <small>Add quantities to stocks in your watchlist to build your portfolio</small>
      </div>
    );
  }

  const isPositive = summary.totalChange >= 0;
  const changeSymbol = isPositive ? '▲' : '▼';
  const changeClass = isPositive ? 'positive' : 'negative';

  return (
    <div className="portfolio-summary">
      <h2>💼 Portfolio Summary</h2>
      
      <div className="summary-card">
        <div className="total-value">
          <label>Total Value</label>
          <div className="value">${summary.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        
        <div className={`daily-change ${changeClass}`}>
          <label>Today</label>
          <div className="change">
            {changeSymbol} ${Math.abs(summary.totalChange).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {' '}
            ({summary.totalChangePercent >= 0 ? '+' : ''}{summary.totalChangePercent.toFixed(2)}%)
          </div>
        </div>
        
        <div className="stock-counts">
          <span>{summary.stocksOwned} owned</span>
          <span className="separator">|</span>
          <span>{summary.stocksWatched} watched</span>
          <span className="separator">|</span>
          <span>{summary.totalStocks} total</span>
        </div>
      </div>

      <style>{`
        .portfolio-summary {
          margin-bottom: 30px;
        }

        .portfolio-summary h2 {
          margin: 0 0 15px 0;
          font-size: 1.5rem;
          color: #333;
        }

        .portfolio-summary.loading,
        .portfolio-summary.error,
        .portfolio-summary.empty {
          padding: 20px;
          text-align: center;
          background: #f5f5f5;
          border-radius: 8px;
          color: #666;
        }

        .portfolio-summary.error {
          background: #ffebee;
          color: #d32f2f;
        }

        .portfolio-summary.empty small {
          display: block;
          margin-top: 10px;
          font-size: 0.875rem;
          color: #999;
        }

        .summary-card {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 25px;
          border-radius: 12px;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        }

        .total-value {
          margin-bottom: 15px;
        }

        .total-value label {
          display: block;
          font-size: 0.875rem;
          opacity: 0.9;
          margin-bottom: 5px;
        }

        .total-value .value {
          font-size: 2.5rem;
          font-weight: bold;
          line-height: 1;
        }

        .daily-change {
          margin-bottom: 20px;
        }

        .daily-change label {
          display: block;
          font-size: 0.875rem;
          opacity: 0.9;
          margin-bottom: 5px;
        }

        .daily-change .change {
          font-size: 1.25rem;
          font-weight: 600;
        }

        .daily-change.positive .change {
          color: #4caf50;
        }

        .daily-change.negative .change {
          color: #ff5252;
        }

        .stock-counts {
          display: flex;
          gap: 10px;
          align-items: center;
          font-size: 0.9375rem;
          opacity: 0.95;
        }

        .stock-counts .separator {
          opacity: 0.5;
        }

        @media (max-width: 600px) {
          .total-value .value {
            font-size: 2rem;
          }

          .stock-counts {
            flex-direction: column;
            gap: 5px;
          }

          .stock-counts .separator {
            display: none;
          }
        }
      `}</style>
    </div>
  );
};

export default PortfolioSummary;
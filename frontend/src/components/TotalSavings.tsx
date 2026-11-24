import React, { useMemo } from 'react';
import { Savings } from '../types';

interface TotalSavingsProps {
  savings: Savings[];
}

const TotalSavings: React.FC<TotalSavingsProps> = ({ savings }) => {
  const total = useMemo(
    () => savings.reduce((sum, entry) => sum + entry.amount, 0),
    [savings]
  );

  // Per-category totals; Stocks are the amounts invested via the portfolio
  const byCategory = useMemo(() => {
    const totals = { ETFs: 0, Stocks: 0, 'Savings Account': 0 } as Record<Savings['category'], number>;
    savings.forEach((entry) => {
      totals[entry.category] += entry.amount;
    });
    return totals;
  }, [savings]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="card total-summary-card">
      <div className="totals-grid">
        <div className="total-card total-savings">
          <div className="total-amount">{formatCurrency(total)}</div>
          <div className="total-label">Total Savings</div>
          <div className="total-breakdown">
            ETFs {formatCurrency(byCategory.ETFs)} · Stocks {formatCurrency(byCategory.Stocks)} · Savings account {formatCurrency(byCategory['Savings Account'])}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TotalSavings;

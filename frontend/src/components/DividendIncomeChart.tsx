import React, { useMemo, useCallback } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { StockPortfolioItem, DividendChartData, DividendProjection, DividendStockContribution } from '../types';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface DividendIncomeChartProps {
  holdings: StockPortfolioItem[];
  totalValue: number;
  yearsToProject?: number;
}

/**
 * DividendIncomeChart Component
 * 
 * Displays a 20-year projection of dividend income from stock holdings.
 * Uses current dividend yields and holdings to calculate future income.
 */
const DividendIncomeChart: React.FC<DividendIncomeChartProps> = ({ 
  holdings, 
  totalValue, 
  yearsToProject = 20 
}) => {
  
  /**
   * Calculate dividend projections WITH reinvestment
   * Each year's dividends are used to buy more shares proportionally
   */
  const calculateReinvestedDividends = useCallback((
    dividendHoldings: StockPortfolioItem[],
    years: number,
    currentYear: number
  ): DividendProjection[] => {
    // Track cumulative quantities for each stock
    const cumulativeQuantities: { [ticker: string]: number } = {};
    dividendHoldings.forEach(holding => {
      cumulativeQuantities[holding.ticker] = holding.quantity;
    });
    
    const reinvestedProjections: DividendProjection[] = [];
    
    for (let i = 0; i < years; i++) {
      const year = currentYear + i + 1;
      
      // Calculate dividends for this year based on current cumulative quantities
      // Note: dividendYield is stored as percentage (e.g., 7.42 for 7.42%)
      // As shares accumulate from reinvestment, dividend income grows
      const stockBreakdown: DividendStockContribution[] = dividendHoldings.map(holding => {
        const quantity = cumulativeQuantities[holding.ticker];
        const annualDividend = quantity * holding.currentPrice * (holding.dividendYield! / 100);
        return {
          ticker: holding.ticker,
          annualDividend,
          quantity,
          currentPrice: holding.currentPrice,
          dividendYield: holding.dividendYield!,
          companyName: holding.companyName
        };
      });
      
      const totalDividend = stockBreakdown.reduce((sum, s) => sum + s.annualDividend, 0);
      
      reinvestedProjections.push({
        year,
        totalDividend,
        stockBreakdown
      });
      
      // Reinvest dividends proportionally based on each stock's contribution
      // Each stock's dividends are reinvested back into that same stock
      stockBreakdown.forEach(stock => {
        // Calculate this stock's share of total dividends
        const proportionalDividend = stock.annualDividend;
        
        // Use proportional allocation: reinvest back into the same stock that generated the dividend
        const additionalShares = proportionalDividend / stock.currentPrice;
        cumulativeQuantities[stock.ticker] += additionalShares;
      });
    }
    
    return reinvestedProjections;
  }, []);

  /**
   * Calculate dividend projections for specified years
   * 
   * Formula: Annual Dividend = Quantity × Price × (Yield / 100)
   */
  const calculateDividendProjections = useCallback((
    holdings: StockPortfolioItem[],
    years: number
  ): DividendChartData => {
    const currentYear = new Date().getFullYear();
    
    // Filter holdings with valid dividend yields
    const dividendHoldings = holdings.filter(
      h => h.quantity > 0 && h.dividendYield && h.dividendYield > 0
    );
    
    // Calculate annual dividend per stock
    // Note: dividendYield is stored as percentage (e.g., 7.42 for 7.42%)
    // Formula: shares × price × (yield% / 100)
    // Example: 74 shares × $49.77 × (7.42% / 100) = $273.22
    const stockContributions: DividendStockContribution[] = dividendHoldings.map(holding => {
      const annualDividend = holding.quantity * holding.currentPrice * (holding.dividendYield! / 100);
      return {
        ticker: holding.ticker,
        annualDividend: annualDividend,
        quantity: holding.quantity,
        currentPrice: holding.currentPrice,
        dividendYield: holding.dividendYield!,
        companyName: holding.companyName
      };
    });
    
    // Calculate total annual dividend
    const currentAnnualDividend = stockContributions.reduce(
      (sum, contrib) => sum + contrib.annualDividend, 
      0
    );
    
    // Generate projections for each year (flat projection - uses current yield)
    const projections: DividendProjection[] = Array.from({ length: years }, (_, i) => ({
      year: currentYear + i + 1,
      totalDividend: currentAnnualDividend,
      stockBreakdown: stockContributions
    }));
    
    // Calculate 20-year total
    const totalProjectedIncome = currentAnnualDividend * years;
    
    // Calculate projections WITH dividend reinvestment
    const reinvestedProjections = calculateReinvestedDividends(dividendHoldings, years, currentYear);
    
    // Calculate total projected income with reinvestment
    const totalProjectedIncomeWithReinvestment = reinvestedProjections.reduce(
      (sum, proj) => sum + proj.totalDividend,
      0
    );
    
    return {
      projections,
      reinvestedProjections,
      currentAnnualDividend,
      totalProjectedIncome,
      totalProjectedIncomeWithReinvestment,
      dividendStocksCount: dividendHoldings.length,
      yearsProjected: years
    };
  }, [calculateReinvestedDividends]);

  // Calculate dividend data
  const data = useMemo(() => 
    calculateDividendProjections(holdings, yearsToProject), 
    [holdings, yearsToProject, calculateDividendProjections]
  );

  // Prepare chart data
  const chartData = useMemo(() => {
    const labels = data.projections.map(p => p.year.toString());
    const dividendData = data.projections.map(p => p.totalDividend);
    const reinvestedDividendData = data.reinvestedProjections.map(p => p.totalDividend);
    
    return {
      labels,
      datasets: [
        {
          label: 'Without Reinvestment',
          data: dividendData,
          borderColor: '#667eea',
          backgroundColor: 'rgba(102, 126, 234, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4, // Smooth curves
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#667eea',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: '#667eea',
          pointHoverBorderWidth: 2,
        },
        {
          label: 'With Dividend Reinvestment',
          data: reinvestedDividendData,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4, // Smooth curves
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#10b981',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: '#10b981',
          pointHoverBorderWidth: 2,
        },
      ],
    };
  }, [data]);

  // Chart options
  const options: ChartOptions<'line'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 2.5,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 15,
          font: {
            size: 13,
            weight: 500,
          },
        },
      },
      title: {
        display: false, // Using custom HTML title
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 16,
        titleFont: {
          size: 14,
          weight: 'bold',
        },
        bodyFont: {
          size: 13,
        },
        callbacks: {
          title: (context) => {
            return `Year ${context[0].label}`;
          },
          label: (context) => {
            const value = context.parsed.y;
            if (value === null) return '';
            const datasetLabel = context.dataset.label;
            return `${datasetLabel}: $${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          },
          afterLabel: (context) => {
            // Show growth percentage for reinvestment line
            if (context.datasetIndex === 1) {
              const withoutReinvestment = data.projections[context.dataIndex].totalDividend;
              const withReinvestment = data.reinvestedProjections[context.dataIndex].totalDividend;
              const growthPercent = ((withReinvestment - withoutReinvestment) / withoutReinvestment * 100).toFixed(1);
              return `Growth from reinvestment: +${growthPercent}%`;
            }
            return '';
          },
          footer: (context) => {
            // Show breakdown for the first item in tooltip
            if (context.length > 0) {
              const dataIndex = context[0].dataIndex;
              const projection = context[0].datasetIndex === 0 
                ? data.projections[dataIndex]
                : data.reinvestedProjections[dataIndex];
              
              const lines = ['', 'Stock Breakdown:'];
              projection.stockBreakdown.forEach(stock => {
                lines.push(
                  `${stock.ticker}: $${stock.annualDividend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${stock.quantity.toFixed(2)} shares)`
                );
              });
              
              return lines.join('\n');
            }
            return '';
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: true,
          color: 'rgba(0, 0, 0, 0.05)',
        },
        ticks: {
          maxRotation: 45,
          minRotation: 0,
          autoSkip: true,
          maxTicksLimit: 10, // Show ~10 year labels
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          display: true,
          color: 'rgba(0, 0, 0, 0.05)',
        },
        ticks: {
          callback: (value) => {
            return '$' + Number(value).toLocaleString('en-US');
          },
        },
      },
    },
    animation: {
      duration: 1000,
      easing: 'easeInOutQuart',
    },
  }), [data]);

  // Don't render if no dividend stocks
  if (data.dividendStocksCount === 0) {
    return (
      <div className="dividend-income-chart-container">
        <h3 className="dividend-income-chart-title">📈 Projected Dividend Income (Next 20 Years)</h3>
        
        <div className="dividend-empty-state">
          <div className="dividend-empty-state-icon">💰</div>
          <div className="dividend-empty-state-title">No Dividend Income Yet</div>
          <div className="dividend-empty-state-message">
            Add dividend-paying stocks to your portfolio to see income projections
          </div>
        </div>

        <style>{`
          .dividend-income-chart-container {
            background: white;
            border-radius: 12px;
            padding: 24px;
            margin-top: 24px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            border: 1px solid #e1e5e9;
          }

          .dividend-income-chart-title {
            font-size: 20px;
            color: #374151;
            margin: 0 0 20px 0;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .dividend-empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #6b7280;
          }

          .dividend-empty-state-icon {
            font-size: 48px;
            margin-bottom: 16px;
          }

          .dividend-empty-state-title {
            font-size: 20px;
            font-weight: 600;
            color: #374151;
            margin-bottom: 8px;
          }

          .dividend-empty-state-message {
            font-size: 16px;
            color: #6b7280;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="dividend-income-chart-container">
      <h3 className="dividend-income-chart-title">📈 Projected Dividend Income (Next 20 Years)</h3>
      
      <div className="dividend-income-chart-wrapper">
        <Line data={chartData} options={options} />
      </div>

      <div className="dividend-income-summary">
        <div className="dividend-summary-item">
          <div className="dividend-summary-label">Dividend Stocks</div>
          <div className="dividend-summary-value">{data.dividendStocksCount}</div>
        </div>
        <div className="dividend-summary-item">
          <div className="dividend-summary-label">Current Annual</div>
          <div className="dividend-summary-value small">
            ${data.currentAnnualDividend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="dividend-summary-item">
          <div className="dividend-summary-label">20-Year Total (No Reinvestment)</div>
          <div className="dividend-summary-value small">
            ${data.totalProjectedIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="dividend-summary-item highlight">
          <div className="dividend-summary-label">20-Year Total (With Reinvestment)</div>
          <div className="dividend-summary-value small">
            ${data.totalProjectedIncomeWithReinvestment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="dividend-summary-growth">
            +{(((data.totalProjectedIncomeWithReinvestment - data.totalProjectedIncome) / data.totalProjectedIncome) * 100).toFixed(1)}% growth
          </div>
        </div>
      </div>

      <style>{`
        .dividend-income-chart-container {
          background: white;
          border-radius: 12px;
          padding: 24px;
          margin-top: 24px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
          border: 1px solid #e1e5e9;
        }

        .dividend-income-chart-title {
          font-size: 20px;
          color: #374151;
          margin: 0 0 20px 0;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .dividend-income-chart-wrapper {
          width: 100%;
          height: 350px;
          margin-bottom: 24px;
        }

        .dividend-income-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 8px;
          color: white;
        }

        .dividend-summary-item {
          text-align: center;
        }

        .dividend-summary-label {
          font-size: 14px;
          opacity: 0.9;
          margin-bottom: 8px;
        }

        .dividend-summary-value {
          font-size: 24px;
          font-weight: bold;
          line-height: 1.2;
        }

        .dividend-summary-value.small {
          font-size: 20px;
        }

        .dividend-summary-item.highlight {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 8px;
          padding: 4px;
        }

        .dividend-summary-growth {
          font-size: 12px;
          opacity: 0.95;
          margin-top: 4px;
          font-weight: 600;
        }

        .dividend-empty-state {
          text-align: center;
          padding: 60px 20px;
          color: #6b7280;
        }

        .dividend-empty-state-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .dividend-empty-state-title {
          font-size: 20px;
          font-weight: 600;
          color: #374151;
          margin-bottom: 8px;
        }

        .dividend-empty-state-message {
          font-size: 16px;
          color: #6b7280;
        }

        /* Responsive Design */
        @media (max-width: 768px) {
          .dividend-income-chart-wrapper {
            height: 250px;
          }

          .dividend-income-summary {
            grid-template-columns: 1fr;
            gap: 12px;
          }

          .dividend-summary-value {
            font-size: 20px;
          }

          .dividend-summary-value.small {
            font-size: 18px;
          }
        }
      `}</style>
    </div>
  );
};

export default DividendIncomeChart;

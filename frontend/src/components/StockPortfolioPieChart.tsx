import React, { useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, ChartOptions } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { StockPortfolioItem } from '../types';

ChartJS.register(ArcElement, Tooltip, Legend);

interface StockPortfolioPieChartProps {
  holdings: StockPortfolioItem[];
  totalValue: number;
}

// Color palette for stocks - 20 distinct colors
const STOCK_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Violet
  '#EC4899', // Pink
  '#14B8A6', // Teal
  '#F97316', // Orange
  '#6366F1', // Indigo
  '#84CC16', // Lime
  '#06B6D4', // Cyan
  '#A855F7', // Purple
  '#EAB308', // Yellow
  '#F43F5E', // Rose
  '#22C55E', // Emerald
  '#0EA5E9', // Sky
  '#D946EF', // Fuchsia
  '#65A30D', // Green-600
  '#DC2626', // Red-600
  '#7C3AED', // Violet-600
];

const StockPortfolioPieChart: React.FC<StockPortfolioPieChartProps> = ({ holdings, totalValue }) => {
  // Filter only holdings with quantity > 0 and sort by value
  const portfolioHoldings = useMemo(() => {
    return holdings
      .filter(h => h.quantity > 0)
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [holdings]);

  // Calculate chart data
  const chartData = useMemo(() => {
    const labels = portfolioHoldings.map(h => h.ticker);
    const data = portfolioHoldings.map(h => h.totalValue);
    const backgroundColor = portfolioHoldings.map((_, index) => STOCK_COLORS[index % STOCK_COLORS.length]);
    
    return {
      labels,
      datasets: [
        {
          data,
          backgroundColor,
          borderColor: '#ffffff',
          borderWidth: 2,
          hoverOffset: 15,
        },
      ],
    };
  }, [portfolioHoldings]);

  // Chart options
  const options: ChartOptions<'doughnut'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        display: false, // We'll create a custom legend
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleFont: {
          size: 14,
          weight: 'bold',
        },
        bodyFont: {
          size: 13,
        },
        callbacks: {
          label: (context) => {
            const holding = portfolioHoldings[context.dataIndex];
            const value = context.parsed;
            const percentage = ((value / totalValue) * 100).toFixed(2);
            const lines = [
              `${holding.companyName || holding.ticker}`,
              `Shares: ${holding.quantity.toLocaleString()}`,
              `Price: $${holding.currentPrice.toFixed(2)}`,
              `Value: $${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              `Portfolio: ${percentage}%`,
            ];
            return lines;
          },
        },
      },
    },
    cutout: '60%', // Doughnut hole size
    animation: {
      animateRotate: true,
      animateScale: true,
    },
  }), [portfolioHoldings, totalValue]);

  // Don't render if no holdings
  if (portfolioHoldings.length === 0) {
    return null;
  }

  return (
    <div className="portfolio-pie-chart-container">
      <h3 className="portfolio-pie-chart-title">💼 Portfolio Allocation</h3>
      
      <div className="portfolio-pie-chart-content">
        <div className="portfolio-pie-chart-wrapper">
          <div className="chart-canvas-container">
            <Doughnut data={chartData} options={options} />
            <div className="chart-center-text">
              <div className="chart-center-label">Total Value</div>
              <div className="chart-center-value">
                ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>
        
        <div className="portfolio-pie-chart-legend">
          {portfolioHoldings.map((holding, index) => {
            const percentage = ((holding.totalValue / totalValue) * 100).toFixed(2);
            const color = STOCK_COLORS[index % STOCK_COLORS.length];
            
            return (
              <div key={holding.ticker} className="legend-item">
                <div className="legend-item-header">
                  <div className="legend-color-box" style={{ backgroundColor: color }}></div>
                  <span className="legend-ticker">{holding.ticker}</span>
                </div>
                <div className="legend-item-details">
                  <span className="legend-percentage">{percentage}%</span>
                  <span className="legend-value">
                    ${holding.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        .portfolio-pie-chart-container {
          background: white;
          border-radius: 12px;
          padding: 24px;
          margin-top: 24px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
          border: 1px solid #e1e5e9;
        }

        .portfolio-pie-chart-title {
          font-size: 20px;
          color: #374151;
          margin: 0 0 20px 0;
          font-weight: 600;
        }

        .portfolio-pie-chart-content {
          display: flex;
          gap: 32px;
          align-items: center;
        }

        .portfolio-pie-chart-wrapper {
          flex: 1;
          max-width: 400px;
          margin: 0 auto;
        }

        .chart-canvas-container {
          position: relative;
          width: 100%;
          max-width: 400px;
          margin: 0 auto;
        }

        .chart-center-text {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
          pointer-events: none;
        }

        .chart-center-label {
          font-size: 14px;
          color: #6b7280;
          margin-bottom: 4px;
        }

        .chart-center-value {
          font-size: 24px;
          font-weight: bold;
          color: #1f2937;
        }

        .portfolio-pie-chart-legend {
          flex: 1;
          max-width: 400px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-height: 400px;
          overflow-y: auto;
          padding-right: 8px;
        }

        .portfolio-pie-chart-legend::-webkit-scrollbar {
          width: 6px;
        }

        .portfolio-pie-chart-legend::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 3px;
        }

        .portfolio-pie-chart-legend::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 3px;
        }

        .portfolio-pie-chart-legend::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        .legend-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          background: #f9fafb;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          transition: all 0.2s;
          cursor: pointer;
        }

        .legend-item:hover {
          background: #f3f4f6;
          border-color: #d1d5db;
          transform: translateX(4px);
        }

        .legend-item-header {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .legend-color-box {
          width: 14px;
          height: 14px;
          border-radius: 3px;
          flex-shrink: 0;
        }

        .legend-ticker {
          font-weight: 600;
          font-size: 15px;
          color: #1f2937;
        }

        .legend-item-details {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }

        .legend-percentage {
          font-size: 13px;
          color: #6b7280;
          font-weight: 500;
        }

        .legend-value {
          font-size: 14px;
          color: #059669;
          font-weight: 600;
        }

        /* Responsive design */
        @media (max-width: 768px) {
          .portfolio-pie-chart-content {
            flex-direction: column;
            gap: 24px;
          }

          .portfolio-pie-chart-wrapper {
            max-width: 300px;
            width: 100%;
          }

          .chart-canvas-container {
            max-width: 300px;
          }

          .chart-center-value {
            font-size: 20px;
          }

          .chart-center-label {
            font-size: 12px;
          }

          .portfolio-pie-chart-legend {
            max-width: 100%;
            width: 100%;
            max-height: none;
          }
        }

        /* Single stock notice */
        .single-stock-notice {
          text-align: center;
          padding: 12px;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 8px;
          color: #1e40af;
          font-size: 14px;
          margin-top: 12px;
        }
      `}</style>
    </div>
  );
};

export default StockPortfolioPieChart;
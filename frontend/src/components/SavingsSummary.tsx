import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Savings } from '../types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface SavingsSummaryProps {
  savings: Savings[];
}

interface HistoricalDataset {
  label: string;
  data: (number | null)[];
  borderColor: string;
  backgroundColor: string;
  tension: number;
  fill: boolean;
  borderWidth: number;
  pointRadius: number;
  category: string;
  finalValue: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Projection length: 20 years
const FUTURE_MONTHS = 240;

const SavingsSummary: React.FC<SavingsSummaryProps> = ({ savings }) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'ETFs':
        return 'rgb(59, 130, 246)'; // Blue
      case 'Stocks':
        return 'rgb(239, 68, 68)'; // Red
      case 'Savings Account':
        return 'rgb(5, 150, 105)'; // Green
      default:
        return 'rgb(107, 114, 128)'; // Gray
    }
  };

  const getProjectionColor = (category: string, rate: number): string => {
    const baseColors = {
      'ETFs': {
        0.05: 'rgb(30, 64, 175)',    // Dark blue
        0.07: 'rgb(59, 130, 246)',   // Medium blue  
        0.10: 'rgb(147, 197, 253)',  // Light blue
      },
      'Stocks': {
        0.05: 'rgb(153, 27, 27)',    // Dark red
        0.07: 'rgb(239, 68, 68)',    // Medium red
        0.10: 'rgb(252, 165, 165)',  // Light red
      }
    };
    
    return (baseColors as any)[category]?.[rate] || 'rgb(107, 114, 128)';
  };

  const calculateProjections = (
    startValue: number, 
    annualRate: number, 
    months: number
  ): number[] => {
    const monthlyRate = Math.pow(1 + annualRate, 1/12) - 1;
    const projection = [];
    let value = startValue;
    
    for (let i = 0; i < months; i++) {
      value *= (1 + monthlyRate);
      projection.push(Math.round(value));
    }
    return projection;
  };

  const trendData = useMemo(() => {
    if (savings.length === 0) return null;

    // Months as a single number (year * 12 + month) so the timeline is continuous
    const monthIndexOf = (year: number, monthName: string) => year * 12 + MONTH_NAMES.indexOf(monthName);
    const entryMonths = savings.map((s) => monthIndexOf(s.year, s.month));
    const now = new Date();
    const currentMonth = now.getFullYear() * 12 + now.getMonth();

    // History runs every month from the first entry up to this month
    // (or the last entry, if one is dated in the future); projections follow
    const firstMonth = Math.min(...entryMonths);
    const lastHistoricalMonth = Math.max(currentMonth, ...entryMonths);
    const historicalCount = lastHistoricalMonth - firstMonth + 1;
    const totalCount = historicalCount + FUTURE_MONTHS;

    const labels = Array.from({ length: totalCount }, (_, i) => {
      const month = firstMonth + i;
      return `${MONTH_NAMES[month % 12].substring(0, 3)} ${Math.floor(month / 12)}`;
    });

    // Get unique categories
    const categories = Array.from(new Set(savings.map(s => s.category)));

    // Cumulative totals per category for every historical month
    const historicalDatasets: HistoricalDataset[] = categories.map(category => {
      const monthlyTotals = new Array(historicalCount).fill(0);
      savings.forEach((s) => {
        if (s.category === category) {
          monthlyTotals[monthIndexOf(s.year, s.month) - firstMonth] += s.amount;
        }
      });

      let cumulativeAmount = 0;
      const data = monthlyTotals.map((amount) => (cumulativeAmount += amount));

      return {
        label: category === 'Savings Account' ? 'Savings Account' : `${category} (Historical)`,
        // Future months stay empty here; projections fill them
        data: [...data, ...new Array(FUTURE_MONTHS).fill(null)],
        borderColor: getCategoryColor(category),
        backgroundColor: getCategoryColor(category) + '20',
        tension: 0.1,
        fill: false,
        borderWidth: 3,
        pointRadius: 2,
        category: category,
        finalValue: data[data.length - 1] || 0
      };
    });

    // Projections for Stocks and ETFs only, starting after the last historical month
    // (Savings Account is shown as history only)
    const projectionDatasets: any[] = [];
    const investmentCategories = ['Stocks', 'ETFs'];
    const growthRates = [0.05, 0.07, 0.10];

    investmentCategories.forEach(category => {
      const historicalData = historicalDatasets.find(ds => ds.category === category);
      if (!historicalData || historicalData.finalValue === 0) return;

      growthRates.forEach(rate => {
        const projections = calculateProjections(historicalData.finalValue, rate, FUTURE_MONTHS);
        const projectionData = [...new Array(historicalCount).fill(null), ...projections];

        projectionDatasets.push({
          label: `${category} ${(rate * 100).toFixed(0)}% Growth`,
          data: projectionData,
          borderColor: getProjectionColor(category, rate),
          backgroundColor: getProjectionColor(category, rate) + '10',
          borderDash: [8, 4],
          tension: 0.1,
          fill: false,
          borderWidth: 2,
          pointRadius: 0,
        });
      });
    });

    // Savings Account last among the historical lines, then projections
    const savingsDataset = historicalDatasets.find(ds => ds.category === 'Savings Account');
    return {
      labels,
      datasets: [...historicalDatasets.filter(ds => ds.category !== 'Savings Account'), savingsDataset, ...projectionDatasets].filter(Boolean),
    };
  }, [savings]);

  const totalSavings = savings.reduce((sum: number, saving: Savings) => sum + saving.amount, 0);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          pointStyle: 'line',
          generateLabels: (chart: any) => {
            const datasets = chart.data.datasets;
            return datasets.map((dataset: any, i: number) => ({
              text: dataset.label,
              fillStyle: dataset.borderColor,
              strokeStyle: dataset.borderColor,
              lineWidth: dataset.borderWidth,
              lineDash: dataset.borderDash || [],
              hidden: !chart.isDatasetVisible(i),
              datasetIndex: i
            }));
          }
        }
      },
      title: {
        display: false,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          label: function(context: any) {
            const value = context.parsed.y;
            if (value === null) return '';
            return `${context.dataset.label}: ${formatCurrency(value)}`;
          },
          beforeBody: function(tooltipItems: any[]) {
            const monthIndex = tooltipItems[0].dataIndex;
            const totalMonths = tooltipItems[0].chart.data.labels.length;
            const historicalMonths = totalMonths - FUTURE_MONTHS;
            
            if (monthIndex >= historicalMonths) {
              return ['📊 Future Projection'];
            }
            return ['📈 Historical Data'];
          }
        }
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Timeline (20-Year Projection)',
          font: { size: 14, weight: 'bold' as const }
        },
        ticks: {
          maxTicksLimit: 15,
          callback: function(value: any, index: number, ticks: any[]) {
            // Show every 2 years
            if (index % 24 === 0) {
              return ticks[index] ? ticks[index].label : '';
            }
            return '';
          }
        }
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Cumulative Value (€)',
          font: { size: 14, weight: 'bold' as const }
        },
        ticks: {
          callback: function(value: any) {
            return formatCurrency(value);
          }
        }
      }
    },
    interaction: {
      intersect: false,
      mode: 'index' as const,
    },
    elements: {
      point: {
        hoverRadius: 6,
      }
    }
  };

  if (savings.length === 0) {
    return null;
  }

  return (
    <div className="card">
      <h3 style={{ color: '#059669', marginBottom: '16px' }}>💎 Savings Growth Trends by Category</h3>
      
      <div className="summary-total" style={{ 
        backgroundColor: '#f0fdf4', 
        border: '1px solid #bbf7d0', 
        borderRadius: '8px', 
        padding: '16px', 
        marginBottom: '20px',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '14px', color: '#059669', marginBottom: '4px' }}>
          Total Savings
        </div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#065f46' }}>
          {formatCurrency(totalSavings)}
        </div>
      </div>

      <div style={{
        backgroundColor: '#fef3c7',
        border: '1px solid #fcd34d',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '20px'
      }}>
        <h4 style={{ margin: '0 0 12px 0', color: '#92400e', fontSize: '16px' }}>
          📊 Future Projections (20 Years)
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <div style={{ fontSize: '14px', color: '#78350f' }}>
            <strong>Conservative (5%):</strong> Stable long-term growth
          </div>
          <div style={{ fontSize: '14px', color: '#78350f' }}>
            <strong>Moderate (7%):</strong> Historical market average
          </div>
          <div style={{ fontSize: '14px', color: '#78350f' }}>
            <strong>Aggressive (10%):</strong> High-growth potential
          </div>
        </div>
        <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#78350f', fontStyle: 'italic' }}>
          Note: Projections are estimates based on compound annual growth. Actual results may vary.
        </p>
      </div>

      {trendData && (
        <div className="chart-container">
          <Line data={trendData} options={chartOptions} />
        </div>
      )}
    </div>
  );
};

export default SavingsSummary;
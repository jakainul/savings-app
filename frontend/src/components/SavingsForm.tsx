import React, { useState } from 'react';
import { addSavingsAllocation } from '../api';

interface SavingsFormProps {
  onSavingsAdded: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}

const SavingsForm: React.FC<SavingsFormProps> = ({ onSavingsAdded, showToast }) => {
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [description, setDescription] = useState('');
  const [etfPercentage, setEtfPercentage] = useState(50);
  const [savingsPercentage, setSavingsPercentage] = useState(50);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // The two percentages always sum to 100: moving one slider moves the other.
  // Stocks are not allocated here; they come from portfolio quantity changes.
  const adjustPercentages = (changedSlider: 'etf' | 'savings', newValue: number) => {
    if (changedSlider === 'etf') {
      setEtfPercentage(newValue);
      setSavingsPercentage(100 - newValue);
    } else {
      setSavingsPercentage(newValue);
      setEtfPercentage(100 - newValue);
    }
  };

  const totalPercentage = etfPercentage + savingsPercentage;
  const isValidPercentage = Math.abs(totalPercentage - 100) < 1;

  const calculateAmounts = () => {
    const monthly = parseFloat(monthlyAmount) || 0;
    
    return {
      monthlyETF: (monthly * etfPercentage) / 100,
      monthlySavings: (monthly * savingsPercentage) / 100,
    };
  };

  const amounts = calculateAmounts();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!monthlyAmount || !selectedMonth || !year) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    if (!isValidPercentage) {
      showToast('Percentages must sum to 100%', 'error');
      return;
    }

    if (parseFloat(monthlyAmount) <= 0) {
      showToast('Monthly amount must be greater than 0', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await addSavingsAllocation({
        monthlyAmount: parseFloat(monthlyAmount),
        description,
        etfPercentage,
        savingsPercentage,
        selectedMonth,
        year: parseInt(year)
      });
      
      const savingsDesc = description ? ` for ${description}` : '';
      setMonthlyAmount('');
      setDescription('');
      setEtfPercentage(50);
      setSavingsPercentage(50);
      setSelectedMonth('');
      setYear(new Date().getFullYear().toString());
      
      showToast(
        `Successfully created ${result.entries.length} savings entries for ${selectedMonth} ${year}${savingsDesc}!`, 
        'success'
      );
      onSavingsAdded();
    } catch (error) {
      console.error('Error adding savings allocation:', error);
      showToast('Error creating savings allocation. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="card">
      <h2 style={{ marginBottom: '20px', color: '#059669' }}>Add Savings Allocation</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="monthly-amount">Monthly Amount (€)</label>
          <input
            id="monthly-amount"
            type="number"
            step="0.01"
            min="0"
            value={monthlyAmount}
            onChange={(e) => setMonthlyAmount(e.target.value)}
            placeholder="Enter monthly savings amount"
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="savings-description">Description (optional)</label>
          <input
            id="savings-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter savings description"
          />
        </div>

        <div className="form-group">
          <label htmlFor="selected-month">Month</label>
          <select
            id="selected-month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            required
          >
            <option value="">Select month</option>
            {months.map((monthName) => (
              <option key={monthName} value={monthName}>
                {monthName}
              </option>
            ))}
          </select>
        </div>
        
        <div className="form-group">
          <label htmlFor="savings-year">Year</label>
          <input
            id="savings-year"
            type="number"
            min="2020"
            max={new Date().getFullYear() + 10}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            required
          />
        </div>

        {/* Percentage Sliders */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '16px', color: '#374151' }}>Allocation Percentages</h3>
          
          <div className="slider-container">
            <div className="slider-header">
              <span className="slider-label">ETFs</span>
              <span className="slider-value">{etfPercentage}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={etfPercentage}
              onChange={(e) => adjustPercentages('etf', parseInt(e.target.value))}
              className="slider"
            />
          </div>

          <div className="slider-container">
            <div className="slider-header">
              <span className="slider-label">Savings Account</span>
              <span className="slider-value">{savingsPercentage}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={savingsPercentage}
              onChange={(e) => adjustPercentages('savings', parseInt(e.target.value))}
              className="slider"
            />
          </div>

          <div className={`percentage-total ${isValidPercentage ? 'valid' : 'invalid'}`}>
            Total: {totalPercentage}%
          </div>
          <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#6b7280' }}>
            📈 Stocks are added automatically when you change share quantities in the portfolio below.
          </p>
        </div>

        {/* Allocation Preview */}
        {monthlyAmount && parseFloat(monthlyAmount) > 0 && (
          <div className="allocation-preview">
            <div className="allocation-title">Monthly Allocation Preview</div>
            <div className="allocation-grid allocation-grid-two">
              <div className="allocation-item">
                <div className="allocation-category">ETFs</div>
                <div className="allocation-amount">€{amounts.monthlyETF.toFixed(2)}</div>
              </div>
              <div className="allocation-item">
                <div className="allocation-category">Savings</div>
                <div className="allocation-amount">€{amounts.monthlySavings.toFixed(2)}</div>
              </div>
            </div>
          </div>
        )}
        
        <button 
          type="submit" 
          className="btn btn-primary"
          disabled={isSubmitting || !isValidPercentage}
        >
          {isSubmitting ? 'Creating Allocation...' : 'Create Savings Allocation'}
        </button>
      </form>
    </div>
  );
};

export default SavingsForm;
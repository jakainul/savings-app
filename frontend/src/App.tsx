import React, { useState, useEffect, useCallback } from 'react';
import './index.css';
import SavingsForm from './components/SavingsForm';
import SavingsList from './components/SavingsList';
import SavingsSummary from './components/SavingsSummary';
import TotalSavings from './components/TotalSavings';
import StockWatchlist from './components/StockWatchlist';
import Toast from './components/Toast';
import { getSavings } from './api';
import { Savings } from './types';

function App() {
  const [savings, setSavings] = useState<Savings[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchData = async () => {
    try {
      const savingsData = await getSavings();
      setSavings(savingsData);
    } catch (error) {
      console.error('Error fetching data:', error);
      showToast('Error loading data. Please make sure the backend server is running.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDataChange = () => {
    fetchData();
  };

  if (loading) {
    return (
      <div className="container">
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <h2>Loading Savings Master...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <h1>💰 Savings Master</h1>
        <p>Track your savings and investments with ease</p>
      </div>

      <TotalSavings savings={savings} />

      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '2rem', color: '#059669', marginBottom: '8px' }}>💎 Savings & Investments</h2>
        <p style={{ fontSize: '1.1rem', color: '#6b7280' }}>Add ETF and savings account contributions here. Stocks are tracked from your portfolio.</p>
      </div>

      <div className="single-column">
        <SavingsForm onSavingsAdded={handleDataChange} showToast={showToast} />
      </div>

      <SavingsSummary savings={savings} />

      {/* Stock Watchlist Section */}
      <hr className="section-divider" />
      
      <div className="card">
        <StockWatchlist showToast={showToast} onHoldingsChanged={handleDataChange} />
      </div>

      {/* Savings Entries Section */}
      <hr className="section-divider" />

      <SavingsList savings={savings} onSavingsDeleted={handleDataChange} showToast={showToast} />
      
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
    </div>
  );
}

export default App;
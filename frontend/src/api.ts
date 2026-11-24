import axios from 'axios';
import { Savings, SavingsAllocation, AddStockResult, StockDataStatus, StockRefreshSummary, StockTicker, StockData, StockHolding, PortfolioSummary, WatchlistWithHoldings } from './types';

// Relative URL: requests go through the Vite dev server proxy (see vite.config.ts)
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Savings API calls
export const getSavings = async (): Promise<Savings[]> => {
  const response = await api.get('/savings');
  return response.data;
};

export const addSavings = async (savings: Omit<Savings, 'id' | 'created_at' | 'source'>): Promise<Savings> => {
  const response = await api.post('/savings', savings);
  return response.data;
};

export const addSavingsAllocation = async (allocation: SavingsAllocation): Promise<any> => {
  const response = await api.post('/savings/allocation', allocation);
  return response.data;
};

export const deleteSavings = async (id: number): Promise<void> => {
  await api.delete(`/savings/${id}`);
};

// Stock API calls
export const getStockWatchlist = async (): Promise<StockTicker[]> => {
  const response = await api.get('/stocks/watchlist');
  return response.data;
};

export const addStockToWatchlist = async (ticker: string): Promise<AddStockResult> => {
  const response = await api.post('/stocks/watchlist', { ticker });
  return response.data;
};

export const removeStockFromWatchlist = async (ticker: string): Promise<void> => {
  await api.delete(`/stocks/watchlist/${ticker}`);
};

export const getStoredQuotes = async (): Promise<StockData[]> => {
  const response = await api.get('/stocks/quotes');
  return response.data;
};

// Portfolio API calls
export const getStockHoldings = async (): Promise<StockHolding[]> => {
  const response = await api.get('/stocks/holdings');
  return response.data;
};

export const getStockHolding = async (ticker: string): Promise<StockHolding> => {
  const response = await api.get(`/stocks/holdings/${ticker}`);
  return response.data;
};

export const updateStockHolding = async (ticker: string, quantity: number): Promise<StockHolding> => {
  const response = await api.put(`/stocks/holdings/${ticker}`, { quantity });
  return response.data;
};

export const getPortfolioSummary = async (): Promise<PortfolioSummary> => {
  const response = await api.get('/stocks/portfolio/summary');
  return response.data;
};

export const getWatchlistWithHoldings = async (): Promise<WatchlistWithHoldings[]> => {
  const response = await api.get('/stocks/watchlist/full');
  return response.data;
};

// Stock data refresh (Eulerpool)
export const refreshAllStocks = async (): Promise<StockRefreshSummary> => {
  const response = await api.post('/stocks/refresh');
  return response.data;
};

export const getStockDataStatus = async (): Promise<StockDataStatus> => {
  const response = await api.get('/stocks/status');
  return response.data;
};

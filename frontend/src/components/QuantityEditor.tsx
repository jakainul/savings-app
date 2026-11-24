import React, { useState } from 'react';
import { updateStockHolding } from '../api';

interface QuantityEditorProps {
  ticker: string;
  currentQuantity: number;
  onUpdate: () => void;
  onCancel: () => void;
}

const QuantityEditor: React.FC<QuantityEditorProps> = ({
  ticker,
  currentQuantity,
  onUpdate,
  onCancel,
}) => {
  const [quantity, setQuantity] = useState<string>(currentQuantity.toString());
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate quantity
    const numQuantity = parseInt(quantity, 10);
    
    if (isNaN(numQuantity)) {
      setError('Please enter a valid number');
      return;
    }

    if (!Number.isInteger(numQuantity)) {
      setError('Fractional shares are not supported. Enter a whole number.');
      return;
    }

    if (numQuantity < 0) {
      setError('Quantity cannot be negative');
      return;
    }

    try {
      setIsUpdating(true);
      await updateStockHolding(ticker, numQuantity);
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update quantity');
      setIsUpdating(false);
    }
  };

  return (
    <div className="quantity-editor">
      <h3>Update {ticker} Holdings</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Current: {currentQuantity} shares</label>
        </div>
        <div className="form-group">
          <label htmlFor="quantity">New Quantity:</label>
          <input
            type="number"
            id="quantity"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            disabled={isUpdating}
            placeholder="Enter whole number"
            min="0"
            step="1"
            autoFocus
            required
          />
          <small>Whole numbers only (no decimals)</small>
        </div>
        
        {error && <div className="error-message">{error}</div>}
        
        <div className="button-group">
          <button type="button" onClick={onCancel} disabled={isUpdating}>
            Cancel
          </button>
          <button type="submit" disabled={isUpdating}>
            {isUpdating ? 'Updating...' : 'Update'}
          </button>
        </div>
      </form>

      <style>{`
        .quantity-editor {
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
          max-width: 400px;
          margin: 0 auto;
        }

        .quantity-editor h3 {
          margin: 0 0 20px 0;
          font-size: 1.25rem;
          color: #333;
        }

        .form-group {
          margin-bottom: 15px;
        }

        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: 500;
          color: #555;
        }

        .form-group input {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 1rem;
          box-sizing: border-box;
        }

        .form-group input:focus {
          outline: none;
          border-color: #4CAF50;
        }

        .form-group small {
          display: block;
          margin-top: 5px;
          color: #777;
          font-size: 0.875rem;
        }

        .error-message {
          color: #d32f2f;
          background: #ffebee;
          padding: 10px;
          border-radius: 4px;
          margin-bottom: 15px;
          font-size: 0.875rem;
        }

        .button-group {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }

        .button-group button {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          font-size: 1rem;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .button-group button[type="button"] {
          background: #f5f5f5;
          color: #333;
        }

        .button-group button[type="button"]:hover:not(:disabled) {
          background: #e0e0e0;
        }

        .button-group button[type="submit"] {
          background: #4CAF50;
          color: white;
        }

        .button-group button[type="submit"]:hover:not(:disabled) {
          background: #45a049;
        }

        .button-group button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default QuantityEditor;
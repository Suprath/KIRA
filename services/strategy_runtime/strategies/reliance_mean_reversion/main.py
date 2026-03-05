from quant_sdk import QCAlgorithm, Resolution
from datetime import time
import numpy as np

class RelianceMeanReversion(QCAlgorithm):
    """
    Intraday Mean Reversion Strategy for RELIANCE.
    
    Logic:
    - Uses 20-period SMA and Standard Deviation to identify overextended price moves.
    - Long when price < SMA - 2*StdDev (Oversold).
    - Short when price > SMA + 2*StdDev (Overbought).
    - Exit when price touches the SMA (Mean Reversion) or at EOD (3:15 PM).
    """

    def Initialize(self):
        self.SetCash(100000)  # Starting with 1 Lakh
        self.symbol = "NSE_EQ|INE002A01018" # RELIANCE
        self.AddEquity(self.symbol, Resolution.Minute)
        
        # Strategy Parameters
        self.period = 20
        self.std_dev_multiplier = 2.0
        self.risk_per_trade = 0.02 # Risk 2% of equity
        
        # Indicators
        self.sma = self.SMA(self.symbol, self.period, Resolution.Minute)
        
        # Price Window for manual StdDev calculation
        self.window = []
        
        self.Log("Reliance Mean Reversion Strategy Initialized")

    def OnData(self, data):
        if self.symbol not in data:
            return

        current_time = self.Time.time()
        price = data[self.symbol].Price
        
        # Update window for StdDev
        self.window.append(price)
        if len(self.window) > self.period:
            self.window.pop(0)
            
        # Time-based Exit: Liquidate at 3:15 PM IST
        if current_time >= time(15, 15):
            if self.Portfolio[self.symbol].Invested:
                self.Liquidate(self.symbol)
                self.Log(f"EOD Liquidation @ {price}")
            return

        # Warm up indicators
        if not self.sma.IsReady or len(self.window) < self.period:
            return

        # Calculate manual StdDev
        std_dev = np.std(self.window)
        upper_band = self.sma.Current.Value + (self.std_dev_multiplier * std_dev)
        lower_band = self.sma.Current.Value - (self.std_dev_multiplier * std_dev)

        # Trading Logic
        invested = self.Portfolio[self.symbol].Invested
        holdings = self.Portfolio[self.symbol].Quantity

        if not invested:
            # Entry Long
            if price < lower_band:
                self.SetHoldings(self.symbol, 0.9) # Use 90% of buying power
                self.Log(f"LONG Entry @ {price} | Lower Band: {lower_band:.2f}")
            
            # Entry Short
            elif price > upper_band:
                self.SetHoldings(self.symbol, -0.9)
                self.Log(f"SHORT Entry @ {price} | Upper Band: {upper_band:.2f}")
        
        else:
            # Exit Logic (Mean Reversion to SMA)
            if holdings > 0: # Long position
                if price >= self.sma.Current.Value:
                    self.Liquidate(self.symbol)
                    self.Log(f"LONG Mean Reversion Exit @ {price}")
            
            elif holdings < 0: # Short position
                if price <= self.sma.Current.Value:
                    self.Liquidate(self.symbol)
                    self.Log(f"SHORT Mean Reversion Exit @ {price}")

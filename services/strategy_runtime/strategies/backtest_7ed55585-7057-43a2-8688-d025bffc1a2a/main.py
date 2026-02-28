from quant_sdk.algorithm import QCAlgorithm
from .indicators_helper import BollingerBands
from datetime import timedelta

class MeanReversion(QCAlgorithm):
    def Initialize(self):
        self.SetCash(100000)
        self.SetStartDate(2024, 1, 1)  # Adjust as needed
        
        # Universe filtering - focus on liquid, volatile stocks
        self.AddUniverse(self.SelectUniverse)
        
        # State management
        self.bands = {}
        self.last_trade_time = {}  # Cooldown tracker
        self.entry_prices = {}     # Track entry for profit-taking
        
        # Parameters
        self.cooldown_period = timedelta(minutes=30)  # Minimum time between trades
        self.min_price = 50        # Avoid penny stocks
        self.max_price = 5000      # Avoid illiquid high-priced stocks
        self.min_volume = 100000   # Minimum daily volume
        self.position_size = 0.15  # Slightly larger positions (fewer trades, bigger size)
        self.profit_target = 0.015  # 1.5% profit target for early exit
        self.stop_loss = 0.02      # 2% stop loss
        
    def SelectUniverse(self, coarse):
        """
        Select liquid, mid-to-large cap stocks with sufficient volatility.
        Reduces universe from potentially 1000+ stocks to ~50-100 quality names.
        """
        selected = []
        for stock in coarse:
            # Price filter - avoid illiquid extremes
            if stock.Price < self.min_price or stock.Price > self.max_price:
                continue
            
            # Volume filter - ensure liquidity
            if stock.DollarVolume < self.min_volume * self.min_price:
                continue
                
            # Optional: Add volatility filter - only trade stocks with recent movement
            if stock.Price > 0 and hasattr(stock, 'Volume') and stock.Volume > 0:
                selected.append(stock.Symbol)
                
        # Limit universe size to top 50 by dollar volume
        selected = sorted(
            [s for s in coarse if s.Symbol in selected], 
            key=lambda x: x.DollarVolume, 
            reverse=True
        )[:50]
        
        return [s.Symbol for s in selected]

    def OnData(self, data):
        # Get current time once for efficiency
        current_time = self.Time
        
        for symbol in data.Keys:
            tick = data[symbol]
            price = tick.Price
            
            # Skip if no price data
            if price == 0:
                continue

            # Initialize indicators for new symbols
            if symbol not in self.bands:
                self.bands[symbol] = BollingerBands(period=20)
                self.last_trade_time[symbol] = None
                self.entry_prices[symbol] = None

            # Update indicator
            self.bands[symbol].update(price)

            # Wait for indicator warmup
            if not self.bands[symbol].ready:
                continue

            # Get current position info
            holding = self.Portfolio.get(symbol)
            qty = holding.Quantity if holding else 0
            entry_price = self.entry_prices.get(symbol)
            
            # Get Bollinger Band values
            upper, lower, mean = self.bands[symbol].values()
            
            # Calculate band width - avoid trading when bands are too tight (low volatility)
            band_width = (upper - lower) / mean
            if band_width < 0.01:  # Less than 1% width = avoid
                continue

            # Check cooldown period - prevent over-trading
            last_trade = self.last_trade_time.get(symbol)
            if last_trade and (current_time - last_trade) < self.cooldown_period:
                continue

            # EXIT LOGIC (check before entry to free up capital)
            if qty > 0:
                unrealized_pnl = (price - entry_price) / entry_price if entry_price else 0
                
                # Profit target hit
                if unrealized_pnl >= self.profit_target:
                    self.Liquidate(symbol)
                    self.Log(f"PROFIT TAKE {symbol} @ {price:.2f} ({unrealized_pnl:.2%})")
                    self.last_trade_time[symbol] = current_time
                    self.entry_prices[symbol] = None
                    continue
                
                # Stop loss hit
                if unrealized_pnl <= -self.stop_loss:
                    self.Liquidate(symbol)
                    self.Log(f"STOP LOSS {symbol} @ {price:.2f} ({unrealized_pnl:.2%})")
                    self.last_trade_time[symbol] = current_time
                    self.entry_prices[symbol] = None
                    continue
                
                # Original mean reversion exit (price above upper band)
                if price > upper:
                    self.Liquidate(symbol)
                    self.Log(f"SELL {symbol} @ {price:.2f} (Above upper band)")
                    self.last_trade_time[symbol] = current_time
                    self.entry_prices[symbol] = None
                    continue

            # ENTRY LOGIC
            if qty <= 0:
                # Only enter if price significantly below lower band (margin of safety)
                # Require price to be 0.5% below band to avoid noise
                entry_threshold = lower * 0.995
                
                if price < entry_threshold:
                    # Check if we have sufficient buying power
                    if self.Portfolio.MarginRemaining > price * 10:  # Minimum lot size check
                        self.SetHoldings(symbol, self.position_size)
                        self.Log(f"BUY {symbol} @ {price:.2f} (Below lower band: {lower:.2f})")
                        self.last_trade_time[symbol] = current_time
                        self.entry_prices[symbol] = price

    def OnEndOfDay(self):
        """
        Optional: Log daily stats and close positions before market close
        to avoid overnight gap risk (reduces holding time, thus risk).
        """
        pass  # Remove if you want to hold overnight
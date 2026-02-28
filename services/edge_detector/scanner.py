import pandas as pd
import numpy as np

class EdgeScanner:
    def __init__(self, pool):
        self.pool = pool

    def get_connection(self):
        return self.pool.getconn()

    def release_connection(self, conn):
        self.pool.putconn(conn)

    def fetch_data(self, symbols, timeframe, start_date, end_date):
        conn = self.get_connection()
        try:
            if not symbols:
                return pd.DataFrame()
            symbols_str = "', '".join(symbols)
            ts_start = f"{start_date}T00:00:00.000000Z"
            ts_end = f"{end_date}T23:59:59.999999Z"
            
            query = f"""
                SELECT timestamp, symbol, open, high, low, close, volume 
                FROM ohlc 
                WHERE symbol IN ('{symbols_str}')
                  AND timeframe = '{timeframe}'
                  AND timestamp >= to_timestamp('{ts_start}', 'yyyy-MM-ddTHH:mm:ss.SSSUUUZ')
                  AND timestamp <= to_timestamp('{ts_end}', 'yyyy-MM-ddTHH:mm:ss.SSSUUUZ')
                ORDER BY timestamp ASC;
            """
            
            df = pd.read_sql(query, conn)
            if df.empty:
                return df
                
            df['timestamp'] = pd.to_datetime(df['timestamp'])
            return df
        finally:
            self.release_connection(conn)

    def detect_patterns(self, df):
        signals = pd.DataFrame(index=df.index)
        signals['symbol'] = df['symbol']
        signals['timestamp'] = df['timestamp']
        signals['close'] = df['close']
        
        # Shifted values for vectorized operations grouping by symbol
        prev_close = df.groupby('symbol')['close'].shift(1)
        prev_open = df.groupby('symbol')['open'].shift(1)
        prev_high = df.groupby('symbol')['high'].shift(1)
        prev_low = df.groupby('symbol')['low'].shift(1)
        
        # 1. Gap Up Fade: Opens > 1% higher than prev close, then closes lower than open
        gap_up = df['open'] > (prev_close * 1.01)
        fade = df['close'] < df['open']
        signals['gap_up_fade'] = gap_up & fade
        
        # 2. Consecutive Up Days (3 in a row)
        up_day = df['close'] > df['open']
        prev_up_1 = up_day.groupby(df['symbol']).shift(1)
        prev_up_2 = up_day.groupby(df['symbol']).shift(2)
        signals['consecutive_up_days'] = up_day & prev_up_1 & prev_up_2
        
        # 3. Inside Bar Breakout
        prev_prev_high = df.groupby('symbol')['high'].shift(2)
        prev_prev_low = df.groupby('symbol')['low'].shift(2)
        inside_bar = (prev_high < prev_prev_high) & (prev_low > prev_prev_low)
        breakout = df['close'] > prev_high
        signals['inside_bar_breakout'] = inside_bar & breakout
        
        # 4. Oversold Bounce
        close_3d_ago = df.groupby('symbol')['close'].shift(3)
        drop_3d = df['close'] < (close_3d_ago * 0.90) # 10% drop over 3 periods
        bounce = df['close'] > df['open']
        signals['oversold_bounce'] = drop_3d & bounce
        
        # 5. Volatility Contraction (VCP rough proxy)
        range_today = df['high'] - df['low']
        prev_range = prev_high - prev_low
        prev_prev_range = prev_prev_high - prev_prev_low
        vcp = (range_today < prev_range) & (prev_range < prev_prev_range)
        up_close = df['close'] > prev_close
        signals['volatility_contraction'] = vcp & up_close

        return signals

    def calculate_forward_returns(self, df, signals, forward_returns_bars, patterns):
        results = []
        
        # Calculate N-bar forward returns for the dataframe
        fwd_returns = {}
        for n in forward_returns_bars:
            shifted_close = df.groupby('symbol')['close'].shift(-n)
            fwd_returns[n] = (shifted_close - df['close']) / df['close']
            
        for pattern in patterns:
            if pattern not in signals.columns:
                continue
                
            pattern_mask = signals[pattern] == True
            if not pattern_mask.any():
                results.append({
                    'pattern': pattern,
                    'occurrences': 0,
                    'win_rate': 0,
                    'expected_return': 0,
                    'history': []
                })
                continue
                
            occurrences = int(pattern_mask.sum())
            
            # Use 1-bar for primary ranking, but return all
            base_n = forward_returns_bars[0] if forward_returns_bars else 1
            if base_n not in fwd_returns:
                shifted_close = df.groupby('symbol')['close'].shift(-base_n)
                fwd_returns[base_n] = (shifted_close - df['close']) / df['close']
                
            pattern_fwd_ret = fwd_returns[base_n][pattern_mask].dropna()
            
            win_rate = float((pattern_fwd_ret > 0).mean() * 100) if len(pattern_fwd_ret) > 0 else 0
            expected_return = float(pattern_fwd_ret.mean() * 100) if len(pattern_fwd_ret) > 0 else 0
            
            # Get historical events for the chart
            history_rows = signals[pattern_mask].copy()
            # Attach the return for the base_n
            history_rows['fwd_return'] = pattern_fwd_ret
            history_rows = history_rows.dropna(subset=['fwd_return'])
            
            # Format history for frontend
            history_data = []
            for _, row in history_rows.iterrows():
                history_data.append({
                    'timestamp': str(row['timestamp'].date()) if hasattr(row['timestamp'], 'date') else str(row['timestamp']),
                    'symbol': row['symbol'],
                    'close': float(row['close']),
                    'return_pct': float(row['fwd_return'] * 100)
                })
                
            results.append({
                'pattern': pattern,
                'occurrences': len(history_rows),
                'win_rate': round(win_rate, 2),
                'expected_return': round(expected_return, 2),
                'history': sorted(history_data, key=lambda x: x['timestamp'], reverse=True)[:50] # Top 50 recent
            })
            
        return results

    def run_scan(self, symbols, timeframe, start_date, end_date, patterns, forward_returns_bars):
        if not symbols or not patterns:
            return []
            
        df = self.fetch_data(symbols, timeframe, start_date, end_date)
        if df.empty or len(df) == 0:
            raise ValueError(f"MISSING_DATA: No historical data found for '{symbols}' in the specified range. Backfill required.")
            
        df = df.sort_values(by=['symbol', 'timestamp'])
        signals = self.detect_patterns(df)
        stats = self.calculate_forward_returns(df, signals, forward_returns_bars, patterns)
        
        # Sort by Win Rate
        stats.sort(key=lambda x: x['win_rate'], reverse=True)
        
        return stats

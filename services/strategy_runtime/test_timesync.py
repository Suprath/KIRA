"""
Test Suite — timesync.py
=========================
Validates timezone conversions, market hours, NSE holidays,
and trading calendar logic.
"""
import pytest
from datetime import datetime, timezone, timedelta, date, time as dt_time
from timesync import (
    IST, UTC,
    to_ist, now_ist, to_utc, make_ist,
    is_market_open, is_pre_market, is_square_off_window,
    next_market_open, is_trading_day, trading_days_between,
    get_trading_days, seconds_to_market_open,
    NSE_HOLIDAYS, MARKET_OPEN, MARKET_CLOSE,
)


# ────────────────────────────────────────────────────────────
# TIMEZONE CONVERSION
# ────────────────────────────────────────────────────────────

class TestTimezoneConversion:
    def test_naive_backtest_treated_as_ist(self):
        """In backtest mode, naive time is treated as IST."""
        naive = datetime(2024, 3, 15, 10, 0, 0)
        result = to_ist(naive, backtest_mode=True)
        assert result.tzinfo == IST
        assert result.hour == 10  # unchanged

    def test_naive_live_treated_as_utc(self):
        """In live mode, naive time is treated as UTC then converted to IST (+5:30)."""
        naive = datetime(2024, 3, 15, 4, 0, 0)  # 4:00 UTC
        result = to_ist(naive, backtest_mode=False)
        assert result.tzinfo == IST
        assert result.hour == 9   # 4:00 UTC → 9:30 IST
        assert result.minute == 30

    def test_aware_utc_to_ist(self):
        """Aware UTC datetime should convert to IST."""
        utc_dt = datetime(2024, 6, 1, 3, 45, 0, tzinfo=UTC)
        result = to_ist(utc_dt)
        assert result.hour == 9
        assert result.minute == 15

    def test_already_ist(self):
        """Already IST datetime should stay the same."""
        ist_dt = make_ist(2024, 1, 1, 12, 0, 0)
        result = to_ist(ist_dt)
        assert result.hour == 12

    def test_to_utc(self):
        ist_dt = make_ist(2024, 1, 1, 15, 30, 0)
        utc_dt = to_utc(ist_dt)
        assert utc_dt.hour == 10  # 15:30 IST = 10:00 UTC

    def test_now_ist_has_tz(self):
        result = now_ist()
        assert result.tzinfo == IST


# ────────────────────────────────────────────────────────────
# MARKET HOURS
# ────────────────────────────────────────────────────────────

class TestMarketHours:
    def test_market_open_exact(self):
        """09:15 IST on a trading day = market open."""
        dt = make_ist(2024, 3, 18, 9, 15, 0)  # Monday
        assert is_market_open(dt)

    def test_market_close_exact(self):
        """15:30 IST = last second of market."""
        dt = make_ist(2024, 3, 18, 15, 30, 0)  # Monday
        assert is_market_open(dt)

    def test_before_open(self):
        """09:14 IST = before market opens."""
        dt = make_ist(2024, 3, 18, 9, 14, 0)
        assert not is_market_open(dt)

    def test_after_close(self):
        """15:31 IST = after market close."""
        dt = make_ist(2024, 3, 18, 15, 31, 0)
        assert not is_market_open(dt)

    def test_weekend_closed(self):
        """Saturday at 10AM = market closed."""
        dt = make_ist(2024, 3, 16, 10, 0, 0)  # Saturday
        assert not is_market_open(dt)

    def test_holiday_closed(self):
        """Republic Day 2024 = market closed."""
        dt = make_ist(2024, 1, 26, 10, 0, 0)
        assert not is_market_open(dt)


# ────────────────────────────────────────────────────────────
# PRE-MARKET & SQUARE-OFF
# ────────────────────────────────────────────────────────────

class TestPreMarketSquareOff:
    def test_pre_market_window(self):
        dt = make_ist(2024, 3, 18, 9, 5, 0)
        assert is_pre_market(dt)

    def test_not_pre_market(self):
        dt = make_ist(2024, 3, 18, 9, 30, 0)
        assert not is_pre_market(dt)

    def test_square_off_at_320(self):
        dt = make_ist(2024, 3, 18, 15, 20, 0)
        assert is_square_off_window(dt)

    def test_square_off_at_330(self):
        dt = make_ist(2024, 3, 18, 15, 30, 0)
        assert is_square_off_window(dt)

    def test_not_square_off(self):
        dt = make_ist(2024, 3, 18, 15, 0, 0)
        assert not is_square_off_window(dt)


# ────────────────────────────────────────────────────────────
# TRADING DAY
# ────────────────────────────────────────────────────────────

class TestTradingDay:
    def test_weekday_is_trading(self):
        assert is_trading_day(date(2024, 3, 18))  # Monday

    def test_saturday_not_trading(self):
        assert not is_trading_day(date(2024, 3, 16))

    def test_sunday_not_trading(self):
        assert not is_trading_day(date(2024, 3, 17))

    def test_republic_day_not_trading(self):
        assert not is_trading_day(date(2024, 1, 26))

    def test_christmas_not_trading(self):
        assert not is_trading_day(date(2024, 12, 25))

    def test_regular_weekday_trading(self):
        assert is_trading_day(date(2024, 3, 4))  # Monday, no holiday

    def test_accepts_datetime(self):
        """Should handle datetime objects too."""
        assert is_trading_day(datetime(2024, 3, 18, 10, 0))


# ────────────────────────────────────────────────────────────
# TRADING DAYS BETWEEN
# ────────────────────────────────────────────────────────────

class TestTradingDaysBetween:
    def test_same_day(self):
        d = date(2024, 3, 18)  # Monday
        assert trading_days_between(d, d) == 1

    def test_weekend_excluded(self):
        """Mon–Sun should have 5 trading days (Mon–Fri)."""
        mon = date(2024, 3, 18)
        sun = date(2024, 3, 24)
        assert trading_days_between(mon, sun) == 5

    def test_holidays_excluded(self):
        """Week containing Holi 2024 (March 25) should have 4 days."""
        mon = date(2024, 3, 25)
        fri = date(2024, 3, 29)  # Good Friday also a holiday
        # March 25 (Holi), 26 (Tue), 27 (Wed), 28 (Thu), 29 (Good Friday)
        # Trading days: 26, 27, 28 = 3
        assert trading_days_between(mon, fri) == 3

    def test_reversed_dates(self):
        """Should handle reversed start/end gracefully."""
        a = date(2024, 3, 22)
        b = date(2024, 3, 18)
        assert trading_days_between(a, b) == trading_days_between(b, a)


# ────────────────────────────────────────────────────────────
# NEXT MARKET OPEN
# ────────────────────────────────────────────────────────────

class TestNextMarketOpen:
    def test_before_open_same_day(self):
        """Before 9:15 on a trading day → returns same day 9:15."""
        dt = make_ist(2024, 3, 18, 8, 0, 0)
        nmo = next_market_open(dt)
        assert nmo.date() == date(2024, 3, 18)
        assert nmo.time() == MARKET_OPEN

    def test_after_close_next_day(self):
        """After close on Friday → skips weekend + Holi → next trading day."""
        dt = make_ist(2024, 3, 22, 16, 0, 0)  # Friday evening
        nmo = next_market_open(dt)
        # March 23 (Sat), 24 (Sun), 25 (Holi) all skipped → March 26 (Tue)
        assert nmo.date() == date(2024, 3, 26)

    def test_saturday_skips_to_monday(self):
        """Saturday → next Monday 9:15."""
        dt = make_ist(2024, 3, 16, 10, 0, 0)  # Saturday
        nmo = next_market_open(dt)
        assert nmo.date() == date(2024, 3, 18)  # Monday


# ────────────────────────────────────────────────────────────
# GET TRADING DAYS
# ────────────────────────────────────────────────────────────

class TestGetTradingDays:
    def test_returns_list(self):
        days = get_trading_days(date(2024, 3, 18), date(2024, 3, 22))
        assert isinstance(days, list)
        assert len(days) == 5  # Mon-Fri, no holidays this week

    def test_excludes_weekend(self):
        days = get_trading_days(date(2024, 3, 16), date(2024, 3, 17))
        assert len(days) == 0  # Sat + Sun


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

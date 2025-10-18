## Quickstart
1. Create a venv and install deps
   ```bash
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   ```
2. Run the toy backtest
   ```bash
   python backtest.py
   ```
3. Replace `examples/sample.csv` with your own OHLC CSV (columns: Open,High,Low,Close, optional Volume).

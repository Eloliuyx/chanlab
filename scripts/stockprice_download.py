import akshare as ak

# 例：下载贵州茅台（600519）的历史日K数据
ticker = "600519"
df = ak.stock_zh_a_hist(symbol=ticker, period="daily", start_date="20150101", end_date="20251018", adjust="")

# 保存为 CSV
import os
os.makedirs("data", exist_ok=True)
df.to_csv(f"data/{ticker}_daily.csv", index=False)
print(df.head())

import pandas as pd
import sqlite3

# Read Excel
df = pd.read_excel(
    r"C:\Users\cmcna\OneDrive\Documents\Side Projects\Sports\Rugby\RWC.xlsx",
    usecols=[0, 2, 7, 8, 9, 10,11]
)

# Rename columns to match database
df.columns = [
    "Game Date",
    "Team",
    "Score",
    "Tries",
    "Penalty Goals",
    "Conversion Rate",
    "Conversions"
]

# Connect to database
conn = sqlite3.connect(r"C:\Users\cmcna\SQL\RWC.db")

# Replace table with fresh data
df.to_sql(
    "Scoring",
    conn,
    if_exists="replace",
    index=False
)

# Verify row count
cursor = conn.cursor()
cursor.execute("SELECT COUNT(*) FROM Scoring")
print("Rows loaded:", cursor.fetchone()[0])

conn.close()
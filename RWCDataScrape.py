import re
import requests
import pandas as pd
from openpyxl import Workbook
from openpyxl.utils.dataframe import dataframe_to_rows

API_URL = "https://en.wikipedia.org/w/api.php"
USER_AGENT = "RWCStatExtractor/7.0"


# -------------------------------------------------
# ALL PAGES
# -------------------------------------------------
PAGES = [

    # 2023
    "2023_Rugby_World_Cup_Pool_A",
    "2023_Rugby_World_Cup_Pool_B",
    "2023_Rugby_World_Cup_Pool_C",
    "2023_Rugby_World_Cup_Pool_D",
    "2023_Rugby_World_Cup_knockout_stage",

    # 2019
    "2019_Rugby_World_Cup_Pool_A",
    "2019_Rugby_World_Cup_Pool_B",
    "2019_Rugby_World_Cup_Pool_C",
    "2019_Rugby_World_Cup_Pool_D",
    "2019_Rugby_World_Cup_knockout_stage",

    # 2015
    "2015_Rugby_World_Cup_Pool_A",
    "2015_Rugby_World_Cup_Pool_B",
    "2015_Rugby_World_Cup_Pool_C",
    "2015_Rugby_World_Cup_Pool_D",
    "2015_Rugby_World_Cup_knockout_stage",

    # 2011
    "2011_Rugby_World_Cup_Pool_A",
    "2011_Rugby_World_Cup_Pool_B",
    "2011_Rugby_World_Cup_Pool_C",
    "2011_Rugby_World_Cup_Pool_D",
    "2011_Rugby_World_Cup_knockout_stage",

    # 2007
    "2007_Rugby_World_Cup_Pool_A",
    "2007_Rugby_World_Cup_Pool_B",
    "2007_Rugby_World_Cup_Pool_C",
    "2007_Rugby_World_Cup_Pool_D",
    "2007_Rugby_World_Cup_knockout_stage",

    # 2003
    "2003_Rugby_World_Cup_Pool_A",
    "2003_Rugby_World_Cup_Pool_B",
    "2003_Rugby_World_Cup_Pool_C",
    "2003_Rugby_World_Cup_Pool_D",
    "2003_Rugby_World_Cup_knockout_stage",
]

WORLD_CUP_MAP = {
    "2023": [p for p in PAGES if p.startswith("2023_")],
    "2019": [p for p in PAGES if p.startswith("2019_")],
    "2015": [p for p in PAGES if p.startswith("2015_")],
    "2011": [p for p in PAGES if p.startswith("2011_")],
    "2007": [p for p in PAGES if p.startswith("2007_")],
    "2003": [p for p in PAGES if p.startswith("2003_")],
}

# -------------------------------------------------
# FETCH WIKITEXT
# -------------------------------------------------
def fetch_wikitext(title):

    params = {
        "action": "query",
        "prop": "revisions",
        "rvprop": "content",
        "rvslots": "main",
        "titles": title,
        "format": "json",
        "formatversion": "2",
    }

    r = requests.get(
        API_URL,
        params=params,
        headers={"User-Agent": USER_AGENT},
        timeout=60,
    )

    r.raise_for_status()

    data = r.json()

    pages = data["query"]["pages"]

    if not pages:
        return ""

    revisions = pages[0].get("revisions")

    if not revisions:
        return ""

    return revisions[0]["slots"]["main"]["content"]


# -------------------------------------------------
# EXTRACT RUGBY BOXES
# -------------------------------------------------

def extract_rugby_boxes(wikitext):

    blocks = []

    #
    # support MANY rugby box variants
    #
    pattern = re.compile(
        r"\{\{\s*(?:#invoke:rugby box\|main|rugbybox|rugby box)",
        re.IGNORECASE
    )

    pos = 0

    while True:

        match = pattern.search(wikitext, pos)

        if not match:
            break

        start = match.start()

        i = start
        depth = 0

        while i < len(wikitext) - 1:

            pair = wikitext[i:i + 2]

            if pair == "{{":
                depth += 1
                i += 2
                continue

            elif pair == "}}":

                depth -= 1
                i += 2

                if depth == 0:

                    blocks.append(wikitext[start:i])

                    pos = i
                    break

                continue

            i += 1

    return blocks


# -------------------------------------------------
# PARSE PARAMETERS
# -------------------------------------------------
def parse_params(block):

    params = {}

    lines = block.splitlines()

    current_key = None
    current_value = []

    for line in lines:

        m = re.match(r"^\|(.*?)=(.*)$", line)

        if m:

            if current_key:
                params[current_key] = "\n".join(current_value).strip()

            current_key = m.group(1).strip().lower()
            current_value = [m.group(2).strip()]

        else:

            if current_key:
                current_value.append(line)

    if current_key:
        params[current_key] = "\n".join(current_value).strip()

    return params


# -------------------------------------------------
# CLEAN TEAM NAMES
# -------------------------------------------------
TEAM_MAP = {
    "RSA": "South Africa",
    "NZL": "New Zealand",
    "AUS": "Australia",
    "ENG": "England",
    "FRA": "France",
    "WAL": "Wales",
    "SCO": "Scotland",
    "IRE": "Ireland",
    "ARG": "Argentina",
    "ITA": "Italy",
    "NAM": "Namibia",
    "URU": "Uruguay",
    "JPN": "Japan",
    "FIJ": "Fiji",
    "TON": "Tonga",
    "SAM": "Samoa",
    "USA": "United States",
    "CAN": "Canada",
    "ROM": "Romania",
    "GEO": "Georgia",
    "POR": "Portugal",
}


def clean_team(text):

    if not text:
        return ""

    m = re.search(
    r"\{\{ru(?:-rt)?\|([^}|]+)",
    text,
    re.IGNORECASE
    )

    if m:

        code = m.group(1).strip()

        if code in TEAM_MAP:
            return TEAM_MAP[code]

        return code

    text = re.sub(r"\(\d+\s*BP\)", "", text)

    text = re.sub(
        r"\[\[[^\]|]+\|([^\]]+)\]\]",
        r"\1",
        text
    )

    text = re.sub(
        r"\[\[([^\]]+)\]\]",
        r"\1",
        text
    )

    text = re.sub(r"\{\{[^}]+\}\}", "", text)

    text = re.sub(r"<.*?>", "", text)

    return text.strip()


# -------------------------------------------------
# COUNT TRIES
# -------------------------------------------------
def count_tries(text):

    if not text:
        return 0

    total = 0

    scorers = re.split(r"<br\s*/?>", text)

    for scorer in scorers:

        scorer = scorer.strip()

        if not scorer:
            continue

        multi = re.search(r"\((\d+)\)", scorer)

        if multi:
            total += int(multi.group(1))
        else:
            total += 1

    return total


# -------------------------------------------------
# COUNT PENALTIES
# -------------------------------------------------
def count_penalties(text, drop_text=""):
    """
    Handles three Wikipedia penalty/drop-goal formats:

    Format 1 — (made/attempted) with minute markers (2007–2023):
        Wilkinson (4/7) 22', 25', 51', 59'

    Format 2 — minute markers only (some pages):
        Parra 22', 35', 51'

    Format 3 — Name (N) totals, no minutes (2003):
        Flatley (4)
        M. Contepomi          ← bare name = 1 kick

    Drop-goal text follows the same three formats and is always
    added to the penalty total.
    """

    total = 0

    # --- penalties ---
    # Format 1: fraction (made/attempted)
    made_matches = re.findall(r"\((\d+)/(\d+)\)", text)
    if made_matches:
        for made, _ in made_matches:
            total += int(made)

    # Format 2: minute markers (no fraction found)
    elif re.search(r"\d{1,3}'", text):
        total += len(re.findall(r"\d{1,3}'", text))

    # Format 3: Name (N) totals — 2003 style
    elif text.strip():
        for scorer in re.split(r"<br\s*/?>|\n", text):
            scorer = scorer.strip()
            if not scorer:
                continue
            m = re.search(r"\((\d+)\)", scorer)
            if m:
                total += int(m.group(1))
            else:
                total += 1  # bare name = 1 kick

    # --- drop goals ---
    if drop_text and drop_text.strip():

        # Format 1: fraction
        dg_made = re.findall(r"\((\d+)/(\d+)\)", drop_text)
        if dg_made:
            for made, _ in dg_made:
                total += int(made)

        # Format 2: minute markers
        elif re.search(r"\d{1,3}'", drop_text):
            total += len(re.findall(r"\d{1,3}'", drop_text))

        # Format 3: Name (N) totals — 2003 style
        else:
            for scorer in re.split(r"<br\s*/?>|\n", drop_text):
                scorer = scorer.strip()
                if not scorer:
                    continue
                m = re.search(r"\((\d+)\)", scorer)
                if m:
                    total += int(m.group(1))
                else:
                    total += 1

    return total

def count_conversions(text):
    """
    Counts successful conversions.

    Supports:
        Sexton (5/6)
        Wilkinson (4)
        Carter
    """

    if not text or not text.strip():
        return 0

    total = 0

    # modern format: (made/attempted)
    matches = re.findall(r"\((\d+)/(\d+)\)", text)

    if matches:
        for made, _ in matches:
            total += int(made)

        return total

    # older format: (4)
    for scorer in re.split(r"<br\s*/?>|\n", text):

        scorer = scorer.strip()

        if not scorer:
            continue

        m = re.search(r"\((\d+)\)", scorer)

        if m:
            total += int(m.group(1))
        else:
            total += 1

    return total

# -------------------------------------------------
# CANCELLED / FORFEITED MATCHES (2019 ONLY)
# -------------------------------------------------
CANCELLED_2019 = {
    ("New Zealand", "Italy"),
    ("Namibia", "Canada"),
    ("England", "France"),
}


def is_cancelled(page_title, home, away):
    if "2019_Rugby_World_Cup" not in page_title:
        return False

    pair = (home, away)

    # also handle reversed ordering
    return pair in CANCELLED_2019 or (away, home) in CANCELLED_2019

# -------------------------------------------------
# EXTRACT MATCHES
# -------------------------------------------------
def extract_matches(page_title, wikitext):

    #
    # fix malformed templates found on some pages
    #
    wikitext = wikitext.replace(
        "\n{Rugbybox",
        "\n{{Rugbybox"
    )

    boxes = extract_rugby_boxes(wikitext)

    matches = []

    for box in boxes:

        params = parse_params(box)

        #
        # support BOTH:
        # home/away
        # team1/team2
        #
        home = clean_team(
            params.get("home")
            or params.get("team1", "")
        )

        away = clean_team(
            params.get("away")
            or params.get("team2", "")
        )

        if not home or not away:
            continue

        #
        # remove cancelled 2019 matches
        #
        if is_cancelled(page_title, home, away):
            continue

        score = params.get("score", "")

        try1 = params.get("try1", "")
        try2 = params.get("try2", "")

        pen1 = params.get("pen1", "")
        pen2 = params.get("pen2", "")

        con1 = params.get("con1", "")
        con2 = params.get("con2", "")

        dg1 = (
            params.get("dg1", "")
            or params.get("drop1", "")
        )

        dg2 = (
            params.get("dg2", "")
            or params.get("drop2", "")
        )

        date = params.get("date", "")

        matches.append({

            "Tournament_Page": page_title,
            "Date": date,

            "Home Team": home,
            "Away Team": away,

            "Score": score,

            "Home Tries": count_tries(try1),
            "Home Conversions": count_conversions(con1),
            "Home Penalties": count_penalties(pen1, dg1),

            "Away Tries": count_tries(try2),
            "Away Conversions": count_conversions(con2),
            "Away Penalties": count_penalties(pen2, dg2),
        })

    return matches

# -------------------------------------------------
# SORT KEY
# -------------------------------------------------

def match_sort_key(match):

    from datetime import datetime
    import re

    #
    # parse date
    #
    raw_date = match["Date"].strip()

    try:
        dt = datetime.strptime(raw_date, "%d %B %Y")
    except:
        dt = datetime.max

    #
    # extract world cup year
    #
    page = match["Tournament_Page"]

    year_match = re.search(r"(\d{4})", page)

    if year_match:
        wc_year = int(year_match.group(1))
    else:
        wc_year = 0

    #
    # reverse order:
    # 2023 first
    # 2019 second
    # etc.
    #
    wc_sort = -wc_year

    #
    # group ordering
    #
    group_order = 99

    if "Pool_A" in page:
        group_order = 1

    elif "Pool_B" in page:
        group_order = 2

    elif "Pool_C" in page:
        group_order = 3

    elif "Pool_D" in page:
        group_order = 4

    elif "knockout" in page.lower():
        group_order = 5

    return (
        wc_sort,
        dt,
        group_order
    )

# -------------------------------------------------
# MAIN
# -------------------------------------------------
def main():

    print("Select World Cup year:")
    print("Available options: 2023, 2019, 2015, 2011, 2007, 2003")

    choice = input("Enter year: ").strip()

    if choice not in WORLD_CUP_MAP:
        print("Invalid selection")
        return

    selected_pages = WORLD_CUP_MAP[choice]

    all_matches = []

    for page in selected_pages:

        print(f"Fetching {page}")

        try:

            wikitext = fetch_wikitext(page)

            matches = extract_matches(page, wikitext)

            print(f"  Found {len(matches)} matches")

            all_matches.extend(matches)

        except Exception as e:

            print(f"ERROR: {page}")
            print(e)

    all_matches.sort(key=match_sort_key)

    rows = []

    for match in all_matches:

        raw_date = match["Date"]

        try:
            from datetime import datetime
            dt = datetime.strptime(raw_date.strip(), "%d %B %Y")
            parsed_date = f"{dt.month}/{dt.day}/{dt.year}"
        except:
            parsed_date = raw_date

        home_rate = (
            match["Home Conversions"] / match["Home Tries"]
            if match["Home Tries"] > 0
            else None
        )

        away_rate = (
            match["Away Conversions"] / match["Away Tries"]
            if match["Away Tries"] > 0
            else None
        )

        rows.append([
            parsed_date,
            match["Home Team"],
            match["Home Tries"],
            match["Home Conversions"],
            round(home_rate, 3) if home_rate is not None else ""
        ])

        rows.append([
            "",
            match["Away Team"],
            match["Away Tries"],
            match["Away Conversions"],
            round(away_rate, 3) if away_rate is not None else ""
        ])

    df = pd.DataFrame(
    rows,
    columns=[
        "Date",
        "Team",
        "Tries",
        "Conversions Made",
        "Conversion Rate"
    ]
    )

    print(df.head(10))

    output_file = f"rugby_world_cup_{choice}_stats.xlsx"

    with pd.ExcelWriter(output_file, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, header=False)

    print(f"Saved {output_file}")


if __name__ == "__main__":
    main()
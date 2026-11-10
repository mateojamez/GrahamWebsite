"""Turn the couple's guest-list spreadsheet (exported as CSV) into SQL inserts.

Usage:
    python scripts/guests_to_sql.py GUESTS.csv OUT.sql [--rename "OLD=NEW" ...]

The spreadsheet has a "Ring Ceremony" section and a "Reception" section, each
with one or more "Family Name" / "# of people" column pairs (one per side of
the family). Invitations follow these rules:

- Reception list: Reception and Utah Open House, with the listed seats.
- Ring Ceremony list: Ring Ceremony, Reception, and Utah Open House.
- A name on both lists becomes one invitation. A trailing "and Family" is
  ignored when matching, so "Pat Doe" and "Pat Doe and Family" merge. The
  Ring Ceremony keeps its own seat count; the Reception and Open House use the
  Reception list's count and name.

Name cleanup: "?" is dropped, "Doe, Pat" becomes "Pat Doe", and --rename
replaces a name exactly (applied after merging).

OUT must be outside this repository: the output holds the guest list, and the
repository may be public. Paste OUT into the Supabase SQL editor after
supabase/schema.sql.
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
EVENTS = ("ring-ceremony", "reception", "open-house")


@dataclass
class Invitee:
    name: str
    seats: dict[str, int] = field(default_factory=dict)


def clean_name(raw: str) -> str:
    name = re.sub(r"\s+", " ", raw.replace("?", "")).strip()
    if name.count(",") == 1:
        last, first = (part.strip() for part in name.split(","))
        if first and last and " " not in last:
            name = f"{first} {last}"
    return name


def match_key(name: str) -> str:
    words = re.sub(r"[^a-z0-9]+", " ", name.lower()).split()
    while words and words[-1] == "family":
        words.pop()
        if words and words[-1] == "and":
            words.pop()
    return " ".join(words)


def parse_seats(raw: str, name: str, warnings: list[str]) -> int | None:
    text = raw.strip()
    if text.isdigit() and int(text) > 0:
        return int(text)
    found = re.findall(r"\d+", text)
    if len(found) == 1 and int(found[0]) > 0:
        warnings.append(f"{name}: read seats {text!r} as {found[0]}")
        return int(found[0])
    warnings.append(f"{name}: skipped, seats {text!r} is not a number")
    return None


def read_lists(rows: list[list[str]], warnings: list[str]) -> dict[str, list[tuple[str, int]]]:
    """Returns {"ring": [(name, seats)], "reception": [...]} in sheet order."""
    section_row = next((r for r in rows if any(c.strip() in ("Ring Ceremony", "Reception") for c in r)), None)
    header_index = next((i for i, r in enumerate(rows) if any(c.strip() == "Family Name" for c in r)), None)
    if section_row is None or header_index is None:
        raise SystemExit("Could not find the section titles or the 'Family Name' header row.")

    sections = []  # (column, list key)
    for col, cell in enumerate(section_row):
        if cell.strip() == "Ring Ceremony":
            sections.append((col, "ring"))
        elif cell.strip() == "Reception":
            sections.append((col, "reception"))

    header = rows[header_index]
    columns = []  # (name column, seats column, list key)
    for col, cell in enumerate(header):
        if cell.strip() != "Family Name":
            continue
        owner = [key for start, key in sections if start <= col]
        if not owner:
            raise SystemExit(f"Column {col + 1} has no section title above it.")
        if col + 1 >= len(header) or header[col + 1].strip() != "# of people":
            raise SystemExit(f"Column {col + 2} should be '# of people'.")
        columns.append((col, col + 1, owner[-1]))

    lists: dict[str, list[tuple[str, int]]] = {"ring": [], "reception": []}
    for key in lists:
        for name_col, seats_col, owner in columns:
            if owner != key:
                continue
            for row in rows[header_index + 1:]:
                raw = row[name_col] if name_col < len(row) else ""
                name = clean_name(raw)
                if not name:
                    continue
                seats = parse_seats(row[seats_col] if seats_col < len(row) else "", name, warnings)
                if seats is not None:
                    lists[key].append((name, seats))
    return lists


def build_invitees(lists, renames: dict[str, str], warnings: list[str]) -> list[Invitee]:
    by_key: dict[str, Invitee] = {}
    ring_seats: dict[str, int] = {}

    for name, seats in lists["reception"]:
        key = match_key(name)
        if key in by_key:
            warnings.append(f"{name}: listed twice on the Reception list; using the larger count")
            seats = max(seats, by_key[key].seats["reception"])
        by_key[key] = Invitee(name, {"reception": seats, "open-house": seats})

    for name, seats in lists["ring"]:
        key = match_key(name)
        if key in ring_seats:
            warnings.append(f"{name}: listed twice on the Ring Ceremony list; using the larger count")
            seats = max(seats, ring_seats[key])
        ring_seats[key] = seats
        if key in by_key:
            if "ring-ceremony" not in by_key[key].seats:
                warnings.append(f"{name}: on both lists; merged into {by_key[key].name!r}")
            by_key[key].seats["ring-ceremony"] = seats
        else:
            by_key[key] = Invitee(name, {"ring-ceremony": seats, "reception": seats, "open-house": seats})

    unused = set(renames)
    for invitee in by_key.values():
        if invitee.name in renames:
            unused.discard(invitee.name)
            invitee.name = renames[invitee.name]
    for old in sorted(unused):
        warnings.append(f"--rename {old!r} matched no name")

    return list(by_key.values())


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def to_sql(invitees: list[Invitee]) -> str:
    lines = [
        "-- Generated by scripts/guests_to_sql.py. Contains the guest list; keep it out of git.",
        "-- Replaces every invitation and answer.",
        "begin;",
        "delete from invitees;",
    ]
    for inv in invitees:
        values = ", ".join(f"({sql_text(e)}, {inv.seats[e]})" for e in EVENTS if e in inv.seats)
        lines.append(
            f"with i as (insert into invitees (name) values ({sql_text(inv.name)}) returning id)\n"
            f"insert into invitations (invitee_id, event, seats) select i.id, v.event, v.seats from i, "
            f"(values {values}) as v(event, seats);"
        )
    lines.append("commit;")
    return "\n".join(lines) + "\n"


def convert(rows: list[list[str]], renames: dict[str, str] | None = None):
    """Returns (sql, invitees, lists, warnings)."""
    warnings: list[str] = []
    lists = read_lists(rows, warnings)
    invitees = build_invitees(lists, renames or {}, warnings)
    return to_sql(invitees), invitees, lists, warnings


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("out_path", type=Path)
    parser.add_argument("--rename", action="append", default=[], metavar="OLD=NEW")
    args = parser.parse_args(argv)

    out = args.out_path.resolve()
    if out == REPO or REPO in out.parents:
        raise SystemExit("OUT is inside the repository. Write it somewhere outside, such as your Downloads folder.")

    renames = {}
    for item in args.rename:
        old, sep, new = item.partition("=")
        if not sep or not old.strip() or not new.strip():
            raise SystemExit(f"--rename {item!r} should look like OLD=NEW")
        renames[old.strip()] = new.strip()

    with open(args.csv_path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    sql, invitees, lists, warnings = convert(rows, renames)
    out.write_text(sql, encoding="utf-8")

    for w in warnings:
        print("note:", w, file=sys.stderr)
    for key, label in (("ring", "Ring Ceremony list"), ("reception", "Reception list")):
        print(f"{label}: {len(lists[key])} lines, {sum(s for _, s in lists[key])} people")
    print(f"{len(invitees)} invitations written to {out}")
    for event in EVENTS:
        chosen = [i for i in invitees if event in i.seats]
        print(f"  {event}: {len(chosen)} invitations, {sum(i.seats[event] for i in chosen)} seats")


if __name__ == "__main__":
    main()

"""Run: python -m unittest discover scripts. Names here are invented."""

import tempfile
import unittest
from pathlib import Path

from guests_to_sql import REPO, clean_name, convert, main, match_key

# Same shape as the real export: Ring Ceremony then Reception, two sides each.
SHEET = [
    ["", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Ring Ceremony", "", "", "", "", "", "Total", "Reception", "", "", "", "", "", "Total"],
    ["Bride", "", "", "Groom", "", "", "9", "Bride", "", "", "Groom", "", "", "30"],
    ["Family Name", "# of people", "Address ", "Family Name", "# of people", "Address ", "CAP", "Family Name", "# of people", "Address ", "Family Name", "# of people", "Address ", ""],
    ["Ann Ring", "1", "1 Main St", "Bo J. Dup", "1", "", "", "Ann Ring and Family", "16", "", "Bo J. Dup", "2", "", ""],
    ["Cy O'Neil", "3", "", "", "", "", "", "Dee Recep", "? (14)", "", "Ess, Fay", "5", "", ""],
    ["", "", "", "", "", "", "", "Gus?", "2", "", "", "", "", ""],
    ["", "", "", "", "", "", "", "Hal Blank", "", "", "", "", "", ""],
]


def by_name(invitees):
    return {i.name: i.seats for i in invitees}


class ConvertTests(unittest.TestCase):
    def setUp(self):
        self.sql, invitees, self.lists, self.warnings = convert(SHEET, {"Bo J. Dup": "Bo Dup"})
        self.seats = by_name(invitees)

    def test_ring_only_gets_all_three_events(self):
        self.assertEqual(self.seats["Cy O'Neil"], {"ring-ceremony": 3, "reception": 3, "open-house": 3})

    def test_reception_only_gets_reception_and_open_house(self):
        self.assertEqual(self.seats["Gus"], {"reception": 2, "open-house": 2})

    def test_and_family_merges_and_keeps_each_lists_count(self):
        self.assertEqual(self.seats["Ann Ring and Family"], {"reception": 16, "open-house": 16, "ring-ceremony": 1})
        self.assertNotIn("Ann Ring", self.seats)

    def test_same_name_merges_then_renames(self):
        self.assertEqual(self.seats["Bo Dup"], {"reception": 2, "open-house": 2, "ring-ceremony": 1})
        self.assertNotIn("Bo J. Dup", self.seats)

    def test_question_mark_seats_use_the_number(self):
        self.assertEqual(self.seats["Dee Recep"]["reception"], 14)

    def test_last_comma_first_is_flipped(self):
        self.assertIn("Fay Ess", self.seats)

    def test_blank_seats_are_skipped_with_a_warning(self):
        self.assertNotIn("Hal Blank", self.seats)
        self.assertTrue(any("Hal Blank" in w for w in self.warnings))

    def test_one_invitation_per_person(self):
        self.assertEqual(len(self.seats), 6)
        self.assertEqual(self.sql.count("insert into invitees"), 6)

    def test_sql_escapes_apostrophes_and_omits_addresses(self):
        self.assertIn("'Cy O''Neil'", self.sql)
        self.assertNotIn("Main St", self.sql)

    def test_unused_rename_is_reported(self):
        _, _, _, warnings = convert(SHEET, {"Nobody": "X"})
        self.assertTrue(any("Nobody" in w for w in warnings))


class HelperTests(unittest.TestCase):
    def test_match_key(self):
        self.assertEqual(match_key("Pat and Lee Doe and Family"), "pat and lee doe")
        self.assertEqual(match_key("Nicole Good Family"), "nicole good")
        self.assertEqual(match_key("Pat Doe "), "pat doe")

    def test_clean_name(self):
        self.assertEqual(clean_name(" Danielson? "), "Danielson")
        self.assertEqual(clean_name("Doe,  Pat"), "Pat Doe")


class OutputPathTests(unittest.TestCase):
    def test_refuses_output_inside_repo(self):
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as f:
            f.write("x\n")
        with self.assertRaises(SystemExit):
            main([f.name, str(REPO / "guests.sql")])
        Path(f.name).unlink()


if __name__ == "__main__":
    unittest.main()

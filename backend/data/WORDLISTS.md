# Word list sources

The `english_*.txt` files here are the Monkeytype word lists, downloaded verbatim
from `monkeytypegame/monkeytype` and flattened to one word per line so they match
the format the C++ loader already reads.

- Repo: https://github.com/monkeytypegame/monkeytype
- Path: `frontend/static/languages/`
- Repo license: GPL-3.0
- Downloaded: 2026-10-24

Original JSON (name, `orderedByFrequency`, `words[]`) is kept in `raw/` for reference.

| File | Source JSON | Words | Avg length | 3 chars or less | Longer than 7 |
|---|---|---|---|---|---|
| english_200.txt | english.json | 200 | 4.24 | 27.0% | 2.0% |
| english_1k.txt | english_1k.json | 1,000 | 4.85 | 15.2% | 5.8% |
| english_5k.txt | english_5k.json | 5,000 | 6.77 | 4.8% | 34.5% |
| english_10k.txt | english_10k.json | 9,944 | 7.21 | 3.2% | 42.2% |
| english_25k.txt | english_25k.json | 24,141 | 7.81 | 0.0% | 51.1% |

## Notes for wiring these up

- **`words_10k.txt` was left untouched.** It is the list the server currently loads.
- All five lists are frequency ordered except `english_25k`, and **`english_25k` is
  not a superset** — it is a separate pool of rarer words that does not contain
  `the`, `government`, etc. It is not a "level 6" of the same ladder.
- `english_200` is not a strict subset of `english_1k`: 192 of 200 words overlap
  (`into`, `because`, `become`, `another`, `without`, `around`, `however`,
  `increase` are missing from the 1k list). `english_5k` is a perfect subset of
  `english_10k`.
- The lists contain **single-letter `I` and `a`**, which the current loader drops
  because it requires `len >= 2`. Usable counts after that filter: 198 / 998 /
  4,998 / 9,942 / 24,141.
- The 5k and 10k lists contain **capitalised proper nouns** (`January`, `Canada`,
  `Venezuela`, `Canberra`; 216 and 403 entries). The loader lowercases everything,
  so they will appear lowercase unless shift handling is added.
- No duplicate entries in any file.

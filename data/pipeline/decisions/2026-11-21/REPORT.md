# Haiku classification: sample report

Candidates: 6. accepted: 2, needs_review: 1, no_evidence: 0, duplicate: 0, rejected: 3.
Quotes checked against evidence: 25/25 found verbatim.

## Regex status vs Haiku verdict

| Regex \ Haiku | accepted | needs_review | no_evidence | duplicate | rejected |
|---|---|---|---|---|---|
| verified | 0 | 0 | 0 | 0 | 0 |
| weak | 2 | 1 | 0 | 0 | 3 |
| rejected | 0 | 0 | 0 | 0 | 0 |

## Decisions

| Verdict | Name | Country | Regex guess | Haiku category | Scope | Conf. | Pages | What is unusual / reason | Dropped quotes |
|---|---|---|---|---|---|---|---|---|---|
| accepted | Glenapp Castle | United Kingdom | castle-hotels (weak) | castle-hotels | whole_property | 0.9 | 4 | Luxury hotel in a Scottish baronial castle built in 1870, with 22 bedrooms inside the castle |  |
| accepted | Good Hotel London | United Kingdom | floating-hotels (weak) | floating-hotels | whole_property | 0.9 | 3 | Whole hotel is a floating hotel on the Royal Victoria dock, London, converted from a former accommodation platform that was towed across the North Sea |  |
| needs_review | Hever Castle Luxury Bed & Breakfast | United Kingdom | castle-hotels (weak) | castle-hotels | whole_property | 0.7 | 4 | 25 bedrooms in Edwardian wings (Astor Wing and Anne Boleyn Wing) attached to Hever Castle and connected inside it |  |
| rejected | Hôtel Atmosphère & Spa | Madagascar | bubble-hotels (weak) | – | unclear | 0.1 | 1 | Only the OSM tag tourism=hotel and the name are known; the website text says only that its domain expired, so there is no evidence of any bubble or dome stay and category stays null even though the queue guessed bubble-hotels. |  |
| rejected | Hotel Am Leuchtturm | DE | lighthouse-hotels (weak) | – | name_only | 0.4 | 4 | The name means hotel at the lighthouse and the rooms overlook the lighthouse, but this is an ordinary 30-room boutique hotel on the Warnemünde promenade, not a stay inside a lighthouse, so it does not fit lighthouse-hotels. |  |
| rejected | Lighthouse | DE | lighthouse-hotels (weak) | – | name_only | 0.4 | 4 | The brand is named Lighthouse for its nautical theme, but the stay is a 111-room modern hotel with a spa in Büsum, not a stay inside a lighthouse, so it does not fit lighthouse-hotels; the Lighthouse Suite is just a room name. |  |

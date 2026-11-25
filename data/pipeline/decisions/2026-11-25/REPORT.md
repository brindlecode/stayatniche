# Haiku classification: sample report

Candidates: 5. accepted: 1, needs_review: 1, no_evidence: 0, duplicate: 0, rejected: 3.
Quotes checked against evidence: 24/24 found verbatim.

## Regex status vs Haiku verdict

| Regex \ Haiku | accepted | needs_review | no_evidence | duplicate | rejected |
|---|---|---|---|---|---|
| verified | 0 | 1 | 0 | 0 | 0 |
| weak | 1 | 0 | 0 | 0 | 3 |
| rejected | 0 | 0 | 0 | 0 | 0 |

## Decisions

| Verdict | Name | Country | Regex guess | Haiku category | Scope | Conf. | Pages | What is unusual / reason | Dropped quotes |
|---|---|---|---|---|---|---|---|---|---|
| accepted | Castello di Petroia | Italy | castle-hotels (weak) | castle-hotels | whole_property | 0.95 | 4 | Guest rooms and suites inside a medieval castle (11th-century fortress) in Umbria |  |
| needs_review | El Pulpo Safari Lodge | Costa Rica | safari-lodges (verified) | jungle-lodges | whole_property | 0.7 | 2 | Seven tents pitched in the jungle, not a game-drive safari reserve |  |
| rejected | Cliff House | Poland | cliffside-hotels (weak) | – | name_only | 0.3 | 3 | An ordinary guesthouse in Międzyzdroje: the name Cliff House is the only cliff hint, and the listing describes normal rooms with balconies, not rooms on or into a cliff, so it does not fit cliffside-hotels; the pages are a third-party booking listing (nocowanie.pl), not the owner's site. |  |
| rejected | Hotel/Motel La Selva | IT | jungle-lodges (weak) | – | name_only | 0.2 | 1 | The website is a parked domain page saying the domain is for sale, so it is not evidence about the property; the only lodging signal is the OSM hotel tag and the name La Selva, with no jungle or rainforest description, so jungle-lodges is not supported. |  |
| rejected | Clophill Eco Lodges | United Kingdom | jungle-lodges (weak) | – | name_only | 0.5 | 1 | Woodland eco lodges on the Greensand Ridge in England, not a rainforest or cloud forest, so the queueCategory jungle-lodges is wrong; no other category fits, so it is a general lodge with no unusual niche in the evidence. |  |

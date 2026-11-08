# Haiku classification: sample report

Candidates: 5. accepted: 0, needs_review: 0, no_evidence: 0, duplicate: 0, rejected: 5.
Quotes checked against evidence: 21/21 found verbatim.

## Regex status vs Haiku verdict

| Regex \ Haiku | accepted | needs_review | no_evidence | duplicate | rejected |
|---|---|---|---|---|---|
| verified | 0 | 0 | 0 | 0 | 2 |
| weak | 0 | 0 | 0 | 0 | 3 |
| rejected | 0 | 0 | 0 | 0 | 0 |

## Decisions

| Verdict | Name | Country | Regex guess | Haiku category | Scope | Conf. | Pages | What is unusual / reason | Dropped quotes |
|---|---|---|---|---|---|---|---|---|---|
| rejected | Narrow Water Castle | United Kingdom | castle-hotels (weak) | – | name_only | 0.3 | 1 | Castle is the property name, but the lodging is a 5 star apartment in the courtyard beside the castle, and no evidence says guests stay inside a castle, so no castle-hotel category. |  |
| rejected | Ostello del Castello | Italy | castle-hotels (verified) | – | name_only | 0.3 | 2 | A hostel in a 15th-century farmhouse; the castle in the name is a hill castle above the building, not a stay inside a castle, so no castle-hotel category. |  |
| rejected | Atmosphere Suite | Italy | bubble-hotels (weak) | – | unclear | 0.4 | 1 | Ordinary 4-star seafront hotel in a Liberty villa with no sleeping-bubble or other niche feature; the bubble-hotels queue guess is wrong. |  |
| rejected | Hotel Il Castello | Italy | castle-hotels (verified) | – | name_only | 0.3 | 4 | A 4-star hotel with a restaurant and event rooms; the castle in the name is not linked to any castle building, so no castle-hotel category. |  |
| rejected | Mansfield Castle Hotel | United Kingdom | castle-hotels (weak) | – | name_only | 0.1 | 1 | The only page is a generic web hosting domain page unrelated to a hotel, so there is no evidence of any castle or niche feature; is_lodging rests only on the OSM hotel tag. |  |

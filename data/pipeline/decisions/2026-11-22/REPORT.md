# Haiku classification: sample report

Candidates: 6. accepted: 1, needs_review: 0, no_evidence: 0, duplicate: 0, rejected: 5.
Quotes checked against evidence: 26/26 found verbatim.

## Regex status vs Haiku verdict

| Regex \ Haiku | accepted | needs_review | no_evidence | duplicate | rejected |
|---|---|---|---|---|---|
| verified | 0 | 0 | 0 | 0 | 1 |
| weak | 1 | 0 | 0 | 0 | 4 |
| rejected | 0 | 0 | 0 | 0 | 0 |

## Decisions

| Verdict | Name | Country | Regex guess | Haiku category | Scope | Conf. | Pages | What is unusual / reason | Dropped quotes |
|---|---|---|---|---|---|---|---|---|---|
| accepted | Ruthin Castle Hotel | GB | castle-hotels (weak) | castle-hotels | whole_property | 0.95 | 4 | Hotel whose guest rooms are inside the historic Ruthin Castle building |  |
| rejected | Hotel Appartmentanlage Herrmannshöhle | Germany | cave-hotels (weak) | – | name_only | 0.9 | 4 | Apartments spread over three floors of a timber-framed building in Rübeland; the cave-hotel tag only reflects the nearby Hermannshöhle show cave, and the evidence does not describe any rooms in a cave or rock, so it is not a cave hotel. |  |
| rejected | Valahara Eco-Luxury Camp | Madagascar | desert-camps (verified) | – | unclear | 0.8 | 1 | queueCategory desert-camps is not supported: the site describes an eco-luxury camp in the volcanic highlands near Antsirabe with lake views, not a desert; the evidence shows no unusual sleeping unit, so no category applies. |  |
| rejected | Ratanakiri Homestay & Jungle Trek | Cambodia | jungle-lodges (weak) | – | unclear | 0.1 | 1 | The only fetched page is a 404 Page Not Found, so there is no description of the property; the only evidence is the OSM guest_house tag and the name, which do not support jungle-lodges, and the site needs a re-fetch before any decision. |  |
| rejected | The Dome | Thailand | bubble-hotels (weak) | – | name_only | 0.5 | 4 | A Chiang Mai city hotel with standard, deluxe and suite rooms; the name Dome is not evidence of transparent bubbles or domes, and no sleeping unit is described as a dome, so bubble-hotels is a false positive. |  |
| rejected | Culzean Castle Camping and Caravanning Club Site | United Kingdom | castle-hotels (weak) | – | unclear | 0.4 | 4 | A Camping and Caravanning Club campsite with tent and caravan pitches in the grounds of Culzean Castle; the sleeping units are not inside the castle, so castle-hotels does not fit, and the castle link is location only; the Lodges page on this site refers to a different Lake District site and was not used. Owner may want to confirm the campsite policy. |  |

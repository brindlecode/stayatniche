# Haiku classification: sample report

Candidates: 34. accepted: 3, needs_review: 4, no_evidence: 0, duplicate: 0, rejected: 27.
Quotes checked against evidence: 120/120 found verbatim.

## Regex status vs Haiku verdict

| Regex \ Haiku | accepted | needs_review | no_evidence | duplicate | rejected |
|---|---|---|---|---|---|
| verified | 1 | 2 | 0 | 0 | 5 |
| weak | 2 | 2 | 0 | 0 | 22 |
| rejected | 0 | 0 | 0 | 0 | 0 |

## Decisions

| Verdict | Name | Country | Regex guess | Haiku category | Scope | Conf. | Pages | What is unusual / reason | Dropped quotes |
|---|---|---|---|---|---|---|---|---|---|
| accepted | Schlass Ischpelt | LU | castle-hotels (weak) | castle-hotels | whole_property | 0.85 | 4 | Listed historic château hotel with guest rooms and suites inside the building |  |
| accepted | Botel Marina | Croatia | floating-hotels (weak) | floating-hotels | whole_property | 0.9 | 4 | Hotel rooms on a historic ship moored in central Rijeka |  |
| accepted | Ice Hotel | SE | ice-hotels (verified) | ice-hotels | whole_property | 0.95 | 4 | Hotel rebuilt each year from river ice and snow in Jukkasjärvi, with year-round ice suites (ICEHOTEL 365) |  |
| needs_review | Cliffbase | Croatia | cliffside-hotels (weak) | cliffside-hotels | whole_property | 0.8 | 2 | Sleeping rooms built into a limestone rock face above the Adriatic on Hvar, with climbing-route access |  |
| needs_review | Cardamom Tented Camp | Cambodia | safari-lodges (verified) | safari-lodges | whole_property | 0.7 | 4 | Safari-style canvas tents inside Botum Sakor National Park with night boat safaris and treks |  |
| needs_review | Miramichi Treehouse & Camping Adventures | CA | treehouse-hotels (verified) | treehouse-hotels | some_units | 0.9 | 2 | Treehouses on raised decks among trees, alongside cottages and RV/tent sites at a New Brunswick campground |  |
| needs_review | Hunza Ecolodge | Hungary | jungle-lodges (weak) | treehouse-hotels | some_units | 0.7 | 4 | Tree houses (including twin tree houses) alongside glamping tents, a gingerbread house and a boho wagon |  |
| rejected | Botel Maastricht | NL | floating-hotels (weak) | floating-hotels | whole_property | 0.9 | 3 | Hotel on a moored boat in Maastricht with sleeping cabins on the water |  |
| rejected | treehouse Resnice | Croatia | treehouse-hotels (weak) | treehouse-hotels | name_only | 0.2 | 1 | Name suggests a treehouse; the only fetched page is an empty Booking.com listing |  |
| rejected | Faro Boutique Hotel | Portugal | lighthouse-hotels (weak) | – | unclear | 0.4 | 4 | Ordinary 3-star city hotel in Faro with no unusual sleeping unit in the evidence, so the lighthouse-hotels queue guess is rejected. |  |
| rejected | Villa Sahara | France | desert-camps (weak) | – | unclear | 0.2 | 4 | Fetched pages are a Brittany holiday-rental aggregator (armor-vacances.com) that never mentions Villa Sahara and the website field points elsewhere, so no lodging or desert-camp niche is supported. |  |
| rejected | Safari Hotel | Hungary | safari-lodges (verified) | – | name_only | 0.4 | 4 | Three-storey city hotel near the Szeged wildlife park; the safari name is the only link, with no game drives or reserve lodge, so safari-lodges is rejected. |  |
| rejected | Camping Alp Safari | Switzerland | safari-lodges (verified) | – | name_only | 0.3 | 2 | Family campsite in Nax with glamping tents; the safari style is branding with no reserve or game drives, so safari-lodges is rejected. |  |
| rejected | KOŠICE HOTEL | SK | ice-hotels (weak) | – | unclear | 0.3 | 3 | Standard Slovak hotel with a restaurant and event halls; the name only contains 'ice' as a substring, so ice-hotels is rejected. |  |
| rejected | Mitsui Garden Hotel Shiodome Italia-gai | Japan | bubble-hotels (weak) | – | unclear | 0.4 | 4 | Standard Tokyo business hotel in a chain with no unusual sleeping unit in the evidence, so the bubble-hotels queue guess is rejected. |  |
| rejected | The Safari Club | South Africa | safari-lodges (verified) | – | name_only | 0.3 | 4 | Airport-area boutique hotel in Kempton Park where the safari feel is a theme; it offers day tours but no reserve or game drives, so safari-lodges is rejected. |  |
| rejected | Cliff Hotel | Germany | cliffside-hotels (weak) | – | name_only | 0.2 | 3 | Large seaside resort hotel on Rügen; the Cliff name comes from the street name and no rooms are built on a cliff, so cliffside-hotels is rejected. |  |
| rejected | My EcoLodge | JP | jungle-lodges (weak) | – | unclear | 0.1 | 1 | The website redirects to an unrelated Vietnamese football streaming site, so no lodging or jungle niche is evidenced and is_lodging is set false. |  |
| rejected | Camping Kemijärvi / Pyhä Safaris | FI | safari-lodges (weak) | – | name_only | 0.3 | 1 | Lakeside family campsite in Kemijärvi with cabins and rental caravans; no safari or game-drive evidence, so the safari-lodges fit is rejected. |  |
| rejected | Bullerö Gästhem | Sweden | bubble-hotels (weak) | – | unclear | 0.2 | 4 | Pages describe a state nature reserve and an archipelago museum with no guest accommodation, so is_lodging is false and the bubble-hotels queue guess is rejected. |  |
| rejected | Campingplatz Safari | DE | safari-lodges (verified) | – | name_only | 0.3 | 1 | Campground in the Odenwald with pitches and a few tiny houses; the safari name is the only link and there are no game drives, so safari-lodges is rejected. |  |
| rejected | Domeikavos Vila | Lithuania | bubble-hotels (weak) | – | unclear | 0.3 | 1 | Guesthouse in Ražiai with a garden and terrace; the site describes no unusual sleeping unit, so the bubble-hotels queue guess is rejected. |  |
| rejected | Khampa Nomad Ecolodge | China | jungle-lodges (weak) | – | unclear | 0.4 | 4 | The site describes a Tibetan grassland ecolodge with bedrooms and a dorm, not a jungle, treehouse or other niche structure, so no category fits; the queue jungle-lodges guess is wrong. |  |
| rejected | Villa Castillo Escondido | MX | castle-hotels (weak) | – | name_only | 0.2 | 4 | The linked site is Cabo Platinum, a vacation rental and concierge agency that lists many villas, and the evidence never mentions this villa or any castle feature, so it is not confirmed as a lodging. |  |
| rejected | Hausboot Yellow Submarine | DE | underwater-rooms (weak) | – | name_only | 0.2 | 1 | The linked page is a broker for about 85 holiday homes at Ostsee Resort Olpenitz that mentions floating houses in general but never names this Yellow Submarine houseboat, and it contains no underwater room. |  |
| rejected | Pullman Rosario City Center | Argentina | train-hotels (weak) | – | unclear | 0.5 | 2 | This is a standard five-star Accor hotel inside an entertainment complex; the Pullman name is a brand, and the evidence shows no train, carriage or sleeper feature. |  |
| rejected | Sam Lords Castle - A Wyndham Grand Resort | Barbados | castle-hotels (verified) | – | name_only | 0.5 | 4 | New all-inclusive beachfront resort beside the ruins of Sam Lord's Castle, which was gutted by fire in 2010 |  |
| rejected | Ambotel | France | floating-hotels (weak) | – | unclear | 0.5 | 4 | The name suggests a boat hotel, but the site describes an ordinary air-conditioned hotel-restaurant with 34 rooms and no floating or boat feature. |  |
| rejected | Ecolodge Ukuku | CO | jungle-lodges (weak) | – | unclear | 0.05 | 1 | The fetched pages are an unrelated online gambling site (Hello88), so the evidence says nothing about the Ecolodge Ukuku and it should be re-fetched. |  |
| rejected | Caves Beach Resort | Egypt | cave-hotels (weak) | – | unclear | 0.05 | 4 | The fetched pages are unrelated online gambling articles, so there is no evidence of a cave room; OSM tags a 5-star hotel but the site must be re-fetched before any decision. |  |
| rejected | Saldomar B&Biosphere | Guinea-Bissau | bubble-hotels (weak) | – | unclear | 0.1 | 1 | The only page is an empty Booking.com listing (HTTP 202), so no bubble or dome feature can be verified. |  |
| rejected | Bubbles on the bay | Ireland | bubble-hotels (weak) | – | name_only | 0.2 | 1 | The page describes a standard self-catering apartment with a patio and no transparent bubble or dome, so the name Bubbles is the only bubble-hotel signal. |  |
| rejected | The Castle Apartments | IM | castle-hotels (weak) | – | name_only | 0.1 | 1 | The website returns only an empty server directory index, so the castle name is the only evidence and nothing can be verified. |  |
| rejected | Het Caves | Netherlands | cave-hotels (weak) | – | name_only | 0.2 | 4 | This is a 9-hole golf park with a campsite near Wintelre, and no cave room or cave feature appears in the evidence, so the cave name is a false positive. |  |

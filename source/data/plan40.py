# v8 (Oct 25 2026, 3:13 PM note): 60 -> 40 categories. Every app comes from the reviewed v7 set (no new lookups).
import json, sys, collections
SRC = '/home/claude/neocast-site/source/apps.json'   # run against the v7 apps.json (commit 2378bcf)
d = json.load(open(SRC))
byname = collections.defaultdict(list)
for a in d['apps']: byname[a['name']].append(a)
old = {c['k']: c for c in d['cats']}
# (key, name, glyph, merged-from v7 keys, apps in order)  — None = keep the v7 category's ten apps as they are
P = [
 # inner ring (8)
 ('movies', 'Movies', 'popcorn', ['movies'], None),
 ('tv', 'TV', 'tv', ['tv'], None),
 ('music', 'Music', 'music', ['music'], None),
 ('games', 'Games', 'gamepad-2', ['games'], None),
 ('sports', 'Sports', 'trophy', ['sports'], None),
 ('creators', 'Creators', 'video', ['creators'], None),
 ('social', 'Social', 'message-circle-heart', ['social', 'messaging'],
  ['Instagram', 'TikTok', 'WhatsApp', 'Snapchat', 'Facebook', 'X', 'Reddit', 'Discord', 'Messenger', 'Threads']),
 ('ai', 'AI', 'sparkles', ['ai'], None),
 # middle ring (14)
 ('livetv', 'Live TV', 'monitor-play', ['livetv'], None),
 ('podcasts', 'Podcasts', 'podcast', ['podcasts'], None),
 ('radio', 'Radio', 'radio', ['radio'], None),
 ('books', 'Books', 'book-open', ['books'], None),
 ('audiobooks', 'Audiobooks', 'headphones', ['audiobooks'], None),
 ('filmmaking', 'Filmmaking', 'clapperboard', ['filmmaking'], None),
 ('musicproduction', 'Music production', 'piano', ['musicproduction'], None),
 ('news', 'News', 'newspaper', ['news'], None),
 ('events', 'Events', 'party-popper', ['events'], None),
 ('concerts', 'Concerts', 'mic-vocal', ['concerts'], None),
 ('festivals', 'Festivals', 'tent', ['festivals'], None),
 ('themeparks', 'Theme parks', 'roller-coaster', ['themeparks'], None),
 ('photos', 'Photos', 'camera', ['photos'], None),
 ('design', 'Design', 'palette', ['design', 'art'],
  ['Canva', 'Figma', 'Adobe Photoshop', 'Procreate Pocket', 'Adobe Express', 'Pinterest', 'Behance', 'Adobe Fresco', 'Google Arts & Culture', 'Artsy']),
 # outer ring (18)
 ('learning', 'Learning', 'graduation-cap', ['learning', 'school', 'knowledge'],
  ['Khan Academy', 'Coursera', 'MasterClass', 'Quizlet', 'Canvas', 'Google Classroom', 'Wikipedia', 'Brilliant', 'Udemy', 'TED']),
 ('languages', 'Languages', 'languages', ['languages'], None),
 ('family', 'Family', 'users-round', ['family', 'kids'],
  ['Life360', 'Find My', 'Google Family Link', 'Cozi', 'YouTube Kids', 'PBS KIDS', 'Khan Academy Kids', 'Toca Boca World', 'BabyCenter', 'Greenlight']),
 ('dating', 'Dating', 'heart', ['dating'], None),
 ('food', 'Food', 'utensils-crossed', ['restaurants', 'fooddelivery', 'cooking', 'groceries'],
  ['DoorDash', 'Uber Eats', 'Instacart', 'Yelp', 'OpenTable', 'Resy', 'Starbucks', 'McDonald’s', 'NYT Cooking', 'Beli']),
 ('travel', 'Travel', 'luggage', ['travel', 'outdoors'],
  ['Airbnb', 'Booking.com', 'Expedia', 'Hopper', 'KAYAK', 'Tripadvisor', 'Delta', 'United Airlines', 'Marriott Bonvoy', 'AllTrails']),
 ('gettingaround', 'Getting around', 'car-front', ['gettingaround', 'maps', 'cars'],
  ['Google Maps', 'Apple Maps', 'Waze', 'Uber', 'Lyft', 'Waymo', 'Transit', 'Tesla', 'Lime', 'Amtrak']),
 ('shopping', 'Shopping', 'shopping-bag', ['shopping'], None),
 ('fashion', 'Fashion', 'shirt', ['fashion', 'beauty'],
  ['Nike', 'ZARA', 'UNIQLO', 'H&M', 'SSENSE', 'StockX', 'Depop', 'lululemon', 'Sephora', 'Ulta Beauty']),
 ('fitness', 'Fitness', 'dumbbell', ['fitness'], None),
 ('health', 'Health', 'heart-pulse', ['health', 'wellbeing', 'sleep', 'healthcare'],
  ['Oura', 'WHOOP', 'Fitbit', 'MyFitnessPal', 'Calm', 'Headspace', 'Sleep Cycle', 'Flo', 'MyChart', 'CVS']),
 ('home', 'Home', 'sofa', ['home', 'housing'],
  ['Zillow', 'Redfin', 'Apartments.com', 'Realtor.com', 'IKEA', 'The Home Depot', 'Wayfair', 'Lowe’s', 'Houzz', 'Thumbtack']),
 ('pets', 'Pets', 'paw-print', ['pets'], None),
 ('money', 'Money', 'wallet', ['money', 'investing'],
  ['Chase', 'Bank of America', 'Capital One', 'American Express', 'Venmo', 'Cash App', 'PayPal', 'Robinhood', 'Fidelity', 'Coinbase']),
 ('work', 'Work', 'briefcase', ['work', 'productivity', 'jobs'],
  ['Slack', 'Zoom', 'Microsoft Teams', 'Notion', 'Google Drive', 'Google Calendar', 'Microsoft Excel', 'Dropbox', 'LinkedIn', 'Indeed']),
 ('coding', 'Coding', 'code-xml', ['coding'], None),
 ('tools', 'Tools', 'wrench', ['tools', 'web'],
  ['Chrome', 'Firefox', 'DuckDuckGo', 'Brave', 'Shortcuts', 'Files', 'Translate', 'Speedtest', 'Adobe Scan', 'Truecaller']),
 ('weather', 'Weather', 'cloud-sun', ['weather'], None),
]
assert len(P) == 40, len(P)
assert sum(1 for p in P[:8]) == 8
cats, apps, glyphs, used = [], [], [], set()
for key, name, glyph, srcs, names in P:
    pool = [a for a in d['apps'] if a['cat'] in srcs]
    if names is None: pick = [a for a in d['apps'] if a['cat'] == srcs[0]]
    else:
        pick = []
        for n in names:
            m = [a for a in pool if a['name'] == n]
            assert len(m) == 1, (key, n, len(m))
            pick.append(m[0])
    assert len(pick) == 10, (key, len(pick))
    ids = [a['app_store_id'] for a in pick]; assert not (set(ids) & used), key; used |= set(ids)
    st = []
    for s in srcs:
        for x in old[s]['appStore']:
            if x not in st: st.append(x)
    cats.append({'k': key, 'name': name, 'appStore': st, 'from': srcs})
    glyphs.append([key, glyph])
    for j, a in enumerate(pick):
        b = dict(a); b['key'] = f'{key}-{j}'; b['cat'] = key; b['v7cell'] = a['cell']; b['cell'] = len(apps); apps.append(b)
allst = sorted({x for c in d['cats'] for x in c['appStore']}); cov = sorted({x for c in cats for x in c['appStore']})
print('App Store categories covered', len(cov), 'of', len(allst), 'missing', sorted(set(allst) - set(cov)))
json.dump({'cats': cats, 'apps': apps, 'glyphs': glyphs}, open(sys.argv[1], 'w'), ensure_ascii=False, indent=1)
print(len(cats), 'cats', len(apps), 'apps')

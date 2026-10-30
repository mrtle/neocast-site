"""The question bank for the Start from scratch game (Martin, Oct 29 2026).

An Akinator-style game that maps a person's whole life without connecting anything: forty life areas (the map's
forty), the 600 apps from Get A Headstart, people and titles from the Tastebud graph's artwork, foods, places,
activities and things as Microsoft Fluent 3D emoji (MIT), facts (diet, allergies, pets, home, life stage) and a
few traits. Broad to narrow: first instincts, your world, your lanes (only the areas that light up), your edges,
the reading. The engine (assets/play/engine.mjs) picks each next card by what it would learn, makes guesses and
weighs answers by how fast they came.

Run: python3 source/play/bank.py   (writes assets/play/bank.json, copies the emoji and artwork it uses)
Sources it reads: assets/connect.json (the 600 apps), source/apps.json (the map's 40 areas and glyph cells),
the Fluent 3D emoji package (npm @lobehub/fluent-emoji-3d, MIT) and the Tastebud artwork from the neocast repo.
"""
import json, os, re, shutil, sys, pathlib, hashlib

S = pathlib.Path(__file__).resolve().parent
R = S.parent.parent
EMOJI_DIR = pathlib.Path(os.environ.get('FLUENT_DIR', '/tmp/claude-0/fe/package/assets'))
NEOCAST = pathlib.Path(os.environ.get('NEOCAST_REPO', '/home/claude/neocast'))
ART_JSON = NEOCAST / 'apps/neocast/src/tastebud/art.json'
ART_DIR = NEOCAST / 'apps/neocast/public'
OUT = R / 'assets/play'
BANK_VERSION = '2026-10-29.1'

connect = json.loads((R / 'assets/connect.json').read_text())
mapcats = {c['k']: c for c in json.loads((R / 'source/apps.json').read_text())['cats']}
art = json.loads(ART_JSON.read_text())

# ---------------------------------------------------------------------------------------------------------------
# The forty areas: key, name, the 600-app categories they hold, prior (how many people this area is part of life
# for, a rough share), ring on the map, a one-word "miss" noun and the give-up line for "would you rather" duels.
AREAS = [
  ('movies', 'Movies', ['movies'], .82, 'movies', 'never watch a movie again', '🍿'),
  ('tv', 'TV', ['tv'], .85, 'TV shows', 'never watch another TV show', '📺'),
  ('music', 'Music', ['music'], .92, 'music', 'never hear music again', '🎧'),
  ('games', 'Games', ['games'], .55, 'games', 'never play a game again', '🎮'),
  ('sports', 'Sports', ['sports'], .5, 'sports', 'never watch sports again', '🏆'),
  ('creators', 'Creators', ['creators'], .72, 'YouTube and creators', 'lose YouTube and every creator you follow', '▶️'),
  ('social', 'Social', ['social', 'messaging'], .9, 'your group chats and feeds', 'delete every social app', '💬'),
  ('ai', 'AI', ['ai'], .42, 'AI', 'never use an AI again', '✨'),
  ('livetv', 'Live TV', ['livetv'], .3, 'live TV', 'lose live TV', '📡'),
  ('podcasts', 'Podcasts', ['podcasts'], .5, 'podcasts', 'never hear another podcast', '🎙️'),
  ('radio', 'Radio', ['radio'], .3, 'the radio', 'lose the radio', '📻'),
  ('books', 'Books', ['books'], .5, 'books', 'never read another book', '📚'),
  ('audiobooks', 'Audiobooks', ['audiobooks'], .25, 'audiobooks', 'lose audiobooks', '🎧'),
  ('filmmaking', 'Filmmaking', ['filmmaking'], .14, 'making videos', 'never make a video again', '🎬'),
  ('musicproduction', 'Music production', ['musicproduction'], .1, 'making music', 'never make music again', '🎹'),
  ('news', 'News', ['news'], .55, 'the news', 'never read the news again', '📰'),
  ('events', 'Events', ['events'], .42, 'going out', 'never go to another party', '🎉'),
  ('concerts', 'Concerts', ['concerts'], .42, 'concerts', 'never go to another concert', '🎤'),
  ('festivals', 'Festivals', ['festivals'], .18, 'festivals', 'never go to a festival', '🎪'),
  ('themeparks', 'Theme parks', ['themeparks'], .28, 'theme parks', 'never ride a roller coaster again', '🎢'),
  ('photos', 'Photos', ['photos'], .6, 'your photos', 'lose your camera roll', '📸'),
  ('design', 'Design', ['design', 'art'], .24, 'making things', 'never draw or design again', '🎨'),
  ('learning', 'Learning', ['learning', 'school', 'knowledge'], .5, 'learning new things', 'stop learning anything new', '🎓'),
  ('languages', 'Languages', ['languages'], .2, 'languages', 'never learn another language', '🗣️'),
  ('family', 'Family', ['family', 'kids'], .5, 'family time', 'skip every family get-together', '🏡'),
  ('dating', 'Dating', ['dating'], .2, 'dating', 'give up dating apps forever', '💘'),
  ('food', 'Food', ['restaurants', 'fooddelivery', 'cooking', 'groceries'], .96, 'good food', 'eat the same plain meal every day', '🍜'),
  ('travel', 'Travel', ['travel', 'outdoors'], .66, 'travel', 'never leave your city again', '✈️'),
  ('gettingaround', 'Getting around', ['gettingaround', 'maps', 'cars'], .86, 'getting around', 'lose your car and every ride app', '🚗'),
  ('shopping', 'Shopping', ['shopping'], .85, 'shopping', 'never shop online again', '🛍️'),
  ('fashion', 'Fashion', ['fashion', 'beauty'], .5, 'your style', 'wear the same outfit every day', '👟'),
  ('fitness', 'Fitness', ['fitness'], .5, 'working out', 'never work out again', '🏋️'),
  ('health', 'Health', ['health', 'wellbeing', 'sleep', 'healthcare'], .55, 'your health routines', 'drop every health habit', '🫀'),
  ('home', 'Home', ['home', 'housing'], .5, 'your space', 'never change a thing at home', '🛋️'),
  ('pets', 'Pets', ['pets'], .45, 'pets', 'never have a pet', '🐾'),
  ('money', 'Money', ['money', 'investing'], .85, 'money', 'never check your money again', '💸'),
  ('work', 'Work', ['work', 'productivity', 'jobs'], .72, 'work', 'quit working for good', '💼'),
  ('coding', 'Coding', ['coding'], .12, 'coding', 'never write code again', '💻'),
  ('tools', 'Tools', ['tools', 'web'], .5, 'your tools', 'lose every tool on your phone', '🧰'),
  ('weather', 'Weather', ['weather'], .7, 'the weather', 'never check the weather again', '⛅'),
]
assert len(AREAS) == 40 and all(a[0] in mapcats for a in AREAS)
AREA = {a[0]: a for a in AREAS}
SRC2AREA = {s: a[0] for a in AREAS for s in a[2]}

# ---------------------------------------------------------------------------------------------------------------
# Traits: k, label when high, label when low. Used for readings, guesses and the archetype.
TRAITS = [  # key, label high, label low, "you're…" high, "you're…" low
  ('night', 'Night owl', 'Early bird', 'a night owl', 'an early bird'),
  ('social', 'Out with people', 'Homebody', 'out with people every chance you get', 'a homebody at heart'),
  ('novel', 'Always something new', 'Comfort and rewatches', 'always after something new', 'loyal to your comfort picks'),
  ('plan', 'Planner', 'Wings it', 'a planner', 'happy to wing it'),
  ('spend', 'Treats yourself', 'Saver', 'not shy about treating yourself', 'a saver'),
  ('active', 'Always moving', 'Takes it easy', 'always moving', 'happiest taking it easy'),
  ('city', 'City energy', 'Nature calm', 'a city person', 'calmer out in nature'),
  ('thrill', 'Thrill seeker', 'Plays it safe', 'a thrill seeker', 'someone who plays it safe'),
  ('mainstream', 'Knows what’s big', 'Off the beaten path', 'always on what’s big right now', 'off the beaten path'),
  ('screen', 'Always online', 'Mostly offline', 'always online', 'mostly offline'),
  ('create', 'Maker', 'Watcher', 'a maker', 'more of a watcher than a maker'),
  ('compete', 'Competitive', 'Just for fun', 'competitive', 'in it just for fun'),
  ('intense', 'Dark and intense', 'Light and feel-good', 'into dark and intense', 'all about light and feel-good'),
  ('learn', 'Always learning', 'Switches off', 'always learning something', 'great at switching off'),
  ('luxe', 'Premium everything', 'Practical', 'premium everything', 'practical first'),
  ('health', 'Health first', 'Indulgent', 'health first', 'happily indulgent'),
  ('foodie', 'Adventurous eater', 'Knows what they like', 'an adventurous eater', 'someone who knows what they like to eat'),
  ('tech', 'Early adopter', 'Late to new tech', 'an early adopter', 'in no rush for new tech'),
  ('nostalgia', 'Nostalgic', 'Lives in the now', 'nostalgic', 'living in the now'),
]
TRAIT = {t[0]: t for t in TRAITS}

# Archetypes (drafted names): a centroid over traits (t) and areas (a). The closest wins.
ARCHETYPES = [
  ('night-creative', 'The Night Owl Creative', 'Up late, making things, with a playlist nobody else has heard.',
   {'night': .8, 'create': .8, 'mainstream': -.3}, {'design': .7, 'photos': .5, 'musicproduction': .6, 'filmmaking': .6, 'music': .6}),
  ('weekend-explorer', 'The Weekend Explorer', 'If there’s a trail, a flight or a new spot, you’re already on it.',
   {'active': .7, 'novel': .7, 'thrill': .5, 'city': -.2}, {'travel': .9, 'fitness': .5, 'food': .5}),
  ('cozy-curator', 'The Cozy Curator', 'Blanket, a perfect rewatch and snacks you’d defend with your life.',
   {'social': -.7, 'novel': -.6, 'intense': -.3}, {'tv': .8, 'movies': .6, 'books': .5, 'food': .5}),
  ('social-spark', 'The Social Spark', 'The group chat runs on you. So does the weekend.',
   {'social': .9, 'night': .4, 'spend': .3}, {'events': .9, 'concerts': .6, 'food': .6, 'social': .7, 'dating': .3}),
  ('competitor', 'The Competitor', 'Ranked, timed or scored. You play to win.',
   {'compete': .9, 'active': .5, 'intense': .3}, {'sports': .9, 'games': .7, 'fitness': .6}),
  ('planner', 'The Planner', 'Spreadsheets for vacations. Budgets that actually work.',
   {'plan': .9, 'spend': -.5, 'learn': .3}, {'money': .8, 'work': .6, 'travel': .4}),
  ('main-character', 'The Main Character', 'Good fits, good lighting, better stories.',
   {'luxe': .7, 'social': .6, 'spend': .6, 'mainstream': .4}, {'fashion': .9, 'social': .7, 'events': .5, 'photos': .5}),
  ('deep-diver', 'The Deep Diver', 'Three podcasts deep and a Wikipedia tab you’ll never close.',
   {'learn': .9, 'novel': .3, 'mainstream': -.3}, {'podcasts': .8, 'books': .7, 'news': .6, 'learning': .8}),
  ('homebody-gamer', 'The Homebody Gamer', 'Headset on, snacks close, one more match.',
   {'screen': .8, 'social': -.4, 'compete': .4, 'night': .5}, {'games': 1, 'creators': .6}),
  ('wellness', 'The Wellness Seeker', 'Sleep score, step count and a smoothie that took twenty minutes.',
   {'health': .9, 'active': .6, 'night': -.5}, {'fitness': .8, 'health': .9, 'food': .3}),
  ('trend-hunter', 'The Trend Hunter', 'You knew about it first. Then everyone else found out.',
   {'novel': .8, 'mainstream': .5, 'screen': .6}, {'creators': .7, 'social': .8, 'shopping': .6, 'fashion': .4}),
  ('old-soul', 'The Old Soul', 'Records, paperbacks and a strong opinion about the classics.',
   {'mainstream': -.6, 'novel': -.4, 'screen': -.5}, {'books': .7, 'radio': .5, 'music': .5, 'movies': .4}),
  ('builder', 'The Builder', 'Side projects, tabs of docs and a tool for everything.',
   {'create': .8, 'learn': .7, 'plan': .4}, {'coding': .9, 'ai': .8, 'work': .6, 'tools': .5}),
  ('homemaker', 'The Nest Builder', 'Plants watered, dinner planned, people you love around the table.',
   {'plan': .4, 'social': .1, 'health': .3}, {'home': .9, 'family': .8, 'pets': .6, 'food': .6}),
]

# ---------------------------------------------------------------------------------------------------------------
# Apps: the 600 from Get A Headstart. Popularity share within the area (index order is roughly by size), plus tags
# the engine uses for guesses: apple / google / samsung, young / older, premium / budget.
POP_OVERRIDE = {
  'YouTube': .86, 'Instagram': .62, 'TikTok': .5, 'Facebook': .52, 'WhatsApp': .35, 'Snapchat': .32, 'X': .26, 'Reddit': .3,
  'Spotify': .52, 'Apple Music': .3, 'YouTube Music': .18, 'Amazon Music': .15, 'Pandora': .12, 'Netflix': .72, 'Prime Video': .55,
  'Disney+': .45, 'HBO Max': .35, 'Hulu': .4, 'Apple TV': .25, 'Peacock': .25, 'Paramount+': .22, 'Tubi': .2,
  'Amazon Shopping': .85, 'Target': .45, 'Walmart': .5, 'Costco': .35, 'Google Maps': .78, 'Apple Maps': .4, 'Waze': .3, 'Uber': .55, 'Lyft': .3,
  'DoorDash': .45, 'Uber Eats': .35, 'Instacart': .25, 'Starbucks': .38, 'McDonald’s': .4, 'Chipotle': .25, 'Yelp': .3,
  'Venmo': .5, 'Cash App': .38, 'PayPal': .55, 'Chase': .35, 'Bank of America': .25, 'Capital One': .25, 'Robinhood': .15,
  'ChatGPT': .45, 'Gemini': .18, 'Claude': .07, 'Copilot': .08, 'Meta AI': .1, 'Perplexity': .06,
  'Messenger': .45, 'Discord': .25, 'Telegram': .1, 'Signal': .08, 'GroupMe': .1, 'Threads': .15, 'BeReal': .06, 'Pinterest': .35,
  'Find My': .45, 'Life360': .15, 'Duolingo': .22, 'Canva': .2, 'Google Photos': .4, 'LinkedIn': .4, 'Zoom': .45, 'Slack': .25,
  'Microsoft Teams': .25, 'Google Drive': .45, 'Google Calendar': .35, 'Gmail': .6, 'ESPN': .35, 'Roblox': .14, 'Minecraft': .14,
  'Airbnb': .35, 'Booking.com': .15, 'Expedia': .15, 'The Weather Channel': .3, 'Weather': .5, 'Chrome': .55, 'Google': .5,
  'Wikipedia': .2, 'Strava': .1, 'Nike Run Club': .08, 'Peloton': .05, 'MyFitnessPal': .1, 'Calm': .08, 'Headspace': .07,
  'Hinge': .08, 'Tinder': .08, 'Bumble': .06, 'Zillow': .25, 'Chewy': .12, 'Ticketmaster': .3, 'Audible': .12, 'Kindle': .2,
  'Apple Podcasts': .3, 'Apple News': .18, 'CNN': .12, 'The New York Times': .12, 'Fandango': .1, 'IMDb': .15, 'Letterboxd': .05,
  'PlayStation App': .12, 'Xbox': .1, 'Steam': .1, 'Nintendo Switch App': .08, 'Twitch': .1, 'Patreon': .05, 'Substack': .06,
  'CapCut': .15, 'iMovie': .1, 'GarageBand': .06, 'Coinbase': .08, 'Fidelity': .1, 'Shop': .12, 'Etsy': .15, 'eBay': .2,
  'Best Buy': .15, 'Apple Store': .15, 'Nike': .15, 'Sephora': .12, 'Ulta Beauty': .1, 'IKEA': .12, 'Home Depot': .12, 'The Home Depot': .12,
  'Disneyland': .06, 'My Disney Experience': .07, 'Tesla': .04, 'Speedtest': .12, 'Shortcuts': .1, 'Files': .2, 'Translate': .12,
  'Google Translate': .2, 'Notion': .08, 'Google Docs': .3, 'Microsoft Word': .2, 'Microsoft Excel': .2, 'Indeed': .12,
  'MyChart': .2, 'CVS': .2, 'Walgreens': .15, 'GoodRx': .08, 'Fitbit': .08, 'Oura': .03, 'WHOOP': .02, 'Sleep Cycle': .04,
  'Coursera': .05, 'Khan Academy': .05, 'MasterClass': .03, 'Quizlet': .08, 'Canvas': .1, 'Google Classroom': .06,
}
TAGS = {
  'apple': ['Apple TV', 'Apple Music', 'Apple Podcasts', 'Apple News', 'Apple Books', 'Apple Maps', 'Find My', 'Apple Store', 'iMovie', 'GarageBand', 'Freeform', 'Shortcuts', 'Files', 'Measure', 'Translate', 'Weather', 'Swift Playground', 'TestFlight', 'Halide', 'AutoSleep', 'Things 3', 'Pythonista', 'Working Copy', 'Textastic', 'Darkroom', 'Mercury Weather', 'CARROT Weather', 'Overcast', 'Castro'],
  'google': ['YouTube Music', 'Google Photos', 'Google Maps', 'Google Drive', 'Google Calendar', 'Google Docs', 'Gemini', 'Google Family Link', 'Google Classroom', 'Google Meet', 'Google', 'Google Translate', 'Google Arts & Culture', 'Chrome', 'Fitbit', 'Waze'],
  'samsung': ['Samsung Health', 'Samsung Food'],
  'young': ['TikTok', 'Snapchat', 'BeReal', 'Discord', 'Roblox', 'Lemon8', 'Kick', 'Character.AI', 'Depop', 'Partiful', 'Posh', 'StockX', 'CapCut', 'Edits', 'Captions', 'Quizlet', 'Canvas', 'Handshake', 'Google Classroom', 'Photomath', 'Fortnite', 'Twitch', 'Cash App', 'Venmo', 'Hinge', 'Weee!', 'Beli', 'Luma', 'DICE', 'Shotgun', 'Lime', 'Bird', 'VSCO', 'Unfold', 'Pinterest', 'Spotify', 'SoundCloud', 'Audiomack', 'Duolingo', 'Grindr', 'Tinder', 'Bumble'],
  'older': ['Facebook', 'Messenger', 'Pandora', 'NBC', 'PBS', 'DIRECTV', 'Weather Underground', 'The Weather Channel', 'MapQuest', 'Evite', 'Paperless Post', 'Match', 'Plenty of Fish', 'Monster', 'Allrecipes', 'Cozi', 'BabyCenter', 'Huckleberry', 'Life360', 'Walgreens', 'CVS', 'MyChart', 'Kaiser Permanente', 'UnitedHealthcare', 'AARP', 'Vanguard', 'Charles Schwab', 'Fidelity', 'E*TRADE', 'Wells Fargo', 'Bank of America', 'Macy’s', 'Pottery Barn', 'Williams Sonoma', 'Crate & Barrel', 'Rocket Mortgage', 'Realtor.com', 'Zillow', 'Fox Sports', 'FOX Sports', 'Bloomberg', 'The Wall Street Journal', 'The Washington Post', 'The Atlantic', 'AP News', 'NPR', 'SiriusXM', 'iHeart', 'Audacy', 'Microsoft Teams', 'Webex'],
  'premium': ['TIDAL', 'Qobuz', 'SSENSE', 'Raya', 'The League', 'Resy', 'Tock', 'MICHELIN Guide', 'Equinox', 'Tonal', 'Peloton', 'Alo Wellness Club', 'WHOOP', 'Oura', 'One Medical', 'American Express', 'Marriott Bonvoy', 'Hilton Honors', 'Delta', 'Whole Foods Market', 'Caviar', 'Rivian', 'Tesla', 'Waymo', 'Nordstrom', 'Williams Sonoma', 'Crate & Barrel', 'West Elm', 'Pottery Barn', 'Wealthfront', 'Arc Search', 'Things 3', 'Halide'],
  'budget': ['Tubi', 'Pluto TV', 'Xumo Play', 'Frndly TV', 'Philo', 'ALDI', 'Walmart', 'Costco', 'GasBuddy', 'Chime', 'Cash App', 'Snagajob', 'Plenty of Fish', 'hoopla', 'Libby', 'H&M', 'Temu', 'Shein', 'Hopper', 'FlixBus', 'Slice', 'Domino’s', 'Pizza Hut', 'McDonald’s', 'GoodRx', 'Acorns'],
}
SHARE = [.42, .3, .24, .19, .15, .12, .1, .085, .07, .06]
apps = []
for a in connect['apps']:
    area = SRC2AREA[a['c']]
    idx = int(a['k'].rsplit('-', 1)[1])
    pop = POP_OVERRIDE.get(a['n'], SHARE[idx] * (0.7 + 0.6 * AREA[area][3]))
    tags = [t for t, names in TAGS.items() if a['n'] in names]
    apps.append({'k': a['k'], 'n': a['n'], 'area': area, 'cell': a['cell'], 'pop': round(pop, 3), 'tags': tags})
# each icon's own rim colour (the sphere it sits on in the map takes it), sampled from the 600-icon atlases
try:
    from PIL import Image
    G = connect['grid']; per = G['cols'] ** 2; atl = {}
    for a in apps:
        i = a['cell'] // per; c = a['cell'] % per
        if i not in atl: atl[i] = Image.open(R / f'assets/img/apps600/atlas-{i}.webp').convert('RGB')
        x0 = (c % G['cols']) * G['cell'] + G['gut'] + 6; y0 = (c // G['cols']) * G['cell'] + G['gut'] + 6; w = G['cell'] - 2 * G['gut'] - 12
        im = atl[i]; px = [im.getpixel((x0 + t, y0)) for t in range(0, w, 4)] + [im.getpixel((x0, y0 + t)) for t in range(0, w, 4)] + \
             [im.getpixel((x0 + w, y0 + t)) for t in range(0, w, 4)] + [im.getpixel((x0 + t, y0 + w)) for t in range(0, w, 4)]
        r_, g_, b_ = (sum(p[k] for p in px) // len(px) for k in range(3))
        a['color'] = '#%02x%02x%02x' % (r_, g_, b_)
except ImportError:
    pass
APPS = {a['k']: a for a in apps}
APP_BY_NAME = {}
for a in apps: APP_BY_NAME.setdefault(a['n'], a['k'])

def appk(name):
    assert name in APP_BY_NAME, ('no app', name)
    return APP_BY_NAME[name]

# ---------------------------------------------------------------------------------------------------------------
# Images. ('e', '🍣') = a Fluent 3D emoji; ('art', 'music:taylor-swift') = the Tastebud graph's artwork; ('app', name).
fluent = set(p.stem for p in EMOJI_DIR.glob('*.webp'))
used_emoji, used_art = {}, {}
def ecode(ch):
    cps = [f'{ord(x):x}' for x in ch]
    for c in ('-'.join(cps), '-'.join(x for x in cps if x != 'fe0f'), '-'.join(x for x in cps if x != 'fe0f') + '-fe0f'):
        if c in fluent: return c
    raise SystemExit(f'missing emoji {ch} {cps}')
def E(ch):
    c = ecode(ch); used_emoji[c] = ch; return 'e/' + c
def A(eid):
    v = art.get(eid)
    assert v and v.get('src', '').startswith('/taste-art/'), ('no local art', eid)
    name = v['src'].rsplit('/', 1)[1]
    used_art[eid] = {'file': name, 'title': v.get('title'), 'source': v.get('source'), 'provider': v.get('provider'), 'license': v.get('license')}
    return 'art/' + name

# ---------------------------------------------------------------------------------------------------------------
# Items: things people react to. kind decides the answer labels. pop = how widely known (0..1, for "never heard").
# fx: effects when loved (scaled by the answer): a = areas, t = traits, g = age buckets (z 2000s, y 90s, x 80s, o older)
ITEMS = []
def item(iid, n, kind, area, img, pop=.6, a=None, t=None, g=None, link=None):
    ITEMS.append({'id': iid, 'n': n, 'kind': kind, 'area': area, 'img': img, 'pop': pop,
                  'fx': {k: v for k, v in (('a', a or {}), ('t', t or {}), ('g', g or {})) if v}, **({'link': link} if link else {})})

def person(eid, n, area, pop=.7, a=None, t=None, g=None, kind=None):
    item(eid, n, kind or eid.split(':')[0], area, A(eid), pop, a, t, g)

# Music (the artists with local photos)
for eid, n, pop, t, g in [
  ('music:taylor-swift', 'Taylor Swift', .99, {'mainstream': .7}, {'z': .3, 'y': .3}),
  ('music:drake', None, 0, None, None),
]:
    if n: person(eid, n, 'music', pop, {'music': .5, 'concerts': .2}, t, g)
MUSIC = [
  ('music:bad-bunny', 'Bad Bunny', .9, {'mainstream': .5, 'social': .3}, {'z': .3, 'y': .2}),
  ('music:sza', 'SZA', .85, {'night': .3}, {'z': .3, 'y': .3}),
  ('music:kendrick-lamar', 'Kendrick Lamar', .92, {'intense': .3}, {'y': .3, 'z': .2}),
  ('music:the-weeknd', 'The Weeknd', .93, {'night': .4}, {'y': .3, 'z': .2}),
  ('music:olivia-rodrigo', 'Olivia Rodrigo', .85, {}, {'z': .6}),
  ('music:travis-scott', 'Travis Scott', .85, {'thrill': .3}, {'z': .4, 'y': .2}),
  ('music:blackpink', 'BLACKPINK', .75, {'novel': .2}, {'z': .5}),
  ('music:bts', 'BTS', .85, {}, {'z': .5}),
  ('music:harry-styles', 'Harry Styles', .9, {}, {'z': .4, 'y': .2}),
  ('music:chappell-roan', 'Chappell Roan', .6, {'novel': .4}, {'z': .6}),
  ('music:sabrina-carpenter', 'Sabrina Carpenter', .8, {}, {'z': .6}),
  ('music:frank-ocean', 'Frank Ocean', .75, {'mainstream': -.3, 'night': .3}, {'y': .4, 'z': .2}),
  ('music:dua-lipa', 'Dua Lipa', .85, {'social': .3}, {'z': .3, 'y': .3}),
  ('music:post-malone', 'Post Malone', .88, {}, {'y': .3, 'z': .2}),
  ('music:bruno-mars', 'Bruno Mars', .95, {'intense': -.3}, {'y': .3, 'x': .2}),
  ('music:tyler-the-creator', 'Tyler, the Creator', .75, {'create': .3, 'mainstream': -.2}, {'z': .4, 'y': .2}),
  ('music:doja-cat', 'Doja Cat', .8, {}, {'z': .4}),
  ('music:nicki-minaj', 'Nicki Minaj', .9, {}, {'y': .4}),
  ('music:lady-gaga', 'Lady Gaga', .97, {}, {'y': .4, 'x': .2}),
  ('music:morgan-wallen', 'Morgan Wallen', .8, {'city': -.5}, {'y': .3, 'z': .2}),
  ('music:luke-combs', 'Luke Combs', .7, {'city': -.5}, {'y': .3, 'x': .2}),
  ('music:karol-g', 'Karol G', .7, {'social': .3}, {'z': .3, 'y': .3}),
  ('music:shakira', 'Shakira', .95, {'social': .2}, {'x': .3, 'y': .3}),
  ('music:noah-kahan', 'Noah Kahan', .55, {'city': -.3, 'intense': .1}, {'z': .4, 'y': .2}),
  ('music:lana-del-rey', 'Lana Del Rey', .8, {'nostalgia': .3, 'intense': .3}, {'y': .3, 'z': .3}),
  ('music:coldplay', 'Coldplay', .97, {'mainstream': .5}, {'x': .3, 'y': .3}),
  ('music:queen', 'Queen', .98, {}, {'x': .3, 'o': .3}),
  ('music:peso-pluma', 'Peso Pluma', .55, {}, {'z': .6}),
  ('music:imagine-dragons', 'Imagine Dragons', .9, {'mainstream': .5}, {'y': .3, 'z': .2}),
  ('music:21-savage', '21 Savage', .7, {}, {'z': .5}),
  ('music:future', 'Future', .75, {'night': .3}, {'z': .3, 'y': .3}),
  ('music:zach-bryan', None, 0, None, None),
]
for eid, n, pop, t, g in MUSIC:
    if n: person(eid, n, 'music', pop, {'music': .45, 'concerts': .15}, t, g)

CREATORS = [
  ('creator:mrbeast', 'MrBeast', .95, {'mainstream': .5}, {'z': .6}),
  ('creator:emma-chamberlain', 'Emma Chamberlain', .7, {'luxe': .2}, {'z': .6}),
  ('creator:marques-brownlee', 'Marques Brownlee', .75, {'learn': .4, 'luxe': .2}, {'y': .4, 'z': .2}),
  ('creator:mark-rober', 'Mark Rober', .75, {'learn': .5, 'create': .3}, {'y': .3, 'z': .3}),
  ('creator:ishowspeed', 'IShowSpeed', .8, {'thrill': .3}, {'z': .8}),
  ('creator:pokimane', 'Pokimane', .65, {'compete': .2}, {'z': .5}),
  ('creator:dude-perfect', 'Dude Perfect', .8, {'compete': .5}, {'z': .5}),
  ('creator:binging-with-babish', 'Binging with Babish', .6, {'create': .3}, {'y': .4}),
  ('creator:nick-digiovanni', 'Nick DiGiovanni', .6, {}, {'z': .5}),
  ('creator:casey-neistat', 'Casey Neistat', .7, {'create': .4, 'city': .4}, {'y': .5}),
  ('creator:uncle-roger', 'Uncle Roger', .7, {'foodie': .3}, {'z': .3, 'y': .3}),
  ('creator:khaby-lame', 'Khaby Lame', .75, {}, {'z': .6}),
  ('creator:markiplier', 'Markiplier', .8, {'night': .2}, {'y': .4, 'z': .3}),
  ('creator:ryan-trahan', 'Ryan Trahan', .55, {'novel': .3}, {'z': .6}),
  ('creator:good-mythical-morning', 'Good Mythical Morning', .7, {}, {'y': .4}),
  ('creator:hasanabi', None, 0, None, None),
  ('creator:linus-tech-tips', 'Linus Tech Tips', .65, {'learn': .3}, {'y': .5}),
  ('creator:3blue1brown', '3Blue1Brown', .45, {'learn': .8, 'mainstream': -.4}, {'y': .4}),
  ('creator:corridor-crew', 'Corridor Crew', .5, {'create': .5}, {'y': .4, 'z': .3}),
  ('creator:logan-paul', 'Logan Paul', .9, {'thrill': .3}, {'z': .5}),
  ('creator:valkyrae', 'Valkyrae', .55, {'compete': .3}, {'z': .5}),
  ('creator:sidemen', 'Sidemen', .6, {'social': .3}, {'z': .6}),
]
for eid, n, pop, t, g in CREATORS:
    if n: person(eid, n, 'creators', pop, {'creators': .5}, t, g)

PEOPLE = [  # actors and other famous people (the Movies/TV lanes and the edges)
  ('person:zendaya', 'Zendaya', .92, 'movies', {}, {'z': .5}),
  ('person:timothee-chalamet', 'Timothée Chalamet', .85, 'movies', {}, {'z': .5, 'y': .2}),
  ('person:pedro-pascal', 'Pedro Pascal', .85, 'tv', {}, {'y': .3, 'z': .2}),
  ('person:ryan-gosling', 'Ryan Gosling', .9, 'movies', {}, {'y': .4}),
  ('person:leonardo-dicaprio', 'Leonardo DiCaprio', .97, 'movies', {}, {'y': .3, 'x': .3}),
  ('person:tom-cruise', 'Tom Cruise', .97, 'movies', {'thrill': .4}, {'x': .4, 'o': .2}),
  ('person:tom-holland', 'Tom Holland', .9, 'movies', {}, {'z': .5}),
  ('person:robert-downey-jr', 'Robert Downey Jr.', .95, 'movies', {}, {'y': .3, 'x': .3}),
  ('person:ryan-reynolds', 'Ryan Reynolds', .95, 'movies', {'intense': -.3}, {'y': .4}),
  ('person:kim-kardashian', 'Kim Kardashian', .97, 'tv', {'luxe': .5, 'mainstream': .5}, {'y': .4}),
  ('person:meghan-markle', None, 0, 'tv', {}, {}),
]
for eid, n, pop, area, t, g in PEOPLE:
    if n: person(eid, n, area, pop, {area: .35}, t, g, kind='person')

SHOWS = [  # TV with local artwork
  ('show:friends-1994', 'Friends', .98, {'novel': -.4, 'intense': -.5}, {'y': .3, 'x': .3}),
  ('show:the-office-2005', 'The Office', .95, {'novel': -.5, 'intense': -.5}, {'y': .5, 'z': .2}),
  ('show:stranger-things-2016', 'Stranger Things', .95, {'nostalgia': .3}, {'z': .4, 'y': .3}),
  ('show:squid-game-2021', 'Squid Game', .9, {'intense': .6, 'thrill': .3}, {'z': .4, 'y': .3}),
  ('show:breaking-bad-2008', 'Breaking Bad', .92, {'intense': .7}, {'y': .4, 'x': .3}),
  ('show:game-of-thrones-2011', 'Game of Thrones', .95, {'intense': .6}, {'y': .4, 'x': .3}),
  ('show:the-bear-2022', 'The Bear', .7, {'intense': .4, 'foodie': .3}, {'y': .5}),
  ('show:severance-2022', 'Severance', .6, {'intense': .4, 'mainstream': -.2}, {'y': .4}),
  ('show:euphoria-2019', 'Euphoria', .8, {'intense': .6}, {'z': .7}),
  ('show:bridgerton-2020', 'Bridgerton', .85, {'intense': -.3}, {'y': .4, 'z': .3}),
  ('show:love-island-usa-2019', 'Love Island USA', .7, {'social': .3, 'mainstream': .4, 'intense': -.4}, {'z': .7}),
  ('show:the-kardashians-2022', 'The Kardashians', .9, {'luxe': .4, 'mainstream': .5}, {'y': .4, 'z': .3}),
  ('show:selling-sunset-2019', 'Selling Sunset', .7, {'luxe': .5}, {'y': .5}),
  ('show:survivor-2000', 'Survivor', .9, {'compete': .5}, {'x': .4, 'y': .3}),
  ('show:the-last-of-us-2023', 'The Last of Us', .85, {'intense': .6}, {'y': .4, 'z': .3}),
  ('show:wednesday-2022', 'Wednesday', .85, {'intense': .2}, {'z': .7}),
  ('show:succession-2018', 'Succession', .7, {'intense': .4, 'luxe': .3}, {'y': .4, 'x': .3}),
  ('show:the-white-lotus-2021', 'The White Lotus', .75, {'luxe': .3, 'intense': .3}, {'y': .5}),
  ('show:ted-lasso-2020', 'Ted Lasso', .8, {'intense': -.6}, {'y': .4, 'x': .3}),
  ('show:greys-anatomy-2005', 'Grey’s Anatomy', .9, {'novel': -.3}, {'y': .4, 'x': .3}),
  ('show:suits-2011', 'Suits', .85, {'luxe': .3}, {'y': .5}),
  ('show:the-boys-2019', 'The Boys', .8, {'intense': .7}, {'y': .4, 'z': .3}),
  ('show:bluey-2018', 'Bluey', .65, {'intense': -.8}, {'y': .5}),
  ('show:the-great-british-bake-off-2010', 'The Great British Bake Off', .75, {'intense': -.7, 'foodie': .3}, {'y': .4, 'x': .3}),
  ('show:rupauls-drag-race-2009', 'RuPaul’s Drag Race', .75, {'social': .3}, {'y': .5}),
  ('show:one-piece-1999', 'One Piece', .8, {'mainstream': -.1}, {'z': .6}),
  ('show:demon-slayer-2019', 'Demon Slayer', .75, {}, {'z': .7}),
  ('show:gilmore-girls-2000', 'Gilmore Girls', .8, {'novel': -.5, 'intense': -.5}, {'y': .5, 'x': .2}),
  ('show:peaky-blinders-2013', 'Peaky Blinders', .75, {'intense': .5}, {'y': .5}),
  ('show:shark-tank-2009', 'Shark Tank', .85, {'learn': .3}, {'y': .3, 'x': .4}),
  ('show:the-bachelor-2002', 'The Bachelor', .9, {'mainstream': .5}, {'y': .4, 'x': .3}),
  ('show:queer-eye-2018', 'Queer Eye', .7, {'intense': -.6}, {'y': .5}),
]
for eid, n, pop, t, g in SHOWS:
    item(eid, n, 'show', 'tv', A(eid), pop, {'tv': .4}, t, g)

MOVIES = [
  ('movie:spirited-away-2001', 'Spirited Away', .8, {'mainstream': -.2, 'novel': .2}, {'y': .4, 'z': .3}),
  ('movie:the-wolf-of-wall-street-2013', 'The Wolf of Wall Street', .9, {'luxe': .3, 'intense': .4}, {'y': .5}),
  ('movie:avatar-the-way-of-water-2022', 'Avatar: The Way of Water', .9, {'mainstream': .5}, {'y': .3, 'x': .3}),
  ('movie:twilight-2008', 'Twilight', .95, {'nostalgia': .4}, {'y': .6}),
  ('movie:your-name-2016', 'Your Name', .55, {'mainstream': -.3}, {'z': .6}),
  ('movie:the-big-short-2015', 'The Big Short', .75, {'learn': .4}, {'y': .4, 'x': .3}),
  ('movie:12-angry-men-1957', '12 Angry Men', .55, {'mainstream': -.4}, {'o': .5, 'x': .3}),
  ('franchise:star-wars', 'Star Wars', .99, {}, {'x': .3, 'y': .3}),
  ('franchise:harry-potter', 'Harry Potter', .99, {'nostalgia': .4}, {'y': .5, 'z': .3}),
  ('franchise:pokemon', 'Pokémon', .97, {'nostalgia': .4}, {'y': .4, 'z': .4}),
]
for eid, n, pop, t, g in MOVIES:
    kind = eid.split(':')[0]
    item(eid, n, kind, 'movies', A(eid), pop, {'movies': .4}, t, g)

GAMES = [
  ('game:minecraft-2011', 'Minecraft', .97, {'create': .4}, {'z': .6}),
  ('game:elden-ring-2022', 'Elden Ring', .7, {'intense': .5, 'compete': .3}, {'y': .4, 'z': .3}),
  ('game:the-sims-4-2014', 'The Sims 4', .9, {'create': .4, 'intense': -.4}, {'z': .3, 'y': .4}),
  ('game:valorant-2020', 'Valorant', .7, {'compete': .7}, {'z': .7}),
  ('game:league-of-legends-2009', 'League of Legends', .85, {'compete': .7}, {'z': .4, 'y': .4}),
  ('game:stardew-valley-2016', 'Stardew Valley', .75, {'intense': -.6}, {'z': .4, 'y': .3}),
  ('game:call-of-duty-warzone-2020', 'Call of Duty: Warzone', .9, {'compete': .6, 'intense': .4}, {'z': .3, 'y': .4}),
  ('game:the-legend-of-zelda-breath-of-the-wild-2017', 'Zelda: Breath of the Wild', .85, {'novel': .3}, {'z': .3, 'y': .4}),
  ('game:baldurs-gate-3-2023', 'Baldur’s Gate 3', .6, {'mainstream': -.2}, {'y': .5}),
  ('game:genshin-impact-2020', 'Genshin Impact', .7, {}, {'z': .7}),
  ('game:among-us-2018', 'Among Us', .9, {'social': .3}, {'z': .7}),
  ('game:red-dead-redemption-2-2018', 'Red Dead Redemption 2', .8, {'intense': .4}, {'y': .5}),
  ('game:pokemon-go-2016', 'Pokémon GO', .9, {'active': .3}, {'y': .4, 'z': .3}),
  ('game:rocket-league-2015', 'Rocket League', .7, {'compete': .5}, {'z': .5}),
  ('game:hogwarts-legacy-2023', 'Hogwarts Legacy', .75, {'nostalgia': .3}, {'z': .5}),
]
for eid, n, pop, t, g in GAMES:
    item(eid, n, 'game', 'games', A(eid), pop, {'games': .45}, t, g)

BOOKS = [
  ('book:atomic-habits-2018', 'Atomic Habits', .8, {'learn': .5, 'plan': .4}, {'y': .4, 'x': .3}),
  ('book:the-alchemist-1988', 'The Alchemist', .85, {'novel': .2}, {'y': .4, 'x': .3}),
  ('book:sapiens-2011', 'Sapiens', .75, {'learn': .6}, {'y': .4, 'x': .3}),
  ('book:it-ends-with-us-2016', 'It Ends with Us', .8, {'intense': .3}, {'y': .4, 'z': .4}),
  ('book:the-seven-husbands-of-evelyn-hugo-2017', 'The Seven Husbands of Evelyn Hugo', .7, {}, {'z': .5, 'y': .3}),
  ('book:the-great-gatsby-1925', 'The Great Gatsby', .95, {'luxe': .2}, {'x': .3, 'o': .3}),
  ('book:pride-and-prejudice-1813', 'Pride and Prejudice', .9, {'intense': -.3}, {'y': .3, 'x': .3}),
  ('book:the-psychology-of-money-2020', 'The Psychology of Money', .6, {'plan': .5, 'spend': -.4}, {'y': .5}),
  ('book:educated-2018', 'Educated', .65, {'learn': .4}, {'y': .3, 'x': .3}),
  ('book:the-midnight-library-2020', 'The Midnight Library', .6, {}, {'y': .4}),
  ('book:becoming-2018', 'Becoming', .8, {}, {'x': .4, 'y': .3}),
  ('book:the-love-hypothesis-2021', 'The Love Hypothesis', .5, {'intense': -.4}, {'z': .6}),
]
for eid, n, pop, t, g in BOOKS:
    item(eid, n, 'book', 'books', A(eid), pop, {'books': .5}, t, g)

PODS = [
  ('podcast:call-her-daddy-2018', 'Call Her Daddy', .75, {'social': .3}, {'z': .6}),
  ('podcast:new-heights-2022', 'New Heights', .6, {'compete': .3}, {'z': .4, 'y': .3}),
  ('podcast:huberman-lab-2021', 'Huberman Lab', .6, {'health': .6, 'learn': .5}, {'y': .5}),
  ('podcast:impaulsive-2018', 'Impaulsive', .6, {}, {'z': .7}),
]
for eid, n, pop, t, g in PODS:
    item(eid, n, 'podcast', 'podcasts', A(eid), pop, {'podcasts': .5}, t, g)

# Food (Fluent 3D). t: foodie = adventurous; health; g age hints rarely.
FOODS = [
  ('food:sushi', 'Sushi', '🍣', .95, {'foodie': .4, 'luxe': .1}),
  ('food:tacos', 'Tacos', '🌮', .98, {}),
  ('food:pizza', 'Pizza', '🍕', .99, {'foodie': -.2}),
  ('food:ramen', 'Ramen', '🍜', .9, {'foodie': .3}),
  ('food:burgers', 'Burgers', '🍔', .99, {'health': -.3}),
  ('food:curry', 'Curry', '🍛', .85, {'foodie': .4}),
  ('food:salad', 'A big salad', '🥗', .99, {'health': .6}),
  ('food:steak', 'Steak', '🥩', .97, {'luxe': .2}),
  ('food:oysters', 'Oysters', '🦪', .8, {'foodie': .6, 'luxe': .4}),
  ('food:avocado', 'Avocado', '🥑', .98, {'health': .3}),
  ('food:spicy', 'Really spicy food', '🌶️', .98, {'foodie': .5, 'thrill': .3}),
  ('food:olives', 'Olives', '🫒', .95, {'foodie': .4}),
  ('food:mushrooms', 'Mushrooms', '🍄', .98, {'foodie': .3}),
  ('food:blue-cheese', 'Stinky cheese', '🧀', .9, {'foodie': .5}),
  ('food:broccoli', 'Broccoli', '🥦', .99, {'health': .5}),
  ('food:dumplings', 'Dumplings', '🥟', .9, {'foodie': .2}),
  ('food:pasta', 'Pasta', '🍝', .99, {}),
  ('food:bubble-tea', 'Bubble tea', '🧋', .8, {}, {'z': .5}),
  ('food:fried-chicken', 'Fried chicken', '🍗', .99, {'health': -.4}),
  ('food:fondue', 'Fondue', '🫕', .7, {'luxe': .3}),
  ('food:croissant', 'A good croissant', '🥐', .95, {'luxe': .2}),
  ('food:donuts', 'Donuts', '🍩', .99, {'health': -.5}),
  ('food:fries', 'Fries', '🍟', .99, {'health': -.4}),
  ('food:hot-dog', 'Hot dogs', '🌭', .99, {'foodie': -.3}),
  ('food:wine', 'Wine', '🍷', .97, {'luxe': .3}, {'y': .2, 'x': .3}),
  ('food:beer', 'Beer', '🍺', .98, {'social': .2}),
  ('food:cocktails', 'Cocktails', '🍸', .97, {'social': .4, 'night': .2}),
  ('food:coffee', 'Coffee', '☕', .99, {'night': -.1}),
  ('food:chocolate', 'Chocolate', '🍫', .99, {'health': -.2}),
  ('food:ice-cream', 'Ice cream', '🍦', .99, {}),
  ('food:bento', 'Bento box', '🍱', .75, {'foodie': .3}),
  ('food:pancakes', 'Pancakes', '🥞', .99, {'night': -.2}),
]
for f in FOODS:
    iid, n, ch, pop, t = f[:5]; g = f[5] if len(f) > 5 else None
    item(iid, n, 'food', 'food', E(ch), pop, {'food': .35}, t, g)

PLACES = [
  ('place:japan', 'Japan', '🗾', {'novel': .4, 'foodie': .3}),
  ('place:paris', 'Paris', '🇫🇷', {'luxe': .3}),
  ('place:new-york', 'New York City', '🗽', {'city': .7}),
  ('place:tokyo', 'Tokyo at night', '🌃', {'city': .6, 'night': .3}),
  ('place:hawaii', 'Hawaii', '🏝️', {'active': .2}),
  ('place:las-vegas', 'Las Vegas', '🎰', {'thrill': .3, 'spend': .4, 'social': .4}),
  ('place:iceland', 'Iceland', '🌋', {'active': .5, 'city': -.4, 'novel': .4}),
  ('place:mexico', 'Mexico', '🇲🇽', {'foodie': .3}),
  ('place:italy', 'Italy', '🇮🇹', {'foodie': .4, 'luxe': .2}),
  ('place:london', 'London', '🇬🇧', {'city': .5}),
  ('place:korea', 'Seoul', '🇰🇷', {'city': .5, 'novel': .3}),
  ('place:national-park', 'A national park', '🏞️', {'active': .6, 'city': -.6}),
  ('place:ski-trip', 'A ski trip', '🎿', {'active': .6, 'thrill': .4, 'luxe': .2}),
  ('place:beach-resort', 'An all-inclusive resort', '🏖️', {'luxe': .4, 'active': -.3, 'plan': -.2}),
  ('place:road-trip', 'A long road trip', '🛣️', {'novel': .3, 'plan': -.2}),
  ('place:disney', 'Disney World', '🏰', {'nostalgia': .4}),
  ('place:camping', 'Camping', '🏕️', {'active': .5, 'city': -.6, 'luxe': -.6}),
  ('place:cruise', 'A cruise', '🛳️', {'luxe': .2, 'active': -.3}),
  ('place:festival', 'A music festival', '🎪', {'social': .6, 'thrill': .3, 'night': .3}),
  ('place:museum', 'A museum day', '🏛️', {'learn': .5, 'social': -.1}),
]
for iid, n, ch, t in PLACES:
    areas = {'travel': .4}
    if iid in ('place:disney',): areas['themeparks'] = .5
    if iid == 'place:festival': areas = {'festivals': .6, 'concerts': .2}
    if iid == 'place:museum': areas = {'learning': .25, 'design': .2}
    if iid == 'place:camping' or iid == 'place:national-park': areas['travel'] = .45
    item(iid, n, 'place', 'travel' if 'travel' in areas else list(areas)[0], E(ch), .9, areas, t)

ACTIVITIES = [
  ('activity:running', 'Running', '🏃', 'fitness', {'active': .7, 'health': .4}),
  ('activity:lifting', 'Lifting', '🏋️', 'fitness', {'active': .6, 'compete': .2}),
  ('activity:yoga', 'Yoga', '🧘', 'fitness', {'health': .6, 'active': .3, 'intense': -.3}),
  ('activity:cycling', 'Cycling', '🚴', 'fitness', {'active': .6}),
  ('activity:swimming', 'Swimming', '🏊', 'fitness', {'active': .5}),
  ('activity:climbing', 'Climbing', '🧗', 'fitness', {'active': .6, 'thrill': .5}),
  ('activity:hiking', 'Hiking', '🥾', 'travel', {'active': .6, 'city': -.5}),
  ('activity:surfing', 'Surfing', '🏄', 'fitness', {'active': .6, 'thrill': .5}),
  ('activity:pickleball', 'Pickleball', '🏓', 'sports', {'social': .3, 'compete': .3}),
  ('activity:basketball', 'Pickup basketball', '🏀', 'sports', {'compete': .5, 'active': .5}),
  ('activity:soccer', 'Soccer', '⚽', 'sports', {'compete': .5, 'active': .5}),
  ('activity:golf', 'Golf', '⛳', 'sports', {'luxe': .3, 'compete': .3}, {'x': .3, 'o': .2}),
  ('activity:dancing', 'Dancing', '💃', 'events', {'social': .6, 'night': .3}),
  ('activity:karaoke', 'Karaoke', '🎤', 'events', {'social': .6, 'thrill': .2}),
  ('activity:board-games', 'Board game night', '🎲', 'games', {'social': .4, 'compete': .3}),
  ('activity:chess', 'Chess', '♟️', 'games', {'learn': .4, 'compete': .4}),
  ('activity:cooking', 'Cooking from scratch', '🍳', 'food', {'create': .4, 'health': .2, 'plan': .2}),
  ('activity:baking', 'Baking', '🧁', 'food', {'create': .4}),
  ('activity:painting', 'Painting or drawing', '🎨', 'design', {'create': .8}),
  ('activity:photography', 'Photography', '📷', 'photos', {'create': .6}),
  ('activity:guitar', 'Playing an instrument', '🎸', 'musicproduction', {'create': .6}),
  ('activity:gardening', 'Gardening', '🪴', 'home', {'health': .2, 'night': -.3, 'city': -.3}),
  ('activity:thrifting', 'Thrifting', '🧥', 'fashion', {'spend': -.3, 'mainstream': -.3}),
  ('activity:skydiving', 'Skydiving', '🪂', 'travel', {'thrill': .9}),
  ('activity:roller-coasters', 'Roller coasters', '🎢', 'themeparks', {'thrill': .8}),
  ('activity:meditation', 'Meditation', '🧘‍♀️', 'health', {'health': .6, 'intense': -.3}),
  ('activity:journaling', 'Journaling', '📓', 'health', {'create': .3, 'plan': .3}),
  ('activity:volunteering', 'Volunteering', '🫶', 'family', {'social': .3}),
]
for f in ACTIVITIES:
    iid, n, ch, area, t = f[:5]; g = f[5] if len(f) > 5 else None
    a = {area: .4}
    if area == 'sports': a['fitness'] = .25
    item(iid, n, 'activity', area, E(ch), .95, a, t, g)

THINGS = [  # polarizing things for the edges
  ('thing:astrology', 'Astrology', '♈', 'learning', {'mainstream': .2}, {'z': .4}),
  ('thing:true-crime', 'True crime', '🔪', 'podcasts', {'intense': .7}),
  ('thing:reality-tv', 'Reality TV', '🌹', 'tv', {'intense': -.4, 'mainstream': .4}),
  ('thing:horror', 'Horror movies', '👻', 'movies', {'intense': .8, 'thrill': .5}),
  ('thing:anime', 'Anime', '🍥', 'tv', {'mainstream': -.1}, {'z': .5}),
  ('thing:musicals', 'Musicals', '🎭', 'movies', {'intense': -.3}),
  ('thing:crypto', 'Crypto', '🪙', 'money', {'thrill': .5, 'tech': .5, 'spend': .3}),
  ('thing:crocs', 'Crocs', '🩴', 'fashion', {'mainstream': .2}),
  ('thing:pineapple-pizza', 'Pineapple on pizza', '🍍', 'food', {'foodie': .2}),
  ('thing:cilantro', 'Cilantro', '🌿', 'food', {'foodie': .3}),
  ('thing:mondays', 'Brunch', '🥂', 'food', {'social': .5, 'spend': .3}),
  ('thing:vinyl', 'Vinyl records', '💿', 'music', {'mainstream': -.4, 'nostalgia': .5}),
  ('thing:marvel', 'Marvel movies', '🦸', 'movies', {'mainstream': .6}),
  ('thing:k-dramas', 'K-dramas', '🫰', 'tv', {'novel': .3}),
  ('thing:ai-art', 'AI-made art', '🤖', 'ai', {'tech': .5, 'novel': .3}),
  ('thing:smart-home', 'A smart home', '🏠', 'home', {'tech': .5}),
  ('thing:sneakers', 'Sneaker drops', '👟', 'fashion', {'spend': .4, 'mainstream': .2}, {'z': .5}),
  ('thing:luxury-bags', 'Designer bags', '👜', 'fashion', {'luxe': .8, 'spend': .6}),
  ('thing:stand-up', 'Stand-up comedy', '🎙️', 'events', {'intense': -.2}),
  ('thing:sports-betting', 'Sports betting', '🎲', 'sports', {'thrill': .6, 'compete': .4}),
]
for f in THINGS:
    iid, n, ch, area, t = f[:5]; g = f[5] if len(f) > 5 else None
    item(iid, n, 'thing', area, E(ch), .95, {area: .3}, {k: v for k, v in t.items() if k in TRAIT}, g)

ITEM = {i['id']: i for i in ITEMS}
assert len(ITEM) == len(ITEMS), 'duplicate item ids'

# ---------------------------------------------------------------------------------------------------------------
# Answer sets per kind: (value, label, group). group 'tried' are the big buttons, 'new' the never-tried row.
ANSWERS = {
  'music':   [('love', 'Fan'), ('like', 'They’re fine'), ('nope', 'Not for me'), ('unknown', 'Who’s that?', 'new')],
  'person':  [('love', 'Fan'), ('like', 'They’re fine'), ('nope', 'Not for me'), ('unknown', 'Who’s that?', 'new')],
  'creator': [('love', 'Fan'), ('like', 'They’re fine'), ('nope', 'Not for me'), ('want', 'Never watched, curious', 'new'), ('unknown', 'Who’s that?', 'new')],
  'show':    [('love', 'Loved it'), ('like', 'It’s fine'), ('nope', 'Not for me'), ('want', 'Haven’t seen it, I’d watch', 'new'), ('pass', 'Haven’t seen it, pass', 'new')],
  'movie':   [('love', 'Loved it'), ('like', 'It’s fine'), ('nope', 'Not for me'), ('want', 'Haven’t seen it, I’d watch', 'new'), ('pass', 'Haven’t seen it, pass', 'new')],
  'franchise': [('love', 'Love it'), ('like', 'It’s fine'), ('nope', 'Not for me'), ('want', 'Never got into it, curious', 'new'), ('pass', 'Never got into it, pass', 'new')],
  'game':    [('love', 'Loved it'), ('like', 'It’s fine'), ('nope', 'Not for me'), ('want', 'Never played, I’d try it', 'new'), ('pass', 'Never played, pass', 'new')],
  'book':    [('love', 'Loved it'), ('like', 'It’s fine'), ('nope', 'Not for me'), ('want', 'Haven’t read it, I’d read it', 'new'), ('pass', 'Haven’t read it, pass', 'new')],
  'podcast': [('love', 'Fan'), ('like', 'It’s fine'), ('nope', 'Not for me'), ('want', 'Never listened, curious', 'new'), ('unknown', 'Never heard of it', 'new')],
  'food':    [('love', 'Love it'), ('like', 'It’s fine'), ('nope', 'Hate it'), ('want', 'Never had it, I’d try it', 'new'), ('pass', 'Never had it, pass', 'new'), ('cant', 'Can’t eat it', 'new')],
  'place':   [('love', 'Been, loved it'), ('like', 'Been, it was fine'), ('nope', 'Been, never again'), ('want', 'Not yet, I want to go', 'new'), ('pass', 'Not yet, no interest', 'new')],
  'activity': [('love', 'Love it'), ('like', 'It’s fine'), ('nope', 'Not for me'), ('want', 'Never tried, I’d try it', 'new'), ('pass', 'Never tried, pass', 'new')],
  'thing':   [('love', 'Love it'), ('like', 'It’s fine'), ('nope', 'Not for me'), ('want', 'Never tried, curious', 'new'), ('pass', 'Never tried, pass', 'new')],
}
# What an answer means: [liking -1..1, tried 0/1, intent -1..1 for untried, known 0/1]
STANCE = {'love': [1, 1, 0, 1], 'like': [.45, 1, 0, 1], 'meh': [0, 1, 0, 1], 'nope': [-1, 1, 0, 1], 'want': [.3, 0, 1, 1],
          'pass': [-.35, 0, -1, 1], 'unknown': [0, 0, 0, 0], 'cant': [0, 0, 0, 1]}

# ---------------------------------------------------------------------------------------------------------------
# Cards. ch = chapters it can appear in (1 first instincts, 2 your world, 3 your lanes, 4 your edges).
CARDS = []
def card(**c):
    CARDS.append(c); return c

def side(label, img, a=None, t=None, f=None, g=None, apps=None):
    o = {'label': label, 'img': img}
    fx = {k: v for k, v in (('a', a), ('t', t), ('f', f), ('g', g), ('apps', apps)) if v}
    if fx: o['fx'] = fx
    return o

# Chapter 1: first instincts — this or that, fast.
TT = [
  ('dogs-cats', 'Dogs or cats?', side('Dogs', E('🐶'), a={'pets': .15}, t={'social': .15, 'active': .15}, f={'animal': ['dogs']}), side('Cats', E('🐱'), a={'pets': .15}, t={'social': -.15}, f={'animal': ['cats']}), 1),
  ('beach-mountains', 'Beach or mountains?', side('Beach', E('🏖️'), a={'travel': .2}, t={'active': -.15, 'luxe': .1}), side('Mountains', E('🏔️'), a={'travel': .2}, t={'active': .35, 'city': -.3}), 1),
  ('morning-night', 'Sunrise or 2 a.m.?', side('Sunrise', E('🌅'), t={'night': -.8, 'health': .2}), side('2 a.m.', E('🌙'), t={'night': .8}), 1),
  ('out-in', 'Friday night: out or in?', side('Out', E('🪩'), a={'events': .3, 'concerts': .15, 'food': .1}, t={'social': .8, 'night': .2}), side('In', E('🛋️'), a={'tv': .2, 'movies': .15, 'games': .1}, t={'social': -.7}), 1),
  ('iphone-android', 'iPhone or Android?', side('iPhone', E('📱'), f={'phone': ['iPhone']}), side('Android', E('🤖'), f={'phone': ['Android']}), 1),
  ('plan-wing', 'Plan it or wing it?', side('Plan it', E('📋'), t={'plan': .8}), side('Wing it', E('🎲'), t={'plan': -.8, 'thrill': .2}), 1),
  ('save-spend', 'Payday. Save it or spend it?', side('Save it', E('🐷'), a={'money': .2}, t={'spend': -.8, 'plan': .2}), side('Spend it', E('🛍️'), a={'shopping': .2, 'fashion': .1}, t={'spend': .8}), 1),
  ('city-country', 'City lights or open fields?', side('City lights', E('🏙️'), t={'city': .8}, f={'lean': ['city']}), side('Open fields', E('🌾'), t={'city': -.8}, f={'lean': ['country']}), 1),
  ('rewatch-new', 'Rewatch a favorite or try something new?', side('Rewatch', E('🔁'), t={'novel': -.8}), side('Something new', E('✨'), t={'novel': .8}), 1),
  ('text-call', 'Text or call?', side('Text', E('💬'), t={'social': -.1}, g={'z': .25, 'y': .15}), side('Call', E('📞'), t={'social': .2}, g={'x': .2, 'o': .3}), 1),
  ('cook-order', 'Cook or order in?', side('Cook', E('🍳'), a={'food': .25}, t={'health': .3, 'plan': .2}, f={'eats': ['cooks']}), side('Order in', E('🛵'), a={'food': .25}, t={'health': -.2}, f={'eats': ['orders in']}), 1),
  ('coffee-tea', 'Coffee or tea?', side('Coffee', E('☕'), f={'drink': ['coffee']}), side('Tea', E('🍵'), f={'drink': ['tea']}, t={'health': .1}), 1),
  ('gym-couch', 'Day off: gym or couch?', side('Gym', E('🏋️'), a={'fitness': .4}, t={'active': .7, 'health': .4}), side('Couch', E('🛋️'), a={'tv': .15}, t={'active': -.6}), 1),
  ('thriller-comedy', 'Something that grips you or makes you laugh?', side('Grips me', E('🔪'), a={'movies': .1, 'tv': .1}, t={'intense': .8}), side('Makes me laugh', E('😂'), a={'tv': .1}, t={'intense': -.8}), 1),
  ('hotel-tent', 'Five-star hotel or a tent under the stars?', side('Five-star hotel', E('🛎️'), a={'travel': .2}, t={'luxe': .7, 'city': .2}), side('A tent', E('🏕️'), a={'travel': .2}, t={'luxe': -.5, 'active': .4, 'city': -.5}), 1),
  ('spicy-mild', 'Spicy or mild?', side('Spicy', E('🌶️'), t={'foodie': .5, 'thrill': .2}, f={'spice': ['hot']}), side('Mild', E('🥛'), t={'foodie': -.3}, f={'spice': ['mild']}), 1),
  ('summer-winter', 'Summer or winter?', side('Summer', E('☀️'), t={'active': .1}), side('Winter', E('❄️'), t={'social': -.1}), 1),
  ('online-store', 'Shopping: online or in the store?', side('Online', E('📦'), a={'shopping': .25}, t={'screen': .3}), side('In the store', E('🛍️'), a={'shopping': .25}, t={'screen': -.3, 'social': .1}), 1),
  ('books-podcasts', 'Commute: a book or a podcast?', side('A book', E('📖'), a={'books': .45}, t={'learn': .2}), side('A podcast', E('🎙️'), a={'podcasts': .45}, t={'learn': .2}), 1),
  ('watch-play', 'Sports: watch or play?', side('Watch', E('📺'), a={'sports': .35}), side('Play', E('⚽'), a={'sports': .25, 'fitness': .3}, t={'active': .5, 'compete': .3}), 2),
  # app duels: the real icons
  ('ig-tiktok', 'Instagram or TikTok?', side('Instagram', ('app', 'Instagram'), a={'social': .3}, apps={'use': ['Instagram']}, g={'y': .15}), side('TikTok', ('app', 'TikTok'), a={'social': .3, 'creators': .1}, apps={'use': ['TikTok']}, g={'z': .3}), 1),
  ('spotify-apple', 'Spotify or Apple Music?', side('Spotify', ('app', 'Spotify'), a={'music': .3}, apps={'use': ['Spotify']}), side('Apple Music', ('app', 'Apple Music'), a={'music': .3}, apps={'use': ['Apple Music']}, f={'phone': ['iPhone']}), 2),
  ('uber-lyft', 'Uber or Lyft?', side('Uber', ('app', 'Uber'), a={'gettingaround': .3}, apps={'use': ['Uber']}), side('Lyft', ('app', 'Lyft'), a={'gettingaround': .3}, apps={'use': ['Lyft']}), 2),
  ('doordash-ubereats', 'DoorDash or Uber Eats?', side('DoorDash', ('app', 'DoorDash'), a={'food': .25}, apps={'use': ['DoorDash']}), side('Uber Eats', ('app', 'Uber Eats'), a={'food': .25}, apps={'use': ['Uber Eats']}), 2),
  ('netflix-youtube', 'One app for a year: Netflix or YouTube?', side('Netflix', ('app', 'Netflix'), a={'tv': .3, 'movies': .25}, apps={'use': ['Netflix']}), side('YouTube', ('app', 'YouTube'), a={'creators': .45}, apps={'use': ['YouTube']}), 1),
  ('amazon-target', 'Amazon or Target?', side('Amazon', ('app', 'Amazon Shopping'), a={'shopping': .25}, apps={'use': ['Amazon Shopping']}), side('Target', ('app', 'Target'), a={'shopping': .25}, apps={'use': ['Target']}), 2),
  ('chatgpt-google', 'A question pops into your head. ChatGPT or Google?', side('ChatGPT', ('app', 'ChatGPT'), a={'ai': .5}, apps={'use': ['ChatGPT']}, t={'tech': .4}), side('Google', ('app', 'Google'), a={'ai': -.15}, apps={'use': ['Google']}), 2),
]
for tid, q, l, r, chap in TT:
    card(id='tt:' + tid, type='tt', ch=[chap] if chap == 1 else [1, 2, 3], q=q, opts=[l, r], prio=1)

def opt(value, label, img=None, **fx):
    o = {'value': value, 'label': label}
    if img: o['img'] = img
    fx = {k: v for k, v in fx.items() if v}
    if fx: o['fx'] = fx
    return o

# Chapter 2: your world (broad, area level)
PHONE = ['music', 'social', 'tv', 'games', 'gettingaround', 'news', 'shopping', 'food', 'money', 'photos', 'work', 'fitness', 'creators', 'podcasts', 'dating', 'ai']
card(id='multi:phone-dies', type='multi', ch=[2], q='Your phone dies for a week. What do you miss first?', sub='Pick up to three.', max=3, min=1, prio=3,
     opts=[opt(k, AREA[k][4][0].upper() + AREA[k][4][1:], ('glyph', k), a={k: .55}) for k in PHONE], miss={'a': -.06})
WEEK = [
  ('cooked', 'Cooked something', '🍳', {'food': .35}, {'health': .15}), ('workout', 'Worked out', '🏋️', {'fitness': .5}, {'active': .5}),
  ('gamed', 'Played a game', '🎮', {'games': .5}, {}), ('read', 'Read', '📖', {'books': .5}, {'learn': .2}),
  ('movie', 'Watched a movie', '🍿', {'movies': .45}, {}), ('ate-out', 'Ate out', '🍽️', {'food': .35}, {'social': .2, 'spend': .2}),
  ('delivery', 'Ordered delivery', '🛵', {'food': .3}, {'health': -.15}), ('show', 'Went to a show', '🎤', {'concerts': .45, 'events': .25}, {'social': .3}),
  ('trip', 'Took a trip', '✈️', {'travel': .55}, {'novel': .2}), ('online', 'Shopped online', '📦', {'shopping': .4}, {'spend': .15}),
  ('posted', 'Posted something', '📸', {'social': .35, 'photos': .3}, {'create': .2}), ('learned', 'Learned something new', '🎓', {'learning': .45}, {'learn': .4}),
  ('podcast', 'Listened to a podcast', '🎙️', {'podcasts': .5}, {'learn': .15}), ('date', 'Went on a date', '💘', {'dating': .5}, {'social': .2}),
  ('game-day', 'Watched a game', '🏟️', {'sports': .5}, {'compete': .2}), ('made', 'Made something', '🎨', {'design': .35, 'photos': .1}, {'create': .5}),
]
card(id='multi:this-week', type='multi', ch=[2], q='This week, did you…', sub='Tap everything that’s true.', max=16, min=0, prio=3,
     opts=[opt(k, n, E(ch), a=a, t=t) for k, n, ch, a, t in WEEK], miss={'a': -.12})
VALUES = [('career', 'Career', '💼', {'work': .3, 'learning': .15}), ('health', 'Health', '💪', {'fitness': .2, 'health': .3}), ('love', 'Love', '❤️', {'dating': .15}),
          ('money', 'Money', '💰', {'money': .3}), ('friends', 'Friends', '🫂', {'events': .2, 'social': .15}), ('family', 'Family', '🏡', {'family': .4}),
          ('fun', 'Fun', '🎉', {'events': .15, 'games': .1}), ('growth', 'Growth', '🌱', {'learning': .3, 'books': .1}), ('creativity', 'Creativity', '🎨', {'design': .25, 'photos': .1, 'musicproduction': .1, 'filmmaking': .1}),
          ('adventure', 'Adventure', '🧭', {'travel': .35})]
card(id='rank:values', type='rank', ch=[2], q='What matters most right now?', sub='Tap your top three, in order.', max=3, prio=2,
     opts=[opt(k, n, E(ch), a=a) for k, n, ch, a in VALUES])
card(id='multi:stage', type='multi', ch=[2], q='Right now, you’re…', sub='Pick all that fit.', max=4, min=1, prio=3,
     opts=[opt('student', 'Studying', E('🎓'), a={'learning': .45}, g={'z': .6}), opt('working', 'Working', E('💼'), a={'work': .45}),
           opt('own', 'Running my own thing', E('🚀'), a={'work': .45, 'money': .1}, t={'thrill': .3, 'create': .3}),
           opt('between', 'Between things', E('🧭'), a={'learning': .1}), opt('parent', 'Raising kids', E('🍼'), a={'family': .6}, g={'y': .3, 'x': .4}),
           opt('retired', 'Retired', E('🏖️'), g={'o': 1})], fact='stage')
card(id='pick:home', type='pick', ch=[2], q='Home is…', prio=2, fact='home',
     opts=[opt('city', 'A big city', E('🏙️'), t={'city': .6}, a={'gettingaround': .1}), opt('suburbs', 'The suburbs', E('🏘️'), t={'city': .1}),
           opt('town', 'A small town', E('🏡'), t={'city': -.4}), opt('country', 'The countryside', E('🌾'), t={'city': -.7})])
card(id='multi:living', type='multi', ch=[2], q='Who’s at home with you?', sub='Pick all that fit.', max=5, min=1, prio=2, fact='living',
     opts=[opt('alone', 'Just me', E('🧍'), t={'social': -.1}), opt('partner', 'A partner', E('💑'), a={'dating': -.2}), opt('roommates', 'Roommates', E('🛋️'), g={'z': .3, 'y': .1}),
           opt('family', 'Family', E('🏡'), a={'family': .3}), opt('kids', 'Kids', E('🧸'), a={'family': .6}, g={'y': .3, 'x': .4}), opt('pets', 'Pets', E('🐾'), a={'pets': .7})])
card(id='slider:screen', type='slider', ch=[2, 3], q='Be honest. Hours on your phone a day?', min=1, max=10, step=1, prio=1, fact='screen',
     left='Barely', right='10+', fx={'t': {'screen': [-.8, .9]}, 'a': {'social': [-.2, .3], 'creators': [-.1, .2]}})

HOME = ['YouTube', 'Instagram', 'TikTok', 'Spotify', 'Netflix', 'Amazon Shopping', 'Uber', 'DoorDash', 'Venmo', 'Google Maps', 'ChatGPT', 'WhatsApp',
        'Snapchat', 'X', 'Pinterest', 'LinkedIn', 'Reddit', 'Discord', 'Duolingo', 'Starbucks']
card(id='apps:home-screen', type='tiles', mode='apps', states=[{'s': s_, 'label': l} for s_, l in [('use', 'Use it'), ('love', 'Love it'), ('used', 'Used to')]], ch=[2],
     q='Which of these are on your phone right now?', sub='Tap once if you use it, twice if you love it, three times if you used to.', prio=3, none='None of these',
     opts=[{'value': appk(n), 'label': n.replace(' Shopping', ''), 'img': ('app', n)} for n in HOME])

# Chapter 3: your lanes. App grids for every area (the first 12 apps of the area by popularity), facets per area.
APP3 = [('use', 'Use it'), ('love', 'Love it'), ('used', 'Used to')]
for k, name, srcs, prior, miss, giveup, ch in AREAS:
    pool = sorted([a for a in apps if a['area'] == k], key=lambda a: -a['pop'])[:12]
    card(id='apps:' + k, type='tiles', mode='apps', states=[{'s': s_, 'label': l} for s_, l in APP3], ch=[3], area=k,
         q='Which of these do you actually use?', sub=f'{name}. Tap once if you use it, twice if you love it, three times if you used to.', prio=2,
         none='None of these', opts=[{'value': a['k'], 'label': a['n'], 'img': ('app', a['n'])} for a in pool])

def facet(fid, area, q, opts_, sub=None, type_='pick', ch=(3,), prio=1.5, fact=None, maxn=None, gate=None):
    c = card(id=f'{type_}:{fid}', type=type_, ch=list(ch), area=area, q=q, opts=opts_, prio=prio)
    if sub: c['sub'] = sub
    if fact: c['fact'] = fact
    if maxn: c['max'] = maxn; c['min'] = 0
    if gate: c['gate'] = gate
    return c

facet('theater-couch', 'movies', 'New movie out. Theater or wait for streaming?', [opt('theater', 'Theater', E('🎟️'), a={'movies': .3}, t={'social': .2, 'spend': .2}), opt('streaming', 'Wait for streaming', E('🛋️'), t={'social': -.2, 'spend': -.2})], type_='pick')
facet('binge', 'tv', 'You start a great show. Then what?', [opt('binge', 'Whole season tonight', E('🌙'), t={'night': .3, 'plan': -.2}), opt('one', 'One a night', E('📺'), t={'plan': .3}), opt('weekly', 'I like waiting for new episodes', E('📅'), t={'novel': .2}), opt('background', 'It’s on while I do other things', E('📱'), t={'screen': .3})])
facet('concert-last', 'concerts', 'Your last concert was…', [opt('month', 'This month', E('🔥'), a={'concerts': .5}, t={'social': .3}), opt('year', 'This year', E('🎤'), a={'concerts': .3}), opt('years', 'Years ago', E('🕰️'), a={'concerts': -.2}), opt('never', 'Never been', E('🙈'), a={'concerts': -.5})])
facet('platform', 'games', 'Where do you play?', [opt('phone', 'Phone', E('📱'), t={'screen': .2}), opt('console', 'Console', E('🎮')), opt('pc', 'PC', E('💻'), t={'compete': .2}), opt('switch', 'Handheld', E('🕹️')), opt('tabletop', 'At the table', E('🎲'), t={'social': .3})], type_='multi', maxn=5, sub='Pick all that fit.', fact='platforms')
facet('win-wander', 'games', 'Win or wander?', [opt('win', 'Ranked, competitive, win', E('🏆'), t={'compete': .8}), opt('wander', 'Big worlds, explore', E('🗺️'), t={'compete': -.4, 'novel': .3}), opt('cozy', 'Cozy and chill', E('🍵'), t={'intense': -.6, 'compete': -.5}), opt('story', 'A great story', E('📜'), t={'learn': .2})])
facet('short-long', 'creators', 'Short and fast or long and deep?', [opt('short', 'Reels and shorts', E('⚡'), t={'screen': .3}, g={'z': .3}), opt('long', 'Long videos and essays', E('🎞️'), t={'learn': .3}), opt('live', 'Livestreams', E('🔴'), t={'night': .3}, g={'z': .3}), opt('both', 'All of it', E('🌀'), t={'screen': .4})])
facet('post-lurk', 'social', 'On social, you…', [opt('post', 'Post all the time', E('📸'), t={'create': .5, 'social': .4}, a={'photos': .3}), opt('stories', 'Stories, not posts', E('⭕')), opt('dm', 'Live in the DMs', E('💬'), t={'social': .3}), opt('lurk', 'Watch, never post', E('👀'), t={'create': -.4})])
facet('ai-feel', 'ai', 'AI is…', [opt('daily', 'My daily sidekick', E('🤝'), a={'ai': .6}, t={'tech': .6}), opt('sometimes', 'Useful sometimes', E('🧰'), a={'ai': .25}), opt('not', 'Not for me', E('🙅'), a={'ai': -.5}), opt('scary', 'Honestly a little scary', E('😬'), a={'ai': -.3}, t={'tech': -.4})], ch=(2, 3))
facet('fiction', 'books', 'A plot you can’t put down or ideas that change you?', [opt('fiction', 'A plot', E('📕')), opt('nonfiction', 'Ideas', E('💡'), t={'learn': .5}), opt('both', 'Both, depends on the week', E('📚'))])
facet('read-how', 'books', 'Pages, screen or ears?', [opt('paper', 'Paper', E('📖'), t={'nostalgia': .2, 'screen': -.2}), opt('kindle', 'E-reader', E('📱')), opt('audio', 'Audiobooks', E('🎧'), a={'audiobooks': .5})], type_='multi', maxn=3, sub='Pick all that fit.')
facet('news-how', 'news', 'Where does your news come from?', [opt('apps', 'News apps and sites', E('📰'), a={'news': .3}), opt('social', 'Social media', E('📱'), t={'screen': .2}), opt('tv', 'TV', E('📺'), g={'x': .2, 'o': .3}), opt('pods', 'Podcasts', E('🎙️'), a={'podcasts': .2}), opt('avoid', 'I avoid it', E('🙈'), a={'news': -.5})], type_='multi', maxn=5, sub='Pick all that fit.', ch=(2, 3))
facet('party-size', 'events', 'Your kind of night out?', [opt('big', 'A big party', E('🪩'), t={'social': .6, 'night': .3}), opt('dinner', 'Dinner with a few friends', E('🍽️'), a={'food': .2}, t={'social': .3}), opt('show', 'A show or a game', E('🎟️'), a={'concerts': .2, 'sports': .2}), opt('bar', 'A bar I know', E('🍸'), t={'novel': -.3})])
facet('make-videos', 'filmmaking', 'Do you make videos?', [opt('yes', 'All the time', E('🎬'), a={'filmmaking': .6, 'creators': .2}, t={'create': .6}), opt('sometimes', 'For fun sometimes', E('🤳'), a={'filmmaking': .3}, t={'create': .3}), opt('no', 'Not really', E('🙅'), a={'filmmaking': -.5})], ch=(2, 3))
facet('make-music', 'musicproduction', 'Do you make music?', [opt('yes', 'I make tracks', E('🎹'), a={'musicproduction': .7}, t={'create': .6}), opt('play', 'I play an instrument', E('🎸'), a={'musicproduction': .4}, t={'create': .4}), opt('sing', 'I sing (mostly in the car)', E('🎤'), a={'musicproduction': .05}), opt('no', 'Not really', E('🙅'), a={'musicproduction': -.5})], ch=(2, 3))
facet('photos-how', 'photos', 'Your camera roll is…', [opt('art', 'Basically a portfolio', E('🖼️'), a={'photos': .5}, t={'create': .5}), opt('memories', 'Friends, food, memories', E('📸'), a={'photos': .3}), opt('screens', 'Mostly screenshots', E('📱'), t={'screen': .3}), opt('rarely', 'I rarely take photos', E('🙈'), a={'photos': -.4})])
facet('creative', 'design', 'Do you make things?', [opt('pro', 'It’s my job', E('🎨'), a={'design': .7, 'work': .1}, t={'create': .8}), opt('hobby', 'As a hobby', E('✏️'), a={'design': .4}, t={'create': .5}), opt('want', 'I want to start', E('🌱'), a={'design': .1}), opt('no', 'Not my thing', E('🙅'), a={'design': -.5})], ch=(2, 3))
facet('learning-now', 'learning', 'Learning anything right now?', [opt('school', 'In school', E('🎓'), a={'learning': .5}, g={'z': .5}), opt('skill', 'A new skill', E('🛠️'), a={'learning': .5}, t={'learn': .5}), opt('lang', 'A language', E('🗣️'), a={'languages': .7}), opt('curious', 'Just curious about everything', E('🧠'), t={'learn': .4}), opt('no', 'Taking a break', E('😴'), a={'learning': -.4})], type_='multi', maxn=4, sub='Pick all that fit.', ch=(2, 3))
facet('languages', 'languages', 'Languages you speak or want to?', [opt(k, n, E(ch)) for k, n, ch in [
  ('spanish', 'Spanish', '🇪🇸'), ('french', 'French', '🇫🇷'), ('japanese', 'Japanese', '🇯🇵'), ('korean', 'Korean', '🇰🇷'), ('mandarin', 'Mandarin', '🇨🇳'),
  ('german', 'German', '🇩🇪'), ('italian', 'Italian', '🇮🇹'), ('portuguese', 'Portuguese', '🇧🇷'), ('hindi', 'Hindi', '🇮🇳'), ('arabic', 'Arabic', '🇸🇦'), ('tagalog', 'Tagalog', '🇵🇭'), ('vietnamese', 'Vietnamese', '🇻🇳')]],
  sub='Pick as many as you like.', type_='multi', maxn=12, fact='languages')
facet('kids', 'family', 'Kids?', [opt('young', 'Little ones', E('🧸'), a={'family': .6}, g={'y': .4, 'x': .3}), opt('teens', 'Teenagers', E('🎒'), a={'family': .5}, g={'x': .5, 'o': .2}), opt('grown', 'All grown up', E('🎓'), g={'o': .7}), opt('someday', 'Someday', E('🌱'), g={'z': .3, 'y': .3}), opt('no', 'Not for me', E('🙅')), opt('skip', 'Rather not say', E('🤐'))], fact='kids', ch=(3, 4))
facet('relationship', 'dating', 'Love life?', [opt('single', 'Single', E('🦋'), a={'dating': .4}), opt('dating', 'Dating around', E('💘'), a={'dating': .7}, t={'social': .3}), opt('taken', 'Taken', E('💑'), a={'dating': -.5}), opt('married', 'Married', E('💍'), a={'dating': -.6}, g={'y': .2, 'x': .3}), opt('complicated', 'It’s complicated', E('🌀'), a={'dating': .2}), opt('skip', 'Rather not say', E('🤐'))], fact='relationship', ch=(3, 4))
facet('diet', 'food', 'Anything you don’t eat?', [opt(k, n, E(ch), t=t) for k, n, ch, t in [
  ('none', 'I eat everything', '😋', {'foodie': .4}), ('vegetarian', 'Vegetarian', '🥕', {'health': .3}), ('vegan', 'Vegan', '🌱', {'health': .4}), ('pescatarian', 'Pescatarian', '🐟', {}),
  ('halal', 'Halal', '🌙', {}), ('kosher', 'Kosher', '✡️', {}), ('no-pork', 'No pork', '🐖', {}), ('no-beef', 'No beef', '🐄', {}),
  ('gluten-free', 'Gluten-free', '🌾', {}), ('dairy-free', 'Dairy-free', '🥛', {}), ('low-carb', 'Low carb', '🥩', {'health': .3})]],
  sub='Pick all that fit.', type_='multi', maxn=11, fact='diet', ch=(3, 4), prio=2.2)
facet('allergies', 'food', 'Allergic to anything?', [opt(k, n, E(ch)) for k, n, ch in [
  ('none', 'Nope', '👍'), ('peanuts', 'Peanuts', '🥜'), ('tree-nuts', 'Tree nuts', '🌰'), ('shellfish', 'Shellfish', '🦐'), ('fish', 'Fish', '🐟'), ('eggs', 'Eggs', '🥚'),
  ('dairy', 'Dairy', '🧀'), ('soy', 'Soy', '🫘'), ('wheat', 'Wheat', '🌾'), ('sesame', 'Sesame', '🥯'), ('other', 'Something else', '❓')]],
  sub='So Neocast never suggests something you can’t have. Private to your account.', type_='multi', maxn=11, fact='allergies', ch=(3, 4), prio=2.2)
card(id='slider:spice', type='slider', ch=[3, 4], area='food', q='How hot can you go?', min=0, max=4, step=1, prio=1.4, fact='spice-level',
     left='No spice', right='Bring tears', marks=[E(x) for x in ['🥛', '🫑', '🌶️', '🔥', '🌋']], fx={'t': {'foodie': [-.4, .6], 'thrill': [-.1, .3]}})
card(id='slider:dinner', type='slider', ch=[3, 4], area='food', q='Dinner for two. What’s a normal night for you?', min=20, max=300, step=10, prio=1.5, fact='dinner-for-two', money=True,
     left='$20', right='$300+', fx={'t': {'spend': [-.6, .8], 'luxe': [-.5, .8]}})
facet('trip-style', 'travel', 'Your kind of trip?', [opt(k, n, E(ch), t=t) for k, n, ch, t in [
  ('luxury', 'Luxury resort', '🛎️', {'luxe': .7}), ('city', 'City break', '🏙️', {'city': .5, 'foodie': .2}), ('backpack', 'Backpacking', '🎒', {'luxe': -.5, 'novel': .5, 'thrill': .3}),
  ('road', 'Road trip', '🚗', {'plan': -.2}), ('outdoors', 'Outdoors and hiking', '🥾', {'active': .6, 'city': -.5}), ('family', 'Visiting family', '🏡', {}), ('beach', 'Beach and do nothing', '🏝️', {'active': -.4})]],
  sub='Pick up to three.', type_='multi', maxn=3, fact='trips')
card(id='slider:trips', type='slider', ch=[3], area='travel', q='Trips a year, roughly?', min=0, max=10, step=1, prio=1.2, fact='trips-a-year', left='None', right='10+',
     fx={'a': {'travel': [-.5, .7]}, 't': {'novel': [-.2, .3]}})
facet('getting-around', 'gettingaround', 'How do you mostly get around?', [opt('drive', 'I drive', E('🚗'), t={'city': -.3}), opt('transit', 'Trains and buses', E('🚇'), t={'city': .5}), opt('rides', 'Rideshare', E('🚕'), t={'spend': .2, 'city': .3}), opt('bike', 'Bike or scooter', E('🚲'), t={'active': .3, 'city': .3}), opt('walk', 'I walk everywhere', E('🚶'), t={'active': .3, 'city': .4})], type_='multi', maxn=5, sub='Pick all that fit.', fact='gets-around', ch=(2, 3))
facet('style', 'fashion', 'Your style, honestly?', [opt(k, n, E(ch), t=t, g=g) for k, n, ch, t, g in [
  ('street', 'Streetwear', '🧢', {'mainstream': .2}, {'z': .3}), ('classic', 'Classic', '👔', {'luxe': .2}, {}), ('athleisure', 'Athleisure', '🩳', {'active': .3}, {}),
  ('minimal', 'Minimal', '🖤', {}, {}), ('vintage', 'Vintage and thrift', '🧥', {'mainstream': -.4, 'spend': -.2}, {}), ('luxury', 'Designer', '💎', {'luxe': .8, 'spend': .5}, {}), ('comfy', 'Whatever’s comfy', '🧦', {'luxe': -.3}, {})]],
  sub='Pick up to two.', type_='multi', maxn=2, fact='style')
facet('workout-time', 'fitness', 'When do you work out?', [opt('morning', 'Before work', E('🌅'), t={'night': -.6, 'plan': .3}), opt('lunch', 'Midday', E('☀️')), opt('evening', 'Evenings', E('🌆'), t={'night': .2}), opt('whenever', 'Whenever I can', E('🤷'), t={'plan': -.3})])
facet('sleep', 'health', 'A normal night’s sleep?', [opt('lt6', 'Under 6 hours', E('🥱'), t={'night': .4, 'health': -.3}), opt('6-7', '6 to 7 hours', E('😴')), opt('7-8', '7 to 8 hours', E('🛌'), t={'health': .3}), opt('gt8', 'More than 8', E('💤'))], fact='sleep')
facet('wellness', 'health', 'Which of these do you track?', [opt(k, n, E(ch)) for k, n, ch in [('steps', 'Steps', '👣'), ('sleep', 'Sleep', '🛌'), ('food', 'What I eat', '🥗'), ('heart', 'Heart rate', '❤️'), ('cycle', 'My cycle', '🌙'), ('mood', 'Mood', '🌤️'), ('nothing', 'Nothing', '🙅')]],
      sub='Pick all that fit.', type_='multi', maxn=7, fact='tracks')
facet('space', 'home', 'Your space is…', [opt('minimal', 'Clean and minimal', E('🤍'), t={'plan': .3}), opt('cozy', 'Cozy, lots of blankets', E('🛋️'), t={'social': -.2}), opt('plants', 'Full of plants', E('🪴')), opt('chaos', 'Organized chaos', E('🌀'), t={'plan': -.4}), opt('project', 'Always a project', E('🔨'), a={'home': .4}, t={'create': .3})])
facet('rent-own', 'home', 'You…', [opt('rent', 'Rent', E('🔑')), opt('own', 'Own', E('🏠'), g={'x': .3, 'o': .3}), opt('family', 'Live with family', E('🏡'), g={'z': .4}), opt('looking', 'Looking for a new place', E('🔎'), a={'home': .5}), opt('skip', 'Rather not say', E('🤐'))], fact='home-status', prio=1.2)
facet('pets-have', 'pets', 'Pets?', [opt(k, n, E(ch), a=a) for k, n, ch, a in [('dog', 'A dog', '🐕', {'pets': .7}), ('cat', 'A cat', '🐈', {'pets': .7}), ('fish', 'Fish', '🐠', {'pets': .4}), ('bird', 'A bird', '🦜', {'pets': .4}),
      ('reptile', 'A reptile', '🦎', {'pets': .4}), ('small', 'Something small and fluffy', '🐹', {'pets': .4}), ('want', 'Not yet, I want one', '🥺', {'pets': .2}), ('none', 'No pets', '🙅', {'pets': -.5})]],
      sub='Pick all that fit.', type_='multi', maxn=8, fact='pets', ch=(2, 3))
facet('invest', 'money', 'Do you invest?', [opt('stocks', 'Stocks', E('📈'), t={'plan': .3}), opt('crypto', 'Crypto', E('🪙'), t={'thrill': .4}), opt('retirement', 'Just retirement', E('🏦'), t={'plan': .3}), opt('realestate', 'Real estate', E('🏘️')), opt('notyet', 'Not yet', E('🌱')), opt('skip', 'Rather not say', E('🤐'))], type_='multi', maxn=6, sub='Pick all that fit.', fact='invests')
facet('work-where', 'work', 'Where do you work?', [opt('office', 'An office', E('🏢'), t={'city': .2}), opt('remote', 'From home', E('🏠'), t={'social': -.2, 'screen': .2}), opt('hybrid', 'A bit of both', E('🔀')), opt('feet', 'On my feet', E('👟'), t={'active': .3}), opt('none', 'Not working right now', E('🌴'))], fact='work-where')
facet('field', 'work', 'What field are you in?', [opt(k, n, E(ch), a=a) for k, n, ch, a in [
  ('tech', 'Tech', '💻', {'coding': .2, 'ai': .2}), ('creative', 'Creative and media', '🎨', {'design': .3}), ('health', 'Healthcare', '🩺', {'health': .2}), ('education', 'Education', '🍎', {'learning': .3}),
  ('finance', 'Finance', '📊', {'money': .3}), ('service', 'Retail and service', '🛎️', {}), ('trades', 'The trades', '🛠️', {'home': .2}), ('government', 'Government', '🏛️', {'news': .2}),
  ('law', 'Law', '⚖️', {}), ('science', 'Science', '🔬', {'learning': .2}), ('student', 'Still in school', '🎓', {'learning': .4}), ('other', 'Something else', '✨', {})]],
  sub='Pick up to two.', type_='multi', maxn=2, fact='field', ch=(3, 4))
facet('code', 'coding', 'Do you write code?', [opt('job', 'It’s my job', E('💻'), a={'coding': .8, 'work': .2}, t={'create': .4, 'learn': .3}), opt('hobby', 'For fun', E('🧪'), a={'coding': .5}, t={'create': .4}), opt('learning', 'Learning', E('🌱'), a={'coding': .4, 'learning': .2}), opt('no', 'Nope', E('🙅'), a={'coding': -.6})], ch=(2, 3))
facet('theme-ride', 'themeparks', 'At a theme park, you head straight for…', [opt('coasters', 'The biggest coaster', E('🎢'), t={'thrill': .8}), opt('characters', 'The characters and parades', E('🏰'), t={'nostalgia': .4}), opt('food', 'The food', E('🍦'), a={'food': .1}), opt('exit', 'The exit', E('🚪'), a={'themeparks': -.6})])
facet('festival-go', 'festivals', 'Festivals?', [opt('every', 'Every summer', E('🎪'), a={'festivals': .7}, t={'social': .5}), opt('once', 'Went once or twice', E('🎟️'), a={'festivals': .2}), opt('want', 'Never been, want to', E('🥺'), a={'festivals': .2}), opt('no', 'Not my thing', E('🙅'), a={'festivals': -.6})])


# Tiles: one screen, many narrow signals. Three-state tiles (tap once, twice, three times) or one-state (tap = yes).
LIKE3 = [('like', 'Like'), ('love', 'Love'), ('nope', 'Not for me')]
FOLLOW3 = [('like', 'Follow it'), ('love', 'Obsessed'), ('nope', 'Not for me')]
PLAY3 = [('like', 'Do it'), ('love', 'Love it'), ('want', 'Want to try')]
TRAVEL3 = [('like', 'Been'), ('love', 'Loved it'), ('want', 'Want to go')]
YES1 = [('love', 'Yes')]
def tiles(tid, area, q, opts_, states, sub=None, ch=(3,), prio=1.6, kind='thing', fact=None, none='None of these', gate=None):
    legend = ', '.join(f'{["once", "twice", "three times"][i]} for {l.lower()}' for i, (st, l) in enumerate(states))
    c = card(id='tiles:' + tid, type='tiles', mode='tri' if len(states) > 1 else 'bin', states=[{'s': st, 'label': l} for st, l in states], ch=list(ch), area=area, q=q,
             sub=sub or ('Tap ' + legend + '.' if len(states) > 1 else 'Tap all that apply.'), opts=opts_, prio=prio, kind=kind, none=none)
    if fact: c['fact'] = fact
    if gate: c['gate'] = gate
    return c
def T(value, label, ch, a=None, t=None, g=None, f=None):
    return opt(value, label, E(ch), a=a, t=t, g=g, f=f)

tiles('grew-up', 'family', 'Which of these were part of your childhood?', [
  T('cassettes', 'Cassette tapes', '📼', g={'o': .8, 'x': .5}), T('pagers', 'Pagers', '📟', g={'x': .7, 'o': .4}), T('arcades', 'Arcades', '👾', g={'x': .5, 'o': .5}),
  T('cds', 'Burning CDs', '💿', g={'y': .6, 'x': .5}), T('tamagotchi', 'Tamagotchi', '🥚', g={'y': .8, 'x': .2}), T('beanie', 'Beanie Babies', '🧸', g={'y': .7, 'x': .3}),
  T('pokemon-cards', 'Pokémon cards', '🃏', g={'y': .6, 'z': .4}), T('flip-phone', 'A flip phone', '☎️', g={'y': .6, 'x': .3}), T('ipod', 'An iPod', '🎵', g={'y': .5, 'z': .5}),
  T('vine', 'Vine', '🌿', g={'z': .8, 'y': .2}), T('ipad', 'An iPad', '📱', g={'z': .8}), T('snap-streaks', 'Snap streaks', '👻', g={'z': .8}),
  T('fortnite', 'Fortnite', '🪂', g={'z': .9}), T('dial-up', 'Dial-up internet', '☎️', g={'x': .6, 'y': .4, 'o': .3}), T('polaroid', 'Polaroids', '📸', g={'o': .5, 'x': .3, 'z': .1})],
  YES1, sub='Tap everything you grew up with.', ch=(2,), prio=2.4, kind='era', fact='grew-up', none='None of these')
tiles('hobbies', 'events', 'What do you do for fun?', [
  T('gaming', 'Gaming', '🎮', a={'games': .55}), T('reading', 'Reading', '📚', a={'books': .55}, t={'learn': .2}), T('cooking', 'Cooking', '🍳', a={'food': .4}, t={'create': .2}),
  T('baking', 'Baking', '🧁', a={'food': .35}, t={'create': .3}), T('working-out', 'Working out', '🏋️', a={'fitness': .6}, t={'active': .5}), T('hiking', 'Hiking', '🥾', a={'travel': .35}, t={'active': .4, 'city': -.4}),
  T('photography', 'Photography', '📷', a={'photos': .6}, t={'create': .4}), T('drawing', 'Drawing and painting', '🎨', a={'design': .6}, t={'create': .6}), T('writing', 'Writing', '✍️', a={'books': .2}, t={'create': .5}),
  T('music', 'Playing music', '🎸', a={'musicproduction': .6, 'music': .2}, t={'create': .5}), T('dancing', 'Dancing', '💃', a={'events': .35}, t={'social': .3}), T('gardening', 'Gardening', '🪴', a={'home': .45}),
  T('diy', 'DIY and fixing things', '🔨', a={'home': .45}, t={'create': .4}), T('fishing', 'Fishing', '🎣', a={'travel': .2}, t={'city': -.5}), T('cars', 'Cars', '🏎️', a={'gettingaround': .45}),
  T('fashion', 'Fashion', '👗', a={'fashion': .6}), T('collecting', 'Collecting', '🃏', t={'nostalgia': .3}), T('puzzles', 'Puzzles', '🧩', t={'learn': .2, 'social': -.1}),
  T('board-games', 'Board games', '🎲', a={'games': .3}, t={'social': .3}), T('travel', 'Traveling', '✈️', a={'travel': .55}, t={'novel': .3}), T('volunteering', 'Volunteering', '🫶', a={'family': .1}, t={'social': .2}),
  T('crafts', 'Knitting and crafts', '🧶', a={'design': .3}, t={'create': .4}), T('sports', 'Playing sports', '⚽', a={'sports': .45, 'fitness': .3}, t={'compete': .4}), T('makeup', 'Makeup and skincare', '💄', a={'fashion': .4}),
  T('anime', 'Anime', '🍥', a={'tv': .3}), T('podcasts', 'Podcasts', '🎙️', a={'podcasts': .5}), T('thrifting', 'Thrifting', '🧥', a={'fashion': .4, 'shopping': .2}, t={'spend': -.2}), T('coding', 'Coding', '💻', a={'coding': .7}, t={'create': .3})],
  LIKE3, sub='Tap once if you do it, twice if you love it, three times if it’s not for you.', ch=(2,), prio=2.6, kind='hobby')
tiles('devices', 'tools', 'What’s in your life right now?', [
  T('iphone', 'iPhone', '📱', f={'phone': ['iPhone']}), T('android', 'Android phone', '🤖', f={'phone': ['Android']}), T('mac', 'Mac', '💻'), T('pc', 'Windows PC', '🖥️', a={'games': .1}),
  T('tablet', 'Tablet', '📱'), T('watch', 'Smartwatch', '⌚', a={'health': .3, 'fitness': .2}), T('earbuds', 'Earbuds', '🎧', a={'music': .1, 'podcasts': .1}), T('ps', 'PlayStation', '🎮', a={'games': .6}),
  T('xbox', 'Xbox', '🎮', a={'games': .6}), T('switch', 'Nintendo Switch', '🕹️', a={'games': .55}), T('vr', 'VR headset', '🥽', a={'games': .3}, t={'tech': .6}), T('speaker', 'Smart speaker', '🔊', t={'tech': .3}),
  T('ereader', 'E-reader', '📖', a={'books': .5}), T('camera', 'A real camera', '📷', a={'photos': .55}, t={'create': .4}), T('streaming-stick', 'TV streaming box', '📺', a={'tv': .3, 'movies': .2})],
  YES1, sub='Tap everything you own.', ch=(2, 3), prio=2.0, kind='device', fact='devices')
tiles('instruments', 'musicproduction', 'Do you play anything?', [
  T('piano', 'Piano or keys', '🎹', t={'create': .4}), T('guitar', 'Guitar', '🎸', t={'create': .4}), T('drums', 'Drums', '🥁', t={'create': .4, 'intense': .2}), T('bass', 'Bass', '🎸', t={'create': .4}),
  T('violin', 'Violin or strings', '🎻', t={'create': .4}), T('sax', 'Sax or horns', '🎷', t={'create': .4}), T('trumpet', 'Trumpet', '🎺', t={'create': .4}), T('banjo', 'Ukulele or banjo', '🪕', t={'create': .3}),
  T('flute', 'Flute', '🪈', t={'create': .3}), T('dj', 'DJ decks', '🎛️', t={'create': .4, 'night': .3}), T('voice', 'I sing', '🎤', t={'create': .3}), T('production', 'I make beats', '💻', t={'create': .5})],
  PLAY3, sub='Tap once if you play, twice if you love it, three times if you want to learn.', ch=(3,), prio=1.8, kind='instrument', fact='plays', none='I don’t play anything')
tiles('fruits', 'food', 'Fruit check.', [
  T('strawberries', 'Strawberries', '🍓'), T('mango', 'Mango', '🥭'), T('kiwi', 'Kiwi', '🥝'), T('watermelon', 'Watermelon', '🍉'), T('pineapple', 'Pineapple', '🍍'),
  T('banana', 'Banana', '🍌'), T('grapes', 'Grapes', '🍇'), T('peaches', 'Peaches', '🍑'), T('cherries', 'Cherries', '🍒'), T('blueberries', 'Blueberries', '🫐'),
  T('lemon', 'Lemon', '🍋'), T('coconut', 'Coconut', '🥥'), T('tomato', 'Tomato', '🍅'), T('avocado', 'Avocado', '🥑')],
  LIKE3, ch=(3, 4), prio=1.3, kind='fruit')
tiles('veggies', 'food', 'And the vegetables.', [
  T('broccoli', 'Broccoli', '🥦', t={'health': .2}), T('carrots', 'Carrots', '🥕'), T('corn', 'Corn', '🌽'), T('peppers', 'Peppers', '🫑'), T('mushrooms', 'Mushrooms', '🍄', t={'foodie': .2}),
  T('eggplant', 'Eggplant', '🍆', t={'foodie': .2}), T('potatoes', 'Potatoes', '🥔'), T('onions', 'Onions', '🧅'), T('garlic', 'Garlic', '🧄'), T('cucumber', 'Cucumber', '🥒'),
  T('greens', 'Leafy greens', '🥬', t={'health': .3}), T('olives', 'Olives', '🫒', t={'foodie': .3})],
  LIKE3, ch=(3, 4), prio=1.2, kind='vegetable')
tiles('cuisines', 'food', 'Pick your cuisines.', [
  T('mexican', 'Mexican', '🌮'), T('japanese', 'Japanese', '🍣', t={'foodie': .2}), T('italian', 'Italian', '🍝'), T('chinese', 'Chinese', '🥡'), T('korean', 'Korean', '🥘', t={'foodie': .2}),
  T('indian', 'Indian', '🍛', t={'foodie': .3}), T('thai', 'Thai', '🍜', t={'foodie': .2}), T('mediterranean', 'Mediterranean', '🥙', t={'health': .2}), T('american', 'Burgers and BBQ', '🍔'),
  T('vietnamese', 'Vietnamese', '🍲', t={'foodie': .2}), T('middle-eastern', 'Middle Eastern', '🧆', t={'foodie': .2}), T('french', 'French', '🥐', t={'luxe': .2}), T('southern', 'Southern', '🍗'),
  T('ethiopian', 'Ethiopian', '🫓', t={'foodie': .5}), T('seafood', 'Seafood', '🍤'), T('vegan', 'Plant-based', '🥗', t={'health': .4})],
  LIKE3, ch=(3,), prio=1.9, kind='cuisine', fact='cuisines')
tiles('drinks', 'food', 'What’s in your cup?', [
  T('coffee', 'Coffee', '☕'), T('tea', 'Tea', '🍵'), T('boba', 'Boba', '🧋', g={'z': .4}), T('soda', 'Soda', '🥤'), T('energy', 'Energy drinks', '⚡', t={'night': .2}, g={'z': .3}),
  T('water', 'Just water', '💧', t={'health': .3}), T('wine', 'Wine', '🍷', t={'luxe': .2}), T('beer', 'Beer', '🍺', t={'social': .2}), T('cocktails', 'Cocktails', '🍸', t={'social': .3, 'night': .2}),
  T('whiskey', 'Whiskey', '🥃'), T('sake', 'Sake', '🍶'), T('kombucha', 'Kombucha', '🫙', t={'health': .3})],
  LIKE3, ch=(3, 4), prio=1.3, kind='drink')
tiles('sweets', 'food', 'Dessert time.', [
  T('chocolate', 'Chocolate', '🍫'), T('ice-cream', 'Ice cream', '🍦'), T('cake', 'Cake', '🍰'), T('cookies', 'Cookies', '🍪'), T('donuts', 'Donuts', '🍩'), T('candy', 'Candy', '🍬'),
  T('pie', 'Pie', '🥧'), T('pastries', 'Pastries', '🥐'), T('mochi', 'Mochi', '🍡', t={'foodie': .2}), T('popcorn', 'Popcorn', '🍿'), T('pretzels', 'Salty snacks', '🥨'), T('none', 'No sweet tooth', '🙅', t={'health': .3})],
  LIKE3, ch=(3, 4), prio=1.0, kind='food')
tiles('movie-genres', 'movies', 'What gets you to press play?', [
  T('action', 'Action', '💥', t={'thrill': .3}), T('comedy', 'Comedy', '😂', t={'intense': -.4}), T('horror', 'Horror', '👻', t={'intense': .6, 'thrill': .4}), T('romance', 'Romance', '💘', t={'intense': -.3}),
  T('scifi', 'Sci-fi', '🚀', t={'novel': .3}), T('thriller', 'Thrillers', '🔪', t={'intense': .5}), T('animation', 'Animation', '🧸'), T('docs', 'Documentaries', '🎥', t={'learn': .5}),
  T('fantasy', 'Fantasy', '🐉'), T('drama', 'Drama', '🎭', t={'intense': .2}), T('musicals', 'Musicals', '🎶'), T('superhero', 'Superheroes', '🦸', t={'mainstream': .4}), T('war', 'War and history', '🎖️'), T('indie', 'Indie and arthouse', '🎞️', t={'mainstream': -.5})],
  LIKE3, ch=(3,), prio=2.0, kind='genre', fact='movie-genres')
tiles('tv-genres', 'tv', 'Your kind of TV?', [
  T('sitcoms', 'Sitcoms', '😂', t={'intense': -.5}), T('reality', 'Reality', '🌹', t={'mainstream': .3}), T('crime', 'Crime and detectives', '🕵️', t={'intense': .4}), T('prestige', 'Big prestige dramas', '🎭', t={'intense': .4}),
  T('anime', 'Anime', '🍥', g={'z': .3}), T('kdrama', 'K-dramas', '🫰'), T('docuseries', 'Docuseries', '🎥', t={'learn': .4}), T('cooking', 'Cooking shows', '🍳', a={'food': .2}),
  T('competition', 'Competition shows', '🏆', t={'compete': .3}), T('scifi', 'Sci-fi and fantasy', '🐉'), T('truecrime', 'True crime', '🔪', t={'intense': .6}), T('teen', 'Teen drama', '🎒', g={'z': .4}), T('romance', 'Romance', '💘'), T('news', 'Late-night and news', '🎙️')],
  LIKE3, ch=(3,), prio=2.0, kind='genre', fact='tv-genres')
tiles('music-genres', 'music', 'Your music, in genres.', [
  T('pop', 'Pop', '🎤', t={'mainstream': .4}), T('hiphop', 'Hip-hop and rap', '🎧', g={'z': .2, 'y': .2}), T('rnb', 'R&B', '💜', t={'night': .2}), T('country', 'Country', '🤠', t={'city': -.5}),
  T('rock', 'Rock', '🎸', g={'x': .3, 'o': .2}), T('latin', 'Latin', '💃', t={'social': .2}), T('kpop', 'K-pop', '🫰', g={'z': .5}), T('edm', 'Electronic', '🎛️', t={'night': .3, 'social': .3}),
  T('indie', 'Indie', '📻', t={'mainstream': -.5}), T('jazz', 'Jazz', '🎷', g={'x': .2, 'o': .3}), T('classical', 'Classical', '🎻', t={'learn': .2}), T('lofi', 'Lo-fi and chill', '🌧️', t={'intense': -.3}),
  T('metal', 'Metal', '🤘', t={'intense': .6}), T('gospel', 'Gospel', '🙏'), T('afrobeats', 'Afrobeats', '🥁', t={'social': .3}), T('soundtracks', 'Soundtracks', '🎬')],
  LIKE3, ch=(3,), prio=2.1, kind='genre', fact='music-genres')
tiles('game-genres', 'games', 'What do you play?', [
  T('shooters', 'Shooters', '🎯', t={'compete': .5}), T('rpg', 'RPGs', '🗡️'), T('sports', 'Sports games', '⚽', a={'sports': .2}), T('racing', 'Racing', '🏎️'), T('puzzle', 'Puzzle', '🧩'),
  T('strategy', 'Strategy', '♟️', t={'learn': .2}), T('sims', 'Sims and builders', '🏙️', t={'create': .3}), T('battle-royale', 'Battle royale', '🪂', t={'compete': .5}), T('cozy', 'Cozy games', '🌱', t={'intense': -.5}),
  T('horror', 'Horror', '👻', t={'intense': .5}), T('fighting', 'Fighting', '🥊', t={'compete': .4}), T('mmo', 'MMOs', '🌐', t={'social': .2}), T('mobile', 'Phone games', '📱'), T('open-world', 'Open world', '🗺️', t={'novel': .3})],
  LIKE3, ch=(3,), prio=2.0, kind='genre', fact='game-genres')
tiles('book-genres', 'books', 'What do you read?', [
  T('romance', 'Romance', '💘'), T('fantasy', 'Fantasy', '🐉'), T('thriller', 'Thrillers', '🔪', t={'intense': .4}), T('scifi', 'Sci-fi', '🚀'), T('selfhelp', 'Self-help', '🌱', t={'learn': .3}),
  T('business', 'Business', '📈', t={'learn': .3}), T('biography', 'Biographies', '👤'), T('history', 'History', '🏛️', t={'learn': .4}), T('literary', 'Literary fiction', '📖'), T('horror', 'Horror', '👻'),
  T('manga', 'Manga and comics', '🍥', g={'z': .3}), T('ya', 'YA', '🎒', g={'z': .4}), T('poetry', 'Poetry', '✒️'), T('mystery', 'Mystery', '🕵️')],
  LIKE3, ch=(3,), prio=1.9, kind='genre', fact='book-genres')
tiles('creator-types', 'creators', 'Who’s on your feed?', [
  T('comedy', 'Comedy', '😂'), T('gaming', 'Gaming', '🎮', a={'games': .3}), T('beauty', 'Beauty', '💄', a={'fashion': .3}), T('fitness', 'Fitness', '🏋️', a={'fitness': .3}), T('food', 'Food', '🍳', a={'food': .2}),
  T('tech', 'Tech', '💻', t={'tech': .4}), T('finance', 'Money and investing', '💸', a={'money': .3}), T('commentary', 'Commentary', '🎙️'), T('vlogs', 'Vlogs', '🤳'), T('asmr', 'ASMR', '🎧'),
  T('education', 'Learning', '🧠', t={'learn': .4}), T('music', 'Music', '🎵', a={'music': .2}), T('sports', 'Sports', '🏀', a={'sports': .3}), T('diy', 'DIY', '🔨'), T('travel', 'Travel', '✈️', a={'travel': .2}),
  T('fashion', 'Fashion', '👗', a={'fashion': .3}), T('pets', 'Pets', '🐶', a={'pets': .2}), T('cars', 'Cars', '🏎️'), T('news', 'News', '📰', a={'news': .3}), T('parenting', 'Parenting', '🍼', a={'family': .3})],
  FOLLOW3, ch=(3,), prio=2.0, kind='topic', fact='creator-types')
tiles('sports-play', 'fitness', 'How do you move?', [
  T('run', 'Running', '🏃', t={'active': .5}), T('lift', 'Lifting', '🏋️', t={'active': .4}), T('yoga', 'Yoga or pilates', '🧘', t={'health': .4}), T('cycle', 'Cycling', '🚴', t={'active': .4}),
  T('swim', 'Swimming', '🏊'), T('climb', 'Climbing', '🧗', t={'thrill': .4}), T('hike', 'Hiking', '🥾', t={'city': -.3}), T('basketball', 'Basketball', '🏀', a={'sports': .3}, t={'compete': .3}),
  T('soccer', 'Soccer', '⚽', a={'sports': .3}, t={'compete': .3}), T('football', 'Football', '🏈', a={'sports': .3}), T('tennis', 'Tennis', '🎾', a={'sports': .2}), T('pickleball', 'Pickleball', '🏓', t={'social': .2}),
  T('golf', 'Golf', '⛳', g={'x': .3, 'o': .2}), T('volleyball', 'Volleyball', '🏐'), T('ski', 'Skiing', '⛷️', t={'thrill': .3, 'luxe': .2}), T('snowboard', 'Snowboarding', '🏂', t={'thrill': .4}),
  T('surf', 'Surfing', '🏄', t={'thrill': .4}), T('martial', 'Martial arts', '🥋'), T('box', 'Boxing', '🥊', t={'intense': .3}), T('dance', 'Dance', '💃', t={'social': .3}), T('bowling', 'Bowling', '🎳'), T('walk', 'Long walks', '🚶')],
  PLAY3, ch=(3,), prio=2.0, kind='activity', fact='moves', none='I don’t really work out')
tiles('leagues', 'sports', 'What do you follow?', [
  T('nfl', 'NFL', '🏈'), T('nba', 'NBA', '🏀'), T('mlb', 'MLB', '⚾'), T('soccer', 'Soccer', '⚽'), T('nhl', 'NHL', '🏒'), T('college', 'College sports', '🎓', g={'z': .2}),
  T('f1', 'Formula 1', '🏎️', t={'luxe': .2}), T('ufc', 'UFC and boxing', '🥊', t={'intense': .4}), T('tennis', 'Tennis', '🎾'), T('golf', 'Golf', '⛳', g={'x': .2, 'o': .2}), T('wnba', 'WNBA', '🏀'), T('olympics', 'The Olympics', '🥇'),
  T('esports', 'Esports', '🎮', a={'games': .3}, g={'z': .4}), T('wrestling', 'Wrestling', '🤼'), T('cricket', 'Cricket', '🏏'), T('nascar', 'NASCAR', '🏁', t={'city': -.3})],
  FOLLOW3, ch=(3,), prio=2.1, kind='league', fact='follows')
tiles('countries', 'travel', 'Where have you been?', [
  T('mexico', 'Mexico', '🇲🇽'), T('canada', 'Canada', '🇨🇦'), T('uk', 'UK', '🇬🇧'), T('france', 'France', '🇫🇷'), T('italy', 'Italy', '🇮🇹'), T('spain', 'Spain', '🇪🇸'),
  T('greece', 'Greece', '🇬🇷'), T('germany', 'Germany', '🇩🇪'), T('japan', 'Japan', '🇯🇵', t={'novel': .2}), T('korea', 'Korea', '🇰🇷'), T('china', 'China', '🇨🇳'), T('thailand', 'Thailand', '🇹🇭', t={'novel': .2}),
  T('vietnam', 'Vietnam', '🇻🇳', t={'novel': .2}), T('philippines', 'Philippines', '🇵🇭'), T('india', 'India', '🇮🇳'), T('brazil', 'Brazil', '🇧🇷'), T('australia', 'Australia', '🇦🇺'), T('iceland', 'Iceland', '🇮🇸', t={'novel': .3}),
  T('morocco', 'Morocco', '🇲🇦', t={'novel': .3}), T('caribbean', 'The Caribbean', '🏝️'), T('hawaii', 'Hawaii', '🌺'), T('usa', 'The US', '🇺🇸')],
  TRAVEL3, sub='Tap once if you’ve been, twice if you loved it, three times if you want to go.', ch=(3,), prio=2.0, kind='place', fact='places')
tiles('going-out', 'events', 'A night out means…', [
  T('bars', 'Bars', '🍸', t={'night': .3}), T('clubs', 'Clubs', '🪩', t={'night': .5, 'social': .5}, g={'z': .3}), T('concerts', 'Concerts', '🎤', a={'concerts': .5}), T('comedy', 'Comedy shows', '😂'),
  T('games', 'Sports games', '🏟️', a={'sports': .4}), T('theater', 'Theater', '🎭'), T('museums', 'Museums', '🏛️', t={'learn': .3}), T('festivals', 'Festivals', '🎪', a={'festivals': .5}),
  T('house-parties', 'House parties', '🏠', t={'social': .4}), T('dinner-parties', 'Dinner parties', '🍽️', a={'food': .3}), T('karaoke', 'Karaoke', '🎤', t={'social': .4}), T('raves', 'Raves', '🎛️', t={'night': .6}, g={'z': .3}),
  T('brunch', 'Brunch', '🥂', a={'food': .3}), T('trivia', 'Trivia nights', '🧠', t={'learn': .3}), T('movies', 'The movies', '🍿', a={'movies': .3}), T('dates', 'Date nights', '💘', a={'dating': .1})],
  LIKE3, ch=(3, 4), prio=1.8, kind='activity', fact='nights-out')
tiles('topics', 'learning', 'What could you talk about for hours?', [
  T('history', 'History', '🏛️'), T('science', 'Science', '🧪'), T('psychology', 'Psychology', '🧠'), T('space', 'Space', '🚀'), T('tech', 'Tech', '💻', t={'tech': .4}),
  T('business', 'Business', '📈', a={'work': .2, 'money': .2}), T('politics', 'Politics', '🗳️', a={'news': .4}), T('truecrime', 'True crime', '🔪', t={'intense': .4}), T('philosophy', 'Philosophy', '🤔'),
  T('art', 'Art', '🎨', a={'design': .3}), T('health', 'Health', '🫀', a={'health': .3}), T('climate', 'The planet', '🌍'), T('money', 'Money', '💹', a={'money': .3}), T('celebs', 'Celebrity news', '⭐', t={'mainstream': .4}),
  T('sports', 'Sports', '🏆', a={'sports': .4}), T('food', 'Food', '🍜', a={'food': .3}), T('travel', 'Travel', '✈️', a={'travel': .3}), T('fashion', 'Fashion', '👗', a={'fashion': .3})],
  LIKE3, ch=(3, 4), prio=1.8, kind='topic', fact='topics')
tiles('splurge', 'money', 'Where does your money go when you treat yourself?', [
  T('food', 'Food', '🍽️', a={'food': .3}, t={'spend': .2}), T('travel', 'Travel', '✈️', a={'travel': .4}, t={'spend': .3}), T('clothes', 'Clothes', '👗', a={'fashion': .4}, t={'spend': .3}), T('tech', 'Tech', '💻', t={'tech': .4, 'spend': .3}),
  T('games', 'Games', '🎮', a={'games': .4}), T('shows', 'Concerts and shows', '🎤', a={'concerts': .4}), T('beauty', 'Beauty', '💄', a={'fashion': .3}), T('home', 'Home', '🛋️', a={'home': .4}),
  T('car', 'My car', '🚗', a={'gettingaround': .3}), T('pets', 'My pets', '🐶', a={'pets': .4}), T('fitness', 'Fitness', '🏋️', a={'fitness': .3}), T('gifts', 'Gifts for people', '🎁', t={'social': .2}), T('nothing', 'I don’t, I save', '🐷', t={'spend': -.7})],
  YES1, sub='Tap all that apply.', ch=(4,), prio=2.0, kind='thing', fact='splurges')
tiles('beauty', 'fashion', 'Your routine includes…', [
  T('skincare', 'Skincare', '🧴'), T('makeup', 'Makeup', '💄'), T('nails', 'Nails', '💅'), T('hair', 'Hair care', '💇'), T('fragrance', 'Fragrance', '🌸'), T('grooming', 'Shaving and grooming', '🪒'), T('none', 'Soap and done', '🧼', t={'luxe': -.3})],
  YES1, sub='Tap all that apply.', ch=(3,), prio=1.0, kind='thing', fact='routine')

# Estimates: clever, indirect, then confirmed by a guess at the end.
card(id='pick:top-shelf', type='pick', ch=[4], q='Can you reach the top shelf?', prio=1.6, est='height',
     opts=[opt('easy', 'Easily', E('🦒')), opt('tiptoe', 'On my tiptoes', E('🩰')), opt('stool', 'I need a step stool', E('🪜')), opt('am-stool', 'I am the step stool', E('🙋'))])
card(id='pick:2am', type='pick', ch=[2, 4], q='It’s 2 a.m. and you need help. How many people could you call?', prio=1.8, est='circle',
     opts=[opt('none', 'Honestly, nobody', E('🌑'), t={'social': -.4}), opt('one', 'One person', E('☝️')), opt('few', 'Two or three', E('✌️'), t={'social': .1}), opt('many', 'Five or more', E('🙌'), t={'social': .5})])
card(id='slider:group-chats', type='slider', ch=[2, 4], area='social', q='How many group chats are you in?', min=0, max=20, step=1, prio=1.2, fact='group-chats', left='None', right='20+',
     fx={'t': {'social': [-.5, .6]}, 'a': {'social': [-.3, .4]}})
card(id='pick:last-post', type='pick', ch=[3, 4], area='social', q='Your last post got…', prio=1.5, est='followers',
     opts=[opt('none', 'I don’t post', E('🙈'), t={'create': -.4}), opt('tiny', 'Under 50 likes', E('🌱')), opt('some', '50 to 500', E('👍'), t={'social': .2}), opt('lots', '500 to 5,000', E('🔥'), t={'create': .3, 'social': .3}), opt('big', 'More than 5,000', E('🚀'), a={'creators': .3}, t={'create': .6})])
card(id='pick:flight', type='pick', ch=[3, 4], area='travel', q='Long flight. Where are you sitting?', prio=1.5, est='budget',
     opts=[opt('economy', 'Economy, whatever’s cheapest', E('💺'), t={'spend': -.4, 'luxe': -.4}), opt('legroom', 'Paid for legroom', E('🦵'), t={'luxe': .2}), opt('points', 'Upgraded with points', E('🎟️'), t={'plan': .4, 'luxe': .3}),
           opt('business', 'Business, obviously', E('🥂'), t={'luxe': .8, 'spend': .5}), opt('never', 'I don’t fly', E('🚗'), a={'travel': -.3})])
card(id='pick:ride', type='pick', ch=[3, 4], area='gettingaround', q='Your ride?', prio=1.3, est='budget',
     opts=[opt('none', 'No car', E('🚇'), t={'city': .4}), opt('older', 'An older car that runs', E('🚗'), t={'luxe': -.3}), opt('newer', 'Something newer', E('🚙')), opt('ev', 'An EV', E('⚡'), t={'tech': .4}),
           opt('truck', 'A truck', E('🛻'), t={'city': -.4}), opt('nice', 'Something nice', E('🏎️'), t={'luxe': .7, 'spend': .4})])
card(id='pick:birth-order', type='pick', ch=[2, 4], area='family', q='In your family, you’re…', prio=1.4, fact='birth-order',
     opts=[opt('oldest', 'The oldest', E('👑'), t={'plan': .2}), opt('middle', 'Somewhere in the middle', E('🥪')), opt('youngest', 'The youngest', E('🍼')), opt('only', 'An only child', E('🌟')), opt('twin', 'A twin', E('👯'))])
card(id='pick:all-nighter', type='pick', ch=[2, 4], q='Your last all-nighter was for…', prio=1.5, est='education',
     opts=[opt('exam', 'An exam', E('📝'), a={'learning': .3}, g={'z': .6}), opt('work', 'A work deadline', E('💼'), a={'work': .3}), opt('party', 'A party', E('🪩'), t={'social': .5, 'night': .4}, g={'z': .3, 'y': .2}),
           opt('baby', 'A baby', E('🍼'), a={'family': .5}, g={'y': .3, 'x': .3}), opt('game', 'A game', E('🎮'), a={'games': .4}, t={'night': .3}), opt('show', 'A show I couldn’t stop', E('📺'), a={'tv': .3}, t={'night': .3}), opt('never', 'I don’t do those', E('😴'), t={'night': -.5, 'health': .3})])
card(id='pick:dating-who', type='pick', ch=[3, 4], area='dating', q='Who do you want to meet?', sub='Only if you want dating picks. Private to your account.', prio=.6, fact='dating-pref',
     gate={'fact': ['relationship', ['single', 'dating', 'complicated']]},
     opts=[opt('men', 'Men', E('🙋‍♂️')), opt('women', 'Women', E('🙋‍♀️')), opt('everyone', 'Everyone', E('🌈')), opt('skip', 'Rather not say', E('🤐'))])

# Chapter 4: your edges
card(id='multi:instant-no', type='multi', ch=[4], q='Instant no.', sub='Tap everything you never want suggested.', max=14, min=0, prio=3, fact='never',
     opts=[opt(k, n, E(ch), a=a) for k, n, ch, a in [
       ('horror', 'Horror', '👻', {}), ('reality', 'Reality TV', '🌹', {}), ('sports', 'Sports', '🏈', {'sports': -.4}), ('musicals', 'Musicals', '🎭', {}),
       ('truecrime', 'True crime', '🔪', {}), ('anime', 'Anime', '🍥', {}), ('country', 'Country music', '🤠', {}), ('crowds', 'Big crowds', '👥', {'festivals': -.3, 'concerts': -.2}),
       ('spicy', 'Spicy food', '🌶️', {}), ('camping', 'Camping', '🏕️', {}), ('clubs', 'Clubs', '🪩', {'events': -.2}), ('cruises', 'Cruises', '🛳️', {}),
       ('gore', 'Gore', '🩸', {}), ('cringe', 'Cringe comedy', '😬', {})]])

# Which items can appear in each chapter's react cards
for i in ITEMS:
    ch = [3]
    if i['kind'] == 'thing': ch = [4]
    if i['id'] in ('music:taylor-swift', 'creator:mrbeast', 'show:friends-1994', 'food:sushi', 'place:las-vegas', 'person:kim-kardashian', 'food:pineapple-pizza'): ch = [2, 3, 4]
    card(id='react:' + i['id'], type='react', ch=ch, area=i['area'], item=i['id'], prio=1)


# Lanes: what a visit to each area asks, in order. The first card of a lane is its probe: a clear "no" there
# ends the visit early. 'react:N' = N reaction cards for that area's items, picked by the engine.
DIVES = {
  'movies': ['tiles:movie-genres', 'react:3', 'apps:movies', 'pick:theater-couch'],
  'tv': ['tiles:tv-genres', 'react:4', 'apps:tv', 'pick:binge'],
  'music': ['tiles:music-genres', 'react:4', 'apps:music', 'tiles:instruments'],
  'games': ['tiles:game-genres', 'apps:games', 'react:2', 'pick:win-wander'],
  'sports': ['tiles:leagues', 'apps:sports', 'tt:watch-play'],
  'creators': ['tiles:creator-types', 'react:3', 'apps:creators', 'pick:short-long'],
  'social': ['apps:social', 'pick:post-lurk', 'pick:last-post', 'slider:group-chats'],
  'ai': ['pick:ai-feel', 'apps:ai'],
  'livetv': ['apps:livetv'],
  'podcasts': ['apps:podcasts', 'react:2'],
  'radio': ['apps:radio'],
  'books': ['tiles:book-genres', 'react:2', 'pick:fiction', 'apps:books', 'multi:read-how'],
  'audiobooks': ['apps:audiobooks'],
  'filmmaking': ['pick:make-videos', 'apps:filmmaking'],
  'musicproduction': ['tiles:instruments', 'pick:make-music', 'apps:musicproduction'],
  'news': ['multi:news-how', 'tiles:topics', 'apps:news'],
  'events': ['tiles:going-out', 'pick:party-size', 'apps:events'],
  'concerts': ['pick:concert-last', 'apps:concerts'],
  'festivals': ['pick:festival-go', 'apps:festivals'],
  'themeparks': ['pick:theme-ride', 'apps:themeparks'],
  'photos': ['pick:photos-how', 'apps:photos'],
  'design': ['pick:creative', 'apps:design'],
  'learning': ['multi:learning-now', 'tiles:topics', 'apps:learning'],
  'languages': ['multi:languages', 'apps:languages'],
  'family': ['pick:kids', 'pick:birth-order', 'apps:family'],
  'dating': ['pick:relationship', 'apps:dating', 'pick:dating-who'],
  'food': ['tiles:cuisines', 'react:5', 'apps:food', 'slider:spice', 'tiles:fruits', 'tiles:veggies', 'tiles:drinks', 'slider:dinner', 'multi:diet', 'multi:allergies', 'tiles:sweets'],
  'travel': ['tiles:countries', 'multi:trip-style', 'react:3', 'apps:travel', 'pick:flight', 'slider:trips'],
  'gettingaround': ['multi:getting-around', 'apps:gettingaround', 'pick:ride'],
  'shopping': ['apps:shopping', 'tt:online-store', 'tt:amazon-target'],
  'fashion': ['multi:style', 'apps:fashion', 'tiles:beauty'],
  'fitness': ['tiles:sports-play', 'apps:fitness', 'pick:workout-time', 'react:2'],
  'health': ['pick:sleep', 'multi:wellness', 'apps:health'],
  'home': ['pick:space', 'pick:rent-own', 'apps:home'],
  'pets': ['multi:pets-have', 'apps:pets'],
  'money': ['apps:money', 'multi:invest'],
  'work': ['pick:work-where', 'multi:field', 'apps:work'],
  'coding': ['pick:code', 'apps:coding'],
  'tools': ['apps:tools'],
  'weather': ['apps:weather'],
}
assert set(DIVES) == set(AREA), set(AREA) ^ set(DIVES)
for k, steps in DIVES.items():
    for st in steps:
        if st.startswith('react:'): continue
        assert st in {c['id'] for c in CARDS}, (k, st)

# ---------------------------------------------------------------------------------------------------------------
# Readings: short lines the engine fills in. {T:trait} picks the trait's label; conditions live in the engine.
COPY = {
  'chapters': [
    {'n': 1, 'title': 'First instincts.', 'sub': 'Don’t think. Just tap.'},
    {'n': 2, 'title': 'Your world.', 'sub': 'Now the big picture.'},
    {'n': 3, 'title': 'Your lanes.', 'sub': 'Only the parts of life that are yours.'},
    {'n': 4, 'title': 'Your edges.', 'sub': 'What you’d never, and what you’d secretly love.'},
    {'n': 5, 'title': 'The reading.', 'sub': 'Here’s what I figured out.'},
  ],
  'hit': ['Called it.', 'Knew it.', 'Thought so.', 'Too easy.', 'Saw that coming.'],
  'miss': ['Huh. Noted.', 'Didn’t see that coming.', 'Okay, you surprised me.', 'Plot twist.', 'Interesting. Taking notes.'],
  'fast': ['No hesitation.', 'Instant.', 'Didn’t even blink.'],
  'slow': ['That one took a minute.', 'Complicated?', 'You thought hard about that one.'],
}

# ---------------------------------------------------------------------------------------------------------------
bank = {
  'v': BANK_VERSION,
  'areas': [{'k': k, 'name': n, 'prior': p, 'miss': miss, 'giveup': giveup, 'img': E(ch), 'g': mapcats[k].get('g', 0)} for k, n, srcs, p, miss, giveup, ch in AREAS],
  'traits': [{'k': k, 'hi': hi, 'lo': lo, 'yhi': yhi, 'ylo': ylo} for k, hi, lo, yhi, ylo in TRAITS],
  'archetypes': [{'k': k, 'name': n, 'line': line, 't': t, 'a': a} for k, n, line, t, a in ARCHETYPES],
  'apps': apps,
  'items': ITEMS,
  'answers': {k: [{'value': x[0], 'label': x[1], 'group': x[2] if len(x) > 2 else 'tried'} for x in v] for k, v in ANSWERS.items()},
  'stance': STANCE,
  'cards': CARDS,
  'copy': COPY,
  'appGrid': connect['grid'],
  'dives': DIVES,
}
# resolve ('app', name) images to app keys; ('glyph', area) to the area's glyph cell
def resolve(img):
    if isinstance(img, tuple):
        if img[0] == 'app': return 'app/' + appk(img[1])
        if img[0] == 'glyph': return 'glyph/' + str(mapcats[img[1]].get('g', 0))
    return img
for c in CARDS:
    for o in c.get('opts', []):
        if 'img' in o: o['img'] = resolve(o['img'])
        fx = o.get('fx', {})
        if 'apps' in fx: fx['apps'] = {k: [appk(n) for n in v] for k, v in fx['apps'].items()}
# checks: every trait key is known
for c in CARDS:
    for o in c.get('opts', []) + ([{'fx': c['fx']}] if 'fx' in c else []):
        for t in o.get('fx', {}).get('t', {}): assert t in TRAIT, (c['id'], t)
        for a in o.get('fx', {}).get('a', {}): assert a in AREA, (c['id'], a)
for i in ITEMS:
    for a in i['fx'].get('a', {}): assert a in AREA, (i['id'], a)
    for t in i['fx'].get('t', {}): assert t in TRAIT, (i['id'], t)
ids = [c['id'] for c in CARDS]; assert len(ids) == len(set(ids)), 'duplicate card ids'

OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'e').mkdir(exist_ok=True); (OUT / 'art').mkdir(exist_ok=True)
for c in used_emoji: shutil.copyfile(EMOJI_DIR / f'{c}.webp', OUT / 'e' / f'{c}.webp')
for eid, v in used_art.items(): shutil.copyfile(ART_DIR / 'taste-art' / v['file'], OUT / 'art' / v['file'])
bank['credits'] = [{'id': eid, **{k: v[k] for k in ('title', 'source', 'provider', 'license')}} for eid, v in used_art.items()]
(OUT / 'bank.json').write_text(json.dumps(bank, ensure_ascii=False, separators=(',', ':')))
print('bank', BANK_VERSION, len(CARDS), 'cards', len(ITEMS), 'items', len(apps), 'apps', len(used_emoji), 'emoji', len(used_art), 'artworks',
      (OUT / 'bank.json').stat().st_size, 'bytes')

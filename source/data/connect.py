"""Write assets/connect.json: the app picker after Get A Headstart (Martin, Oct 27 2026).

All 600 apps from v7 (source/data/apps600.json, icons in assets/img/apps600/atlas-0..4.webp, 12 x 12 cells of 160 px),
and for each app every way to bring it into Neocast, from "Neocast: every way in, across 100 apps" (Oct 24 2026):
the 100 researched apps get their own rows; the rest get their category's ways. Guardrails from the same doc:
no messages, dating, bank or card data, health records, raw location or search history.

Run:  python3 source/data/connect.py   (then python3 source/build.py)
"""
import json, pathlib, re

S = pathlib.Path(__file__).resolve().parent
R = S.parent.parent
src = json.loads((S / 'apps600.json').read_text())

# ---------- the ways in ----------
WAYS = {
    'file': 'Download your data',
    'snap': 'Screen-record',
    'share': 'Share',
    'forward': 'Forward emails',
    'signin': 'Sign in',
    'phone': 'On your phone',
    'ai': 'Ask your AI',
    'request': 'Request your data',
}

def o(w, t, d, g='', m=''):
    return {'w': w, 't': t, 'd': d, 'g': g, 'm': m}

# generic rows, filled with the app name ({a})
SNAP_LIST = lambda what: o('snap', 'Screen-record your ' + what, 'Open {a}, start a screen recording and scroll. Neocast reads it on your phone and keeps the list.', '', '20 sec')
SHOT = lambda what: o('snap', 'Send screenshots of your ' + what, 'Take a few screenshots in {a}. Neocast reads them on your phone.', '', 'Seconds')
SHARE = lambda what: o('share', 'Share ' + what + ' to Neocast', 'Use the share button in {a} whenever something’s worth keeping.', '', 'Seconds each')
FWD = lambda what: o('forward', 'Forward your ' + what, 'Forward {a} emails to your private Neocast address, or add one filter that does it for you. Only those emails, nothing else.', '', '2 min, once')
AI = o('ai', 'Ask your AI', 'Paste a Neocast prompt into ChatGPT or Claude and it tells Neocast what it knows about your {a} habits.', '', '1 min')
CAL = o('phone', 'Allow your calendar', 'One permission on your phone covers every calendar on it. Neocast only reads.', 'Plans you’ve booked', '1 min, once')
WORKOUTS = o('phone', 'Allow workouts in Apple Health', 'Workout types and counts only. Never health conditions.', 'What you do to stay active', '1 min, once')
REQUEST = o('request', 'Request your data', 'Neocast drafts a data request to {a} for you to send. The reply can take a few days.', '', '1 min, then a wait')

# what each category's apps teach Neocast, and their ways in (best first)
CAT = {
    'movies':   ('Films you watch and love', [SNAP_LIST('watch history'), REQUEST, SHARE('a title'), AI]),
    'tv':       ('Shows you watch and love', [SNAP_LIST('Continue Watching and watchlist'), REQUEST, SHARE('a show'), AI]),
    'livetv':   ('Channels, live sports and shows', [SHOT('favorites and recordings'), AI]),
    'music':    ('Artists, albums and how you listen', [SNAP_LIST('library'), SHARE('a song or playlist'), AI]),
    'games':    ('Games you play', [SHOT('recently played'), AI]),
    'sports':   ('Teams, leagues and players', [SHOT('favorite teams'), AI]),
    'creators': ('Creators you follow', [SNAP_LIST('subscriptions'), SHARE('a video or post'), AI]),
    'filmmaking': ('What you make and how', [SHOT('projects'), AI]),
    'musicproduction': ('What you play and make', [SHOT('songs and projects'), AI]),
    'social':   ('Creators, places, brands and aesthetics', [SNAP_LIST('saved posts'), SHARE('a post'), AI]),
    'ai':       ('Everything you’ve told it you love', [o('ai', 'Paste what {a} knows about you', 'Neocast gives you a prompt. Paste it into {a} and paste the answer back.', 'Everything you’ve told it you love', '1 min')]),
    'podcasts': ('Shows you follow and finish', [SHOT('library'), SHARE('an episode'), AI]),
    'radio':    ('Stations and shows you love', [SHOT('favorites'), AI]),
    'books':    ('Books you read and rate', [SNAP_LIST('library'), SHARE('a book'), AI]),
    'audiobooks': ('Books you listen to', [SNAP_LIST('library'), FWD('purchase emails'), AI]),
    'news':     ('Topics and writers you read', [SHARE('an article'), FWD('newsletters'), AI]),
    'events':   ('Events you go to', [FWD('tickets and RSVPs'), CAL, SHOT('past events')]),
    'concerts': ('Artists, venues and how far you travel', [FWD('tickets'), CAL, SHOT('past events')]),
    'festivals': ('Festivals you go to', [FWD('tickets and passes'), CAL, SHOT('lineup favorites')]),
    'themeparks': ('Parks, rides and how often you go', [FWD('tickets and reservations'), CAL, SHOT('plans')]),
    'photos':   ('Places, food, concerts and trips', [o('phone', 'Pick photos to read', 'Choose photos on your phone. Neocast reads them there and keeps only what’s in them.', 'Places, food, concerts and trips', '1 min'), SHOT('albums')]),
    'art':      ('Artists and styles you love', [SHOT('saved works'), SHARE('a work'), AI]),
    'design':   ('Styles and what you make', [SHOT('saved work'), SHARE('a design'), AI]),
    'learning': ('Subjects you learn', [SHOT('courses'), AI]),
    'languages': ('Languages you’re learning', [SHOT('profile'), AI]),
    'family':   ('What your family loves', [AI], ),
    'restaurants': ('Places you go back to, cuisines, occasions', [FWD('reservations and receipts'), CAL, SNAP_LIST('saved places')]),
    'fooddelivery': ('Cuisines, spots and reorders', [FWD('receipts'), SNAP_LIST('orders')]),
    'cooking':  ('What you cook', [SHARE('a recipe'), SNAP_LIST('saved recipes')]),
    'groceries': ('What you cook at home', [FWD('receipts'), SNAP_LIST('orders')]),
    'travel':   ('Trips and the stays you pick', [FWD('confirmations'), SNAP_LIST('trips'), REQUEST]),
    'fashion':  ('Your style and brands', [FWD('orders'), SNAP_LIST('wishlist'), SHARE('a product')]),
    'shopping': ('Brands, products and hobbies', [FWD('orders'), SNAP_LIST('orders and wishlist'), SHARE('a product')]),
    'fitness':  ('Sports and how you train', [WORKOUTS, SHOT('activity')]),
    'health':   ('How you stay active', [WORKOUTS]),
    'wellbeing': ('', []),
    'sleep':    ('', []),
    'healthcare': ('', []),
    'beauty':   ('Brands and the places you book', [FWD('orders and bookings'), SNAP_LIST('favorites')]),
    'home':     ('Your style at home', [FWD('orders'), SNAP_LIST('saved ideas'), SHARE('a product')]),
    'housing':  ('Neighborhoods and homes you like', [SNAP_LIST('saved homes'), SHARE('a listing')]),
    'pets':     ('Your pets and what they love', [FWD('orders and bookings'), SHOT('pet profile')]),
    'kids':     ('What your kids love', [SHOT('favorites'), AI]),
    'cars':     ('Cars, trips and how you get around', [FWD('receipts and bookings'), SHOT('saved cars')]),
    'gettingaround': ('Where you go: venues, neighborhoods, airports', [FWD('receipts'), REQUEST]),
    'maps':     ('Places you save', [SNAP_LIST('saved places'), SHARE('a place')]),
    'outdoors': ('Trails, parks and how far you go', [SNAP_LIST('saved lists'), WORKOUTS]),
    'weather':  ('', []),
    'money':    ('', []),
    'investing': ('', []),
    'messaging': ('', []),
    'dating':   ('', []),
    'work':     ('', []),
    'productivity': ('', []),
    'jobs':     ('', []),
    'school':   ('', []),
    'coding':   ('Tools and projects you love', [SHARE('a project'), AI]),
    'tools':    ('', []),
    'web':      ('Sites you love', [SHARE('a page'), AI]),
    'knowledge': ('What you’re curious about', [SHARE('a page'), AI]),
}
# categories with nothing to bring in, and why (shown in the sheet)
NOTE = {
    'messaging': 'Neocast never reads messages. {a} stays on your map as an app you use.',
    'dating': 'Neocast never reads dating apps. {a} stays on your map as an app you use.',
    'money': 'Neocast doesn’t connect to banks, cards or payments. {a} stays on your map as an app you use.',
    'investing': 'Neocast doesn’t connect to investment accounts. {a} stays on your map as an app you use.',
    'healthcare': 'Neocast never reads health records. {a} stays on your map as an app you use.',
    'wellbeing': 'Neocast doesn’t read what you do in {a}. It stays on your map as an app you use.',
    'sleep': 'Neocast doesn’t read sleep data. {a} stays on your map as an app you use.',
    'work': 'Work apps stay out of your map. {a} is listed as an app you use, and nothing is read.',
    'productivity': 'Neocast doesn’t read your files or notes. {a} stays on your map as an app you use.',
    'jobs': 'Job apps stay out of your map for now. {a} is listed as an app you use, and nothing is read.',
    'school': 'School apps stay out of your map for now. {a} is listed as an app you use, and nothing is read.',
    'weather': 'There’s nothing to bring in from {a}. It stays on your map as an app you use.',
    'tools': 'There’s nothing to bring in from {a}. It stays on your map as an app you use.',
    'family': '',
}

# ---------- the researched apps (the Oct 24 playbook), by App Store name ----------
SP = {}
def app(name, learns, *rows, what=None, note=None):
    SP[name] = {'g': learns, 'o': list(rows), 'what': what, 'note': note}

# Streaming
app('Netflix', 'Every title and date back to day one, and your thumbs ratings',
    o('file', 'Download your viewing activity', 'Account → your profile → Viewing activity → Download all. Do it once per profile.', 'Every title and date', '30 sec'),
    o('request', 'Request your full data', 'Netflix’s data request adds your thumbs ratings. Neocast drafts it for you.', 'Thumbs ratings', 'Up to 30 days'),
    SHARE('a title'),
    what=['Viewing activity', 'Thumbs ratings', 'My List'])
app('YouTube', 'Creators, channels, clips and fan edits',
    o('file', 'Save your history from Google Takeout', 'Takeout → YouTube → history. Save it to Google Drive and pick the file in Neocast.', 'Watch history', '2 min, then a wait'),
    o('signin', 'Sign in with Google', 'Brings your subscriptions and liked videos. YouTube doesn’t share watch history this way.', 'Subscriptions and likes', '30 sec'),
    SHARE('a video'),
    what=['Watch history', 'Liked videos', 'Subscriptions', 'Playlists'])
for n, extra in [('Disney+', 'Franchises and what’s in progress'), ('HBO Max', 'Prestige drama and HBO shows'), ('Hulu', 'Shows, FX and network TV'),
                 ('Paramount+', 'Shows and live sports'), ('Peacock', 'NBC shows and live sports')]:
    app(n, extra, REQUEST, SNAP_LIST('Continue Watching and watchlist'), SHARE('a title'))
app('Prime Video', 'Viewing history with dates, and your watchlist',
    o('file', 'Request your data from Amazon', 'Amazon → Request Your Data → Prime Video. One request per profile.', 'Viewing history, watchlist', '1–3 days'), SHARE('a title'))
app('Apple TV', 'Purchases and rentals',
    o('file', 'Get a copy of your Apple data', 'privacy.apple.com → Get a copy of your data.', 'Purchases and rentals', 'Up to 7 days'),
    SHOT('Up Next'))
app('Letterboxd', 'Your diary, star ratings, reviews and watchlist',
    o('file', 'Export your data', 'Settings → Data → Export your data. It’s ready almost at once.', 'Diary, ratings, reviews, watchlist', '30 sec'),
    what=['Diary', 'Ratings', 'Reviews', 'Watchlist'])
app('IMDb', 'Ratings out of 10 and your watchlist',
    o('file', 'Export your ratings', 'Your ratings → Export.', 'Ratings, watchlist', '30 sec'), SHARE('a title'))
for n in ['AMC Theatres', 'Regal', 'Cinemark', 'Fandango']:
    app(n, 'Films you see in theaters, formats and how often', FWD('ticket emails'), SHOT('past tickets'))
app('Plex', 'Watch history from your own media server', o('signin', 'Sign in with Plex', 'One tap.', 'Watch history', '30 sec'))
# Sports and live
app('ESPN', 'Teams, leagues and fantasy', SHOT('favorite teams'), AI)
app('NBA', 'Your team and players', SHOT('favorites'))
app('FotMob', 'Soccer teams and leagues', SHOT('followed teams'))
app('Twitch', 'Streamers, games and live culture', o('signin', 'Sign in with Twitch', 'One tap. Neocast sees the channels you follow.', 'Followed channels', '30 sec'), SHARE('a stream'))
# Music
app('Spotify', 'Every play since your account began: artists, podcasts and film composers',
    o('file', 'Download your extended streaming history', 'Account → Privacy settings → Download your data → Extended streaming history.', 'Every play, with dates', 'A few days'),
    SHARE('a song or playlist'),
    what=['Streaming history', 'Playlists', 'Liked songs', 'Podcasts you follow'])
app('Apple Music', 'Artists, your library and listening by year',
    o('phone', 'Allow Apple Music on your phone', 'Recently played and your library.', 'Recent plays, library', '1 min, once'),
    o('file', 'Get a copy of your Apple data', 'privacy.apple.com → Get a copy of your data. Adds daily play history.', 'Play history', 'Up to 7 days'))
app('YouTube Music', 'Artists, songs and mixes', o('file', 'Save your history from Google Takeout', 'Takeout → YouTube and YouTube Music → history.', 'Listening history', '2 min, then a wait'))
app('SoundCloud', 'Underground, DJ and remix taste', SHOT('likes'), SHARE('a track'))
app('TIDAL', 'Your library and playlists', o('signin', 'Sign in with TIDAL', 'One tap.', 'Collection, playlists', '30 sec'))
# Podcasts and books
app('Apple Podcasts', 'Shows you follow', SHOT('Library → Shows'), SHARE('an episode'))
app('Overcast', 'Subscriptions and episode progress', o('file', 'Export your OPML file', 'overcast.fm → Export OPML (extended).', 'Subscriptions, progress', '30 sec'))
app('Pocket Casts', 'Your subscriptions', o('file', 'Export your OPML file', 'Profile → Settings → Export OPML.', 'Subscriptions', '30 sec'))
app('Audible', 'Books you listen to, narrators and genres', SNAP_LIST('library'), FWD('purchase emails'))
app('Libby', 'Every library loan, ebook and audiobook', o('file', 'Export your timeline', 'Timeline → Export → Spreadsheet.', 'Every loan', 'Instant'))
app('Goodreads', 'Shelves, ratings, dates read and re-reads',
    o('file', 'Export your library', 'My Books → Import and export → Export library (on the web).', 'Shelves, ratings, dates', '1 min'),
    what=['Shelves', 'Ratings', 'Dates read', 'Reviews'])
app('StoryGraph', 'Ratings, moods and pace', o('file', 'Export a CSV', 'Manage account → Export StoryGraph library.', 'Ratings, moods, pace', '1 min'))
app('Kindle', 'Books, highlights and reading sessions', o('file', 'Request your data from Amazon', 'Amazon → Request Your Data → Kindle.', 'Books, highlights, reading', '1–3 days'))
app('Apple Books', 'Books and audiobooks you’ve bought', o('file', 'Get a copy of your Apple data', 'privacy.apple.com → Get a copy of your data.', 'Purchases', 'Up to 7 days'), SHOT('library'))
app('The New York Times', 'Topics, columnists, Cooking and Games', SHARE('an article or recipe'), FWD('newsletters'))
app('Substack', 'Writers you actually read', o('ai', 'Ask your AI', 'Your assistant lists the newsletters you open, using its own email connection. Nothing else is read.', 'Writers you read', '1 min'), FWD('newsletters'))
# Games
app('Steam', 'Your library and hours played', o('signin', 'Sign in with Steam', 'One tap. Your game details need to be public.', 'Library, hours played', '30 sec'))
app('Xbox', 'Games and genres', SHOT('recently played'), REQUEST)
app('PlayStation App', 'Games and hours', o('file', 'Request your data', 'PlayStation’s data access request sends a spreadsheet.', 'Games, hours', 'Up to 7 days'), SHOT('Wrap-Up'))
app('Nintendo Switch App', 'Games and play time', SHOT('Play Activity'))
app('Chess.com', 'Games, openings and rating', o('signin', 'Type your username', 'Chess.com’s public profile is enough. No password.', 'Games, openings, rating', '10 sec'))
# Social
app('Instagram', 'Creators, places, brands, food and aesthetics',
    o('file', 'Download your information', 'Accounts Center → Your information and permissions → Download your information → choose JSON.', 'Saved folders, likes, follows, interests', 'Minutes to a day'),
    o('snap', 'Screen-record a saved folder', 'Open Saved, open a folder, start a screen recording and scroll. Neocast reads the posts on your phone.', 'One saved folder at a time', '20 sec each'),
    SHARE('a post or reel'),
    what=['Saved folders', 'All saved posts', 'Liked posts', 'Accounts you follow', 'Your interests'])
app('TikTok', 'Creators, sounds and niches',
    o('file', 'Download your data', 'Settings and privacy → Account → Download your data → choose JSON, not TXT.', 'Watch history, likes, favorites, follows', 'Minutes to a few days'),
    o('snap', 'Screen-record your Favorites', 'Open Favorites, start a screen recording and scroll.', 'Favorite videos and collections', '20 sec'),
    SHARE('a video'),
    what=['Favorites collections', 'Liked videos', 'Following', 'Watch history'])
app('X', 'Follows, likes and posts', o('file', 'Download your archive', 'Settings → Your account → Download an archive of your data.', 'Follows, likes, posts', 'A few days'), SHARE('a post'),
    what=['Likes', 'Following', 'Your posts'])
app('Reddit', 'Communities and saved posts', o('file', 'Request your data', 'Settings → Request your data. It arrives as a CSV.', 'Communities, saved posts', 'A few days'), SHARE('a post'),
    what=['Saved posts', 'Communities', 'Upvotes'])
app('Pinterest', 'Aesthetics, plans and recipes', o('signin', 'Sign in with Pinterest', 'One tap.', 'Boards and pins', '30 sec'), SHARE('a pin'),
    what=['Boards', 'Saved pins'])
app('Snapchat', 'Shows and creators you follow', o('file', 'Download My Data', 'Settings → My Data → Submit request.', 'Follows', 'Minutes to days'))
app('Discord', 'Communities, games and fandoms', o('signin', 'Sign in with Discord', 'One tap. Neocast sees which servers you’re in, never your messages.', 'Servers you’re in', '30 sec'))
app('Bluesky', 'Follows and likes', o('signin', 'Type your handle', 'Bluesky is an open network. No password.', 'Follows, likes', '10 sec'))
app('Facebook', 'Pages, groups and events', o('file', 'Download your information', 'Accounts Center → Your information and permissions → Download your information → choose JSON.', 'Pages, groups, events', 'Minutes to a day'), SHARE('a post'))
app('Threads', 'Creators and topics', o('file', 'Download your information', 'Accounts Center → Your information and permissions → Download your information.', 'Follows, likes', 'Minutes to a day'))
# AI
app('ChatGPT', 'Everything you’ve told it you love', o('ai', 'Paste what ChatGPT knows about you', 'Neocast gives you a prompt. Paste it into ChatGPT and paste the answer back.', 'Everything you’ve told it', '1 min'))
app('Claude', 'Everything you’ve told it you love',
    o('ai', 'Add the Neocast connector', 'Add Neocast in Claude’s connectors. Claude can then tell Neocast what it knows.', 'Everything you’ve told it', '1 min'),
    o('ai', 'Paste what Claude knows about you', 'Neocast gives you a prompt. Paste it into Claude and paste the answer back.', '', '1 min'))
app('Gemini', 'Everything you’ve told it you love', o('ai', 'Paste what Gemini knows about you', 'Neocast gives you a prompt. Paste it into Gemini and paste the answer back.', '', '1 min'),
    o('file', 'Save your Gemini activity from Google Takeout', 'Takeout → Gemini Apps activity.', 'Your chats’ topics', 'A few hours'))
# Events
for n in ['Ticketmaster', 'Live Nation', 'DICE', 'AXS', 'SeatGeek', 'StubHub', 'Vivid Seats', 'Gametime']:
    app(n, 'Artists, teams, venues and how far you travel', FWD('ticket emails'), CAL)
app('Eventbrite', 'Events you go to', o('signin', 'Sign in with Eventbrite', 'One tap. Neocast sees your own orders.', 'Events attended', '30 sec'), FWD('ticket emails'))
for n, g in [('Luma', 'Tech and community events'), ('Partiful', 'Parties and friends’ events'), ('Meetup', 'Groups and hobbies')]:
    app(n, g, FWD('invites and RSVPs'), CAL)
# Food
for n in ['DoorDash', 'Uber Eats']:
    app(n, 'Cuisines, spots and reorders', FWD('receipts'), SNAP_LIST('Orders'))
app('Instacart', 'What you cook at home', FWD('receipts'))
for n in ['OpenTable', 'Resy', 'Tock']:
    app(n, 'Restaurants, party size and occasions', FWD('confirmations'), CAL)
app('Yelp', 'Saved spots and reviews', SNAP_LIST('bookmarks and collections'), REQUEST)
app('Beli', 'Restaurants already ranked against each other', SNAP_LIST('ranked list'))
app('Starbucks', 'Your usual orders and stores', SHOT('order history'), FWD('receipts'))
# Travel and getting around
for n in ['Uber', 'Lyft']:
    app(n, 'Where you go: venues, neighborhoods and airports',
        o('file', 'Download your data', 'Privacy center → Download your data.', 'Every trip', '24–72 hours'), FWD('receipts'), what=['Trips', 'Places you go'])
app('Airbnb', 'Trips and the kind of stays you pick', o('file', 'Request your personal data', 'Account → Privacy → Request your personal data.', 'Reservations, reviews', 'A few days'), FWD('confirmations'))
for n in ['Expedia', 'Delta', 'United Airlines', 'Marriott Bonvoy', 'Hilton Honors', 'KAYAK', 'Hopper']:
    app(n, 'Trips, cities and hotels', FWD('itinerary emails'), CAL)
app('Booking.com', 'Trips and hotels', FWD('confirmations'), REQUEST)
app('Google Maps', 'Saved places, reviews and where you actually go',
    o('file', 'Save your lists from Google Takeout', 'Takeout → Saved and Maps (your places). Save to Google Drive and pick it in Neocast.', 'Saved lists, reviews', '2 min'),
    o('file', 'Export your Timeline on your phone', 'Google Maps → Your Timeline → Export. It never leaves your phone.', 'Where you actually go', '1 min'),
    what=['Saved lists', 'Reviews', 'Timeline'])
# Culture
for n in ['Disneyland', 'My Disney Experience', 'Six Flags']:
    app(n, 'Parks, dining and how often you go', FWD('tickets and reservations'), CAL)
# Fitness
app('Strava', 'Sports, routes and races', o('file', 'Download your account', 'Settings → My account → Download or delete your account → Request your archive.', 'Activities, routes', 'A few hours'), WORKOUTS)
app('Nike Run Club', 'Runs and races', WORKOUTS, REQUEST)
app('Garmin Connect', 'Sports and races', WORKOUTS, o('file', 'Export your data', 'Garmin account → Data management → Export your data.', 'Activities', 'A few days'))
app('Peloton', 'Classes, instructors and music', o('file', 'Download your workouts', 'Your profile on the web → Workouts → Download.', 'Classes, instructors', '1 min'))
app('AllTrails', 'Trails, difficulty and regions', SNAP_LIST('saved lists'))
for n in ['Oura', 'Fitbit', 'WHOOP']:
    app(n, '', note='Neocast doesn’t read {a}. Its terms don’t allow its data to be used with AI. {a} stays on your map as an app you use.')
# Shopping
app('Amazon Shopping', 'Products, brands and hobbies', o('file', 'Request your data', 'Amazon → Request Your Data → Your Orders. Every order back to the first.', 'Every order', '1–3 days'), FWD('order emails'))
app('Nike', 'Style and sports', o('file', 'Download your data', 'Nike account → Privacy → Download your data.', 'Orders, runs', 'A few days'), FWD('order emails'))
app('Etsy', 'Makers and styles', o('signin', 'Sign in with Etsy', 'One tap. Neocast sees your purchases.', 'Purchases', '30 sec'), FWD('order emails'))
# Career, life hubs
app('LinkedIn', 'Roles, skills and companies you follow', o('file', 'Get a copy of your data', 'Settings → Data privacy → Get a copy of your data. The fast file takes minutes.', 'Roles, skills, companies', 'Minutes'),
    note='Career data is only used if you turn it on.')
app('GitHub', 'Tech you love', o('signin', 'Sign in with GitHub', 'One tap. Neocast sees the repos you star.', 'Starred repos', '30 sec'))
app('Duolingo', 'Languages and streaks', SHOT('profile'))
app('Google Calendar', 'Free time, events you go to and hobbies', CAL, o('signin', 'Sign in with Google', 'Read-only. Neocast skips meeting details and guest lists.', 'Free time, events', '30 sec'))
app('Google Photos', 'Places, food, concerts and trips', o('phone', 'Pick photos to read', 'Choose photos on your phone. Neocast reads them there.', 'Places, food, concerts, trips', '1 min'))
app('Google Drive', 'Your downloads from other apps', o('file', 'Pick files from Drive', 'Save Takeout files to Drive and pick them in Neocast. Neocast only sees the files you pick.', 'The files you pick', '30 sec'))
app('Life360', '', note='Neocast never reads your family’s locations. {a} stays on your map as an app you use.')
app('Find My', '', note='Neocast never reads locations. {a} stays on your map as an app you use.')
app('Bark', '', note='Neocast never reads anything from {a}. It stays on your map as an app you use.')

# ---------- assemble ----------
cats = [{'k': c['k'], 'name': c['name']} for c in src['cats']]
apps, missing = [], set(SP)
for a in src['apps']:
    name = a['name']
    learns, rows = CAT[a['cat']]
    spec = SP.get(name)
    if spec:
        missing.discard(name)
        rows, learns = spec['o'], spec['g'] or learns
    note = (spec and spec['note']) or (NOTE.get(a['cat']) if not rows else '')
    fill = lambda s: s.replace('{a}', name)
    opts = [{**r, 't': fill(r['t']), 'd': fill(r['d'])} for r in rows]
    apps.append({'k': a['key'], 'c': a['cat'], 'n': name, 'cell': a['cell'],
                 'g': learns, 'o': opts, **({'what': spec['what']} if spec and spec['what'] else {}), **({'note': fill(note)} if note else {})})
assert not missing, missing
out = {'ways': WAYS, 'cats': cats, 'apps': apps, 'grid': src.get('grid'),
       'prompt': 'Set up my Tastebud using https://neocast.live/tastebud/skill. Continue here in this chat.'}
p = R / 'assets' / 'connect.json'
p.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
print('wrote', p, p.stat().st_size, 'bytes;', len(apps), 'apps;', sum(1 for x in apps if x['n'] in SP), 'researched;', sum(1 for x in apps if not x['o']), 'with nothing to bring in')

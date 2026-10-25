# neocast.us

The landing page for **Tastebud** by Neocast: “Your Tastebud.” and Start Now, then a solar system of fifty categories you orbit one at a time. Built from Martin’s Oct 24, 2026 memo (v5) and his Oct 25, 2026 notes (v6): the main text and button shine first, the map pulls up as you scroll, the whole system fills the screen, then the camera orbits every category with “Create your own tastebud.” and Start Now under it.

Static, single page, served by GitHub Pages from the repository root (custom domain in `CNAME`; pushing `main` deploys).
Earlier versions: v5 (the map-only landing) is commit `5faf8f7`; the full v4 page (Tastebud story, app, media chapter, founders) is kept on branch `parent-site-backup-v4` for a future parent-company site; v1 (black and white) on `v1-black-and-white`.

## Version 6 (Oct 25, 2026): the solar system

- **Welcome frame:** “Your Tastebud.”, Start Now and “Scroll to see the full map.” have the screen; the system sits low under them and a soft lens clears the space around the copy.
- **Scroll a little:** the map pulls up. **A little more:** the whole system fills the screen, the Tastebud massive in the middle and the spheres shrinking to fit: 50 categories on three rings, each with ten legs, each leg ending in an app’s official App Store icon on a glossy sphere. Category spheres carry an icon for the category (a music note for Music, a TV for Shows, a rollercoaster for Theme parks).
- **Keep scrolling:** the tour. The camera orbits round the sun to each of the 50 categories in turn (`PHASE` in `map3d.js`). The one in focus keeps its colour and is framed between the header and the copy; the others grey out, fade toward paper, sink and step aside. Under it: the category name, “Create your own tastebud.” (gradient, follows the cursor with a tilt, a highlight and an RGB split) and Start Now. A lens eases the map away from the copy; category changes flash a short RGB glitch. A rail of 50 ticks on the left jumps to any stop.
- **Home:** after Social the system drops low again under “Your Tastebud.” and Start Now.
- **Bottom right:** Return to main (from the first screen down) above the Neocast AI chat circle, which opens a small panel to start setup in ChatGPT or Claude, or copy the setup prompt.
- **Header:** the logo, plus a small Start Now whenever no other Start Now is on screen.
- **Reduced motion:** still views only (welcome, the whole system, each category, home). **No WebGL or no JavaScript:** the welcome frame with a picture of the system (`assets/img/map-poster.webp`) and Start Now.

## Files

- `source/index.src.html` → `index.html`. Edit the source, then run `python3 source/build.py`: it writes the map data and a screen-reader list of the apps from `source/apps.json`, and versions `site.css`, `site.js` and `map3d.js` by content hash (GitHub Pages caches for about ten minutes). Never edit `index.html` by hand.
- `assets/site.css`, `assets/site.js`: edit directly, then rebuild. `site.js` places the labels, runs the tour copy, the rail, the dock and the lens, and tells the map the free space for each stop (`map3d.frame`).
- `source/map3d/map3d.js` → `assets/map3d.js` (three.js r169, bundled and self-hosted, loaded after first paint): rings, legs, spheres (instanced, with the icon projected onto the front so it reads flat), the camera journey, focus and push-aside, the post pass (lens, glitch, flare). `cd source/map3d && npm install && npm run build`, then rebuild the page. Add `?still3d` to the URL to draw without the loop (for headless checks); `window.__tastebudMap.rects()` returns the screen boxes of the spheres in focus.
- `source/apps.json`: the 50 categories in tour order and the 500 apps (ten each) with App Store id, seller, URL, atlas cell and sphere colour (the icon’s own border colour).
- `assets/img/apps/atlas-0…7.webp` (2048 px) and `atlas-0…7-sm.webp` (1024 px, for small screens): the 500 icons, 8 × 8 cells of 256 px, in the order of `source/apps.json`. Official App Store artwork from the iTunes Search/Lookup API, fetched Oct 25, 2026 (some apps show their seasonal icon that week), cropped 4% to hide baked rims. Never redrawn or recoloured.
- `assets/img/apps/glyphs.webp`: the 50 category icons, drawn with Lucide icons (ISC licence) plus four in the same style (burger, sneaker, ball, chequered flag), stroked in the brand gradient.
- `assets/img/map-poster.webp` and `assets/img/og.png`: rendered from the live scene (the whole system; the welcome frame at 1200 × 630).
- Look: paper `#F6F3F0` with the app’s glow, ink `#181818`, Manrope only, one accent (the brand gradient `#FD9013 → #FD3155 → #E409CF → #4315FF`) on “Tastebud.”, Start Now, the subheading, the Tastebud and the legs. No lavender.
- `assets/brand/`: Martin’s Oct 24, 2026 brand-standard vector logos (kit crops, unedited). Never retype, redraw, recolour or stretch them.
- `assets/fonts/`: Manrope variable (SIL Open Font License).
- Start Now goes to `https://neocast.live/tastebud`. The footer says: “Example map. Apps belong to their owners; Neocast isn’t affiliated with them.”

## Rule for every Neocast page

Give the main action room to shine. When something is in focus (a headline, a category, a button), clear, push aside, grey out, blur or lens-distort what is around it rather than letting it compete.

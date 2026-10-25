# neocast.us

The landing page for **Tastebud** by Neocast: “Your Tastebud.” and one Start now button over a 3D map of your life. Built from Martin’s Oct 24, 2026 memo: the goal is to get people to click Start now as soon as possible; the map runs off the edges so you scroll to see all of it; way more media than the memo drew; 3D, with the camera, object angles and assets moving as you scroll.

Static, single page, served by GitHub Pages from the repository root (custom domain in `CNAME`; pushing `main` deploys).
Earlier versions: the full v4 page (Tastebud story, app, media chapter, founders) is kept on branch `parent-site-backup-v4` for a future parent-company site; v1 (black and white) on `v1-black-and-white`.

## Version 5 (Oct 24, 2026): Your Tastebud.

- **Welcome frame:** the Neocast logo, “Your Tastebud.”, Start now and “Scroll to see the full map.” over the map: the You orb in the middle, the memo’s five groups (Games, Music, Sports, Movies, Events) around it and their apps bleeding off the edges.
- **Scrolling** flies the camera out to the full map (four more groups unravel: Shows, Creators, Podcasts, Books; 56 apps in all), dives past the Games cluster, swings round to Movies and Shows from below, and comes home to the welcome frame, where Start now waits again. Icons sit on glossy tiles that turn toward the camera with a lag, groups bob, the map leans and turns.
- **Header:** the logo, plus a small Start now once the big button has scrolled away.
- **Apps** are official App Store icons (never redrawn or recoloured), listed with their App Store ids and sellers in `source/apps.json`. The footer says: “Example map. Apps belong to their owners; Neocast isn’t affiliated with them.”
- **Reduced motion:** the map is still and the journey jumps between three views (welcome, full map, home). **No WebGL or no JavaScript:** the welcome frame with a picture of the full map (`assets/img/map-poster.webp`) and Start now.

## Files

- `source/index.src.html` → `index.html`. Edit the source, then run `python3 source/build.py`: it writes the group labels and a screen-reader list of the apps from `source/apps.json`, and versions `site.css`, `site.js` and `map3d.js` by content hash (GitHub Pages caches for about ten minutes). Never edit `index.html` by hand.
- `assets/site.css`, `assets/site.js`: edit directly, then rebuild.
- `source/map3d/map3d.js` → `assets/map3d.js` (three.js, bundled and self-hosted, loaded after first paint): the layout (groups, fans, relaxation that keeps tiles apart and clear of the welcome copy), the camera keys for wide and tall screens, tiles, threads. `cd source/map3d && npm install && npm run build`, then rebuild the page. Add `?still3d` to the URL to draw the map without the loop (for headless checks); `window.__tastebudMap.rects()` returns every tile’s screen box.
- `assets/img/apps/atlas.jpg`: the 56 icons, 8 × 8 cells of 256 px (icon in the inner 244 px), in the order of `source/apps.json`. Fetched from the iTunes Search/Lookup API (artworkUrl512), cropped 4% to hide baked rims.
- `assets/img/map-poster.webp` and `assets/img/og.png`: rendered from the live scene (full map, front on; the welcome frame at 1200 × 630).
- Look: paper `#F6F3F0` with the app’s glow, ink `#181818`, Manrope only, one accent (the brand gradient `#FD9013 → #FD3155 → #E409CF → #4315FF`) on “Tastebud.”, Start now, the You orb and the threads. No lavender.
- `assets/brand/`: Martin’s Oct 24, 2026 brand-standard vector logos (kit crops, unedited). Never retype, redraw, recolour or stretch them.
- `assets/fonts/`: Manrope variable (SIL Open Font License).
- Start now goes to `https://neocast.live/tastebud`.

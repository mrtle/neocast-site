# neocast.us

Company site for **Neocast**, the pro-human broadcast. It leads with the flagship product, **Tastebud**, then features Neocast media (the launch film, *10 Humans vs. AI*, the campus reels and the newsroom VPRWRE) and ends with the founders, Martin Lee and Vedant Soni.
Static, single page, served by GitHub Pages from the repository root (custom domain in `CNAME`; pushing `main` deploys). Version 1 (black and white, Montserrat) is kept on branch `v1-black-and-white`.

## Version 4 (Oct 24, 2026): the dot

The period of “life.” in the headline is the You orb, the hub of a live 3D life map.

- **Hero and story.** A glossy three.js map (You orb, six pearl groups, gradient threads) sits under the headline, then holds on screen while three steps change it: *You can see it*, *You can control it* (“Legal dramas” forgotten, “Harvey Specter” saved), *You can learn from it* (the Witty trait travels to Tony Stark, 78% match; Disneyland picks up Crispy). Labels and leaves are HTML, placed every frame from the 3D positions. The map fits the room beside the text on desktop and sits above the cards on phones.
- **The app.** The Tastebud window is rebuilt in live HTML from the approved app screens 07 and 11 (Map and List views, nodes open the list), and flattens from a 3D tilt as it scrolls in.
- **Photo plates with product on them.** Ask (living room at night), Decide (theme park at dusk, predicted-enjoyment board), the rules with working switches, and “Curate your life.” on brand glass. The photographs are generated illustrations and say so in the footer.
- **Media and founders** as before, on the dark chapter and paper.
- **Motion**: masked line rises, pops, swings, deals and shutters, once each; one requestAnimationFrame loop; transforms and opacity only. Reduced motion shows the finished page (the map still, story states discrete). No WebGL or no JavaScript shows a poster image of the map.

## Files

- `source/index.src.html` → `index.html`. Edit the source, then run `python3 source/build.py`: it puts in the app window from `source/gen_window.py` and versions `site.css`, `site.js` and `map3d.js` by content hash (GitHub Pages caches for about ten minutes, and old CSS on new HTML breaks the page). Never edit `index.html` by hand.
- `assets/site.css`, `assets/site.js`: edit directly, then rebuild.
- `source/map3d/map3d.js` → `assets/map3d.js` (three.js, bundled and self-hosted, loaded after first paint): `cd source/map3d && npm install && npm run build`, then rebuild the page. Add `?still3d` to the URL to render the map without the loop (for headless checks).
- Look: the Neocast house design language. Paper `#F6F3F0` washed by the app’s glow, ink `#181818`, Manrope only, one accent (the brand gradient `#FD9013 → #FD3155 → #E409CF → #4315FF`) on emphasis words, names, primary buttons and key numbers, never behind cards. Glass and the plum two-part shadows come from the app’s components. No lavender.
- `assets/brand/`: Martin’s Oct 24, 2026 brand-standard vector logos (kit crops, unedited; see `assets/brand/README.md`). Never retype, redraw, recolour or stretch them. No third-party logos anywhere on the site.
- `assets/fonts/`: Manrope variable (SIL Open Font License).
- `assets/img/plates/`: the generated photo plates (1920 and 960 wide). `assets/img/map-poster.png`: the map fallback. `assets/img/show/` and `assets/img/clips/`: *10 Humans vs. AI* set stills and campus reel covers (same files as 10humansvsai.com). `assets/img/founder.jpg` (Martin) and `assets/img/vedant.jpg` (Vedant, from vedantsoni.com): founder portraits. `assets/img/og.png`: share image.
- The launch film loads from YouTube only when someone presses play.
- The VPRWRE list shows four built-in stories and swaps in the newest four from `https://vprwre.com/posts.json` in the browser when it can.
- Get Tastebud links go to `https://neocast.live/tastebud`; the setup prompt points assistants at `https://neocast.live/tastebud/skill`.

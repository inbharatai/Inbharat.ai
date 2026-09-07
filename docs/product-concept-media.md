# Product-card concept media

The SILT and Pocket AI cards retain the existing InBharat layout and use the owner-approved rendered clips as secondary background illustrations. These are not recordings of actual software runs or verified photographs of a final PAI enclosure.

- SILT is illustrated conceptually; its default packet path does not copy teacher weights or change receiver weights. Optional adaptation/compression paths require their own validation.
- PAI holds canonical models, runtimes, identity and encrypted state on the removable drive. Computation runs on a compatible host after assessment and asset verification; the drive is not presented as a compute accelerator.
- Media does not replace textual descriptions, navigation, patent notices or buttons.
- A glyph-line and control mask keeps the added imagery away from reading and interaction areas. Invalid/loading masks keep decoration hidden.
- Desktop and mobile playback is muted, inline and looping, admitted only when the card enters view. Reduced-motion stays static; Save-Data requires explicit playback. Offscreen/hidden tabs pause, and an explicit user pause survives scrolling away and back. If the browser blocks autoplay (for example under an OS power-saving policy), the poster remains with a Play control. Failed media retains the poster. Autoplay is conditional, never guaranteed against browser policy.

## Source and build

`assets-source/product-concepts/manifest.json` records SHA-256 and byte counts for the four approved media assets. The versioned Base64 files permit an atomic text-based Git commit; `npm run media:products` verifies all entries before materializing standard MP4/WebP files under the gitignored `public/product-concepts/`. Normal build/development entry points invoke this step. No network, model API or media-generation tool is needed to build the site.

SILT clip: 793,381 bytes. PAI clip: 93,339 bytes. Both are silent 8-second, 24fps H.264 derivatives of the approved clips; the PAI derivative crops black pillarboxing. Posters are frames from those clips. Looping is playback behavior, not a claim of a mathematically seamless loop.

`e2e/product-concept-media.spec.ts` checks real shipped-media playback in addition to isolated failure-policy fixtures. Other browser-suite API mocks do not establish real model/provider/authentication functionality. No mobile FPS, battery-life, ranking or full accessibility-certification claim follows from these tests.

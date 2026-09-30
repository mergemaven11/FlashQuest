# FlashQuest non-invasive ad policy

FlashQuest keeps core learning free and may support the Free tier with sponsor or ad placements.

## Product rules

Ads must never:

- appear between a question and its answer;
- appear inside the answer/reveal card;
- interrupt the **Did you get it?** mastery decision;
- use popups or interstitial takeovers;
- autoplay audio or video;
- force a click to continue studying;
- visually imitate FlashQuest learning controls.

## Approved placements

- below the main study/page interaction;
- between large library sections;
- a quiet room/sidebar sponsor area;
- selected marketing/landing sections.

## Plans

- **Free**: core learning remains available and may include quiet sponsor placements.
- **Pro**: ad-free.
- **Educator**: ad-free for educator and learner experiences covered by the paid entitlement.

## Provider integration

`frontend/src/ads.tsx` is the provider-neutral presentation layer. Until a real ad-network account and publisher identifier are configured, FlashQuest shows a low-friction house/sponsor fallback. A production ad provider should be loaded only after privacy, consent, performance, and layout-shift testing.

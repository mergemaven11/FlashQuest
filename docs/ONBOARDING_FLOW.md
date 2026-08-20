# FlashQuest onboarding flow

## Product rule
Visitors should understand the core memory loop without seeing the full product surface.

### Signed out
- Marketing landing page: one value proposition, one tiny demo CTA, one account CTA.
- `/demo`: a short Question → Hint → Reveal → XP taste.
- Full product routes are account-gated.

### First authenticated entry
- Normal first login goes to `/welcome` unless the user arrived with an explicit `next` destination.
- Welcome Quest introduces the major product destinations after signup.
- Completing or skipping Welcome Quest is remembered locally for that account.

### Returning authenticated users
- Normal login goes to `/study` after Welcome Quest has been seen.
- Full navigation is visible: Play, Arcade, Library, Quest Rooms, Deck Lab, My Decks, Deck Map, and Settings.

### Settings
Use the familiar gear affordance (`⚙️ Settings`) for experience, sound, and accessibility preferences rather than an ambiguous standalone sliders icon.

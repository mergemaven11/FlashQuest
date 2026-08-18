# Make your own deck ✨🗂️

FlashQuest’s is a reusable study engine. **Platform Engineering is the featured starter deck**, not a hard-coded limit on what the product can teach.

A visitor can play the public Platform Engineering deck without an account. A verified account unlocks private, user-owned decks.

## The simple version

1. **Try the demo** — play the featured Platform Engineering deck.
2. **Create an account** — name, email, password.
3. **Verify your email** — click the one-time link FlashQuest sends.
4. **Create a deck** — give it a name such as `AWS Solutions Architect`, `Spanish`, or `Biology Chapter 4`.
5. **Add cards** — choose a question, answer, category/domain, and card type.
6. **Study it** — the same XP, streak, mastery, and spaced-repetition engine now works on your topic.

## Concepts vs labs

Every custom card can be one of two types:

- **Concept** — learn or explain an idea.
- **Lab** — pretend something is broken or needs to be built, then explain the troubleshooting or implementation path.

That means a security deck can mix definitions with incident scenarios, a programming deck can mix language concepts with debugging exercises, and a school deck can mix facts with worked problems.

## Deck ownership

Custom decks belong to the signed-in account that created them.

- Other users cannot list or edit them.
- Custom cards can be edited or deleted by their owner.
- Deleting a custom deck also removes its cards, study progress, and review history.
- A featured deck can be copied into your account so you can customize the copy without changing the public demo.

## Featured Platform Engineering deck

The first starter pack contains **216 cards**:

- 144 concepts;
- 72 break/fix labs;
- 12 domains;
- 12 mastery levels.

The public copy is protected from normal editing. Server-side demo-owner authentication is required for destructive maintenance such as deleting built-in cards or resetting shared demo progress.

## Adding future starter packs

The product model is:

```text
User
  └── Deck
       └── Card
            ├── domain / category
            └── kind: concept | lab
```

Built-in starter packs are simply decks with `is_builtin=true` and no owner. New starter packs can therefore reuse the same deck/card/study engine rather than requiring a new application.

Good future examples include:

- AWS
- Azure
- Linux+
- Security+
- Python
- SQL / database engineering
- networking certifications
- interview preparation
- school subjects
- language learning

[Read how accounts are protected →](AUTHENTICATION.md){ .md-button .md-button--primary }
[Open FlashQuest’s →](https://flashcards-tobias.netlify.app/){ .md-button }

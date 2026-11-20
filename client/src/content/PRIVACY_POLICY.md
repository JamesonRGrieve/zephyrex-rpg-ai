# Privacy Policy

Last updated: November 20, 2026

Zephyrex RPG AI is an open-source app for roleplay with AI characters and an AI game master. You
keep character cards, personas and chats, and the app asks an AI model you choose to write the
characters' replies. This policy explains what it stores, where your words go, and how to remove
them.

Zephyrex RPG AI is maintained by Jameson R Grieve. Its source code is published under the AGPL, so
everything described here can be checked against the code.

## Two ways to run it

- **A self-hosted copy** is one someone runs from the published code, on their own machine or
  network. Whoever runs that copy holds its data, not the maintainer. A self-hosted copy has no
  accounts: it stores what is described here for the one person who uses it, and nothing about who
  they are.
- **A hosted service** run by the maintainer is not offered yet. This policy will say what it
  stores before it opens.

## What is stored

On a self-hosted copy, everything is kept in one database file on the machine that runs it:

- **Characters:** each card's name, description, personality, scenario, greetings, example
  dialogue, prompts, creator notes, tags, picture and any extra card data you import.
- **Personas:** the name, description and picture you play as.
- **Chats:** their title, which characters and persona they use, the author's note, and every
  message with its alternatives (swipes), its place in the chat's branches, and whether you
  bookmarked it.
- **Presets:** your sampler settings.
- **Model endpoints:** each endpoint's name, address, model name and, if you give one, its API key.
  The key is stored so the app can call the endpoint. It is never shown again or sent anywhere but
  that endpoint.

## Where your words go

When a character replies, the app sends the model endpoint you chose the text it needs: the
character's card, your persona, the chat's recent in-character messages and the author's note.
Out-of-character messages are not sent. That endpoint may be a model on your own machine or
network, or a hosted AI service. If it is a hosted service, that service receives the text under
its own privacy policy. Choose an endpoint you trust with what you write.

Nothing else leaves the machine. The app has no analytics, advertising or tracking scripts, and
pages load nothing from other websites.

## Cookies and browser storage

- **`theme`** remembers light or dark mode, until you clear it.
- Your browser may keep the app's pages for offline use once it is installed. They hold no chat
  content.

## How long it is kept

Everything is kept until you delete it. Deleting a character, persona, preset or endpoint removes it
at once. Deleting a chat removes its messages with it. Deleting a message removes the replies that
followed it in that branch.

## Children

Zephyrex RPG AI isn't meant for children under 13.

## Changes

If this policy changes, the date at the top changes with it, and the previous versions stay in the
project's public history.

## Contact

Questions go to the maintainer through the project's repository. Don't post personal details in a
public issue.

// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The landing page's words. The layout is @zephyrex/marketing's; what it says is this app's. Claims
 * here describe what the app does today or what docs/DESIGN.md plans, marked as such.
 */
import type { Faq, Feature, FooterColumn, Link } from '@zephyrex/marketing';

export const NAV: readonly Link[] = [
  { label: 'Features', href: '#features' },
  { label: 'How it compares', href: '#compare' },
  { label: 'FAQ', href: '#faq' },
];

export const START: Link = { label: 'Start playing', href: '/play' };

export const HERO = {
  title: 'Characters who know your world',
  lead: 'Chat and play with AI characters and an AI game master. Bring your SillyTavern cards, use any model you like, and pick up on any device, or run it yourself.',
};

export const FEATURES: readonly Feature[] = [
  {
    id: 'cards',
    title: 'Your characters, your cards',
    summary: 'Import SillyTavern cards (PNG or JSON, V1 to V3) and edit every field.',
    details: ['Greetings, example dialogue, system and post-history prompts', 'Export back to a V2 card any app can read'],
    availability: 'everywhere',
  },
  {
    id: 'branches',
    title: 'Swipes and branches',
    summary: 'Ask again for another reply, keep the best, and fork the story from any message.',
    details: ['Every alternative is kept', 'Edit or bookmark any message'],
    availability: 'everywhere',
  },
  {
    id: 'ooc',
    title: 'Talk to the table, not the story',
    summary: 'Out-of-character messages stay out of the story the model reads.',
    details: ['Switch between in character and out of character in one tap', 'Table talk is shown apart from the story'],
    availability: 'everywhere',
  },
  {
    id: 'gm',
    title: 'A game master that knows the table',
    summary: 'The GM narrates the world, and answers your out-of-character questions without touching the story.',
    details: ['House rules, pacing and tone notes it reads every turn', 'Pause the game any time; the GM still answers'],
    availability: 'everywhere',
  },
  {
    id: 'campaigns',
    title: 'Campaigns and scenarios',
    summary: 'Frame a campaign once, and run scenarios as moving parts: clocks, secrets and clues, people with agendas.',
    details: ['A brief for your players', 'Fill a clock or find a clue, and the GM knows'],
    availability: 'everywhere',
  },
  {
    id: 'lore',
    title: 'Lore and memory',
    summary: 'Lorebooks, a data bank of your notes, and rolling summaries keep long stories straight.',
    details: ['SillyTavern World Info in and out', 'Notes found by what the story is about'],
    availability: 'everywhere',
  },
  {
    id: 'safety',
    title: 'Safety tools built in',
    summary: 'Content rating, lines and veils in every prompt, and an X-card that takes a reply out at once.',
    details: ['No reason needed, and undoable', 'Kept out of summaries and lore too'],
    availability: 'everywhere',
  },
  {
    id: 'models',
    title: 'Any model, anywhere',
    summary:
      'Point it at Ollama, llama.cpp, a gateway or a hosted API: anything OpenAI-compatible, or text completion with instruct templates.',
    details: [
      'A model per job: replies, the GM, summaries, translation',
      'Your API keys are stored encrypted and sent only to the endpoint you chose',
    ],
    availability: 'everywhere',
  },
  {
    id: 'mobile',
    title: 'On your phone too',
    summary: 'Install it as an app. Every screen works by touch, offline where it can.',
    details: ['Bottom sheets and thumb-reach controls', 'Stays awake while a reply is written'],
    availability: 'everywhere',
  },
];

export const COMPARE: readonly { point: string; us: string; them: string }[] = [
  { point: 'Character cards and lorebooks', us: 'SillyTavern-compatible', them: 'SillyTavern’s own' },
  { point: 'Out-of-character table talk', us: 'Its own channel, kept out of the story', them: '(( )) inside the story' },
  { point: 'Phones and tablets', us: 'Built for touch, installable', them: 'Usable on a phone, built for desktop' },
  { point: 'A game master with real dice', us: 'Planned, with the Zephyrex VTT', them: 'Extensions and scripts' },
];

export const FAQS: readonly Faq[] = [
  {
    question: 'Does it work with my SillyTavern characters?',
    answer: 'Yes. Import PNG or JSON cards in the V1, V2 or V3 format, and export any character as a V2 card.',
  },
  {
    question: 'Which models can I use?',
    answer:
      'Any endpoint that speaks the OpenAI chat-completions API: Ollama, llama.cpp, vLLM, a gateway such as Bifrost, or a hosted service.',
  },
  {
    question: 'Where are my chats kept?',
    answer:
      'Here, in your account, so they follow you to every device you sign in on. Self-hosted, in a database on your own machine. Either way, the only other place your words go is the model endpoint you chose.',
  },
  {
    question: 'Is it free?',
    answer: 'Yes. It is open source under the AGPL, and the self-hosted edition is the whole app.',
  },
];

export const CLOSING = {
  title: 'Pull up a chair',
  body: 'Import a character, pick a model, and say hello.',
  action: START,
};

export const FOOTER: readonly FooterColumn[] = [
  { title: 'App', links: [START, { label: 'Characters', href: '/characters' }, { label: 'Models', href: '/models' }] },
  {
    title: 'Learn',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'FAQ', href: '#faq' },
    ],
  },
  { title: 'More', links: [{ label: 'Privacy policy', href: '/docs/privacy' }] },
];

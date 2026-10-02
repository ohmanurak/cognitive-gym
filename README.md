# Cognitive Gym

A 12-week, self-contained reasoning workbook for the analytically strong adult learner. No coach required. 45–60 min/day, 6 training days + 1 rest day per week.

**[Read the full workbook](workbook/Cognitive_Gym_Workbook.md)**

## What it trains

Reasoning habits under unfamiliar conditions: inferring structure from new information, rather than recognising puzzle types you have already seen.

Not promised: any IQ gain. Evidence that brain training transfers to general intelligence is weak. Evidence that deliberate practice improves the practised task is strong. No score in the workbook is an IQ estimate.

Realistic goals:
- Fewer careless errors
- Better problem representation
- Habit of generating rival hypotheses
- Better-calibrated confidence
- Faster correct reasoning on practised kinds of structure

## Structure

| Part | Contents |
| ---- | -------- |
| 0 | How it works: protocol, scoring, error taxonomy, hypothesis framework, indices, dashboard |
| 1 | Baseline assessment (pattern, working memory, abstraction, hypothesis testing, processing efficiency) |
| 2 | Weeks 1–12: exercises, weekly reflection, weekly scorecard |
| 3 | Final examination (75–90 min) |
| 4 | Answer key |
| 5 | Appendices: blank logs, formula sheet |

## Daily protocol

| Block | Time | Purpose |
| ----- | ---: | ------- |
| A. Warm-up | 10 min | Low-stakes fluency |
| B. Primary skill | 15 min | The day's main skill |
| C. Secondary skill | 15 min | Cross-training |
| D. Novel / integrated | 10 min | Transfer to unfamiliar structure |
| E. Error analysis | 10 min | Log every error with the taxonomy |

Materials: pen, paper, timer. No calculator or web search unless an item says so.

## Discipline rule

Never open Part 4 (answer key) before committing an answer and a confidence rating for every item in the block. Checking mid-block destroys the diagnostic value.

## Practice app (run it on your computer)

A local web app that runs the workbook for you: timed Blocks, Answer Key hidden until you commit, scoring, error log and progress. Your data stays in your browser.

**You need:** [Node.js 22 or newer](https://nodejs.org) (the LTS installer is fine) and [Git](https://git-scm.com).

```sh
git clone https://github.com/ohmanurak/cognitive-gym.git
cd cognitive-gym/app
npm ci
npm run dev
```

Open the address it prints (usually http://localhost:5173). To run it again later, open a terminal in the `app` folder and run `npm run dev`.

Tips:
- Progress is stored in this browser on this computer. Use the **Data** page to export a backup, and to restore it on another browser or machine.
- Use the same address every time; a different address or port is a different, empty store.
- Update: `git pull`, then `npm ci`, then `npm run dev`.
- More (tests, build, deploy, release checklist): [app/README.md](app/README.md).

### Claude coaching (optional)

The Error log ranks what to work on (Focus) without any setup. On top of that, Claude can write a Coaching note for a Focus or a single miss, and find study links. This needs your own Anthropic API key and is off until you add one.

**Setup:** create `app/.env.local` (it is gitignored) containing:

```sh
ANTHROPIC_API_KEY=sk-ant-...
# optional, monthly spend cap in USD (default 5)
COACH_MONTHLY_USD=5
```

Then restart `npm run dev`. The Coach buttons appear only when the key is set.

**Only under `npm run dev`.** The key is read by the local dev server and never reaches the browser or the build. A static build (`npm run build`, any deployed copy) has no Coach buttons. Saved Coaching notes still show there.

**Costs** (approximate, charged to your Anthropic account):

| Action | Cost |
| ------ | ---: |
| Coach me (a Focus) / Coach this miss | ~$0.01 |
| Regenerate a note | ~$0.01 |
| Find study links (YouTube + blog web search) | ~$0.16 |

Each note shows its actual cost. The dev server keeps a running total per calendar month in `coach-spend.json` in the save folder (`~/CognitiveGym`, or `COGYM_SAVE_DIR`). Once the total reaches `COACH_MONTHLY_USD`, the buttons are disabled with "Monthly coaching budget used" until the next month. Nothing is ever generated automatically; every call is a click.

**What is sent to Anthropic.** Only for the misses you coach, and only scored Items (the Discipline Rule holds):
- Coach me: up to your latest 5 coded first-attempt misses of that Focus, each with its Item text, your Answer, the Key (answer, derivation, trap), Skill, points and score, Week, Con/Car, failed assumption and Fix; plus the Error code's definition and the Focus evidence (misses, points lost, Weeks, Fix not working).
- Coach this miss: the same fields for that one miss, plus its Error code's definition if coded.
- Find study links: only the note's short search topic. Links are checked by your machine (YouTube oEmbed, the page itself) before they are shown.

Nothing else from your progress (other Items, Reflections, span tests, times) is sent. The console logs only status, tokens and cost.

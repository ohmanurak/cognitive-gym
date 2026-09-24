# Cognitive Gym

A self-paced 12-week reasoning training programme, defined by the workbook, and the practice app that delivers it and tracks the learner's progress through it.

## Programme structure

**Workbook**:
The source document defining all content, scoring rules, and the answer key.
_Avoid_: Book, manual, course

**Part**:
A top-level division of the Workbook (0 rules, 1 Baseline, 2 Programme, 3 Final Examination, 4 Answer Key, 5 Appendices).
_Avoid_: Chapter, module

**Baseline**:
The initial assessment taken before Week 1, giving the starting point for every Index.
_Avoid_: Pre-test, placement test

**Week**:
One of 12 units of the Programme, with a theme, six training Days, a Reflection and a Scorecard.
_Avoid_: Module, unit

**Phase**:
A group of Weeks with a shared pacing rule: Accuracy (1–4), Automaticity (5–8), Speed (9–10), Integration (11–12).
_Avoid_: Stage, level

**Day**:
One training session within a Week (Days 1–5 are daily practice, Day 6 is the weekly challenge; a seventh day is rest).
_Avoid_: Lesson, session

**Block**:
A timed segment of a Day, labelled A (warm-up), B (primary skill), C (secondary skill), D (novel/integrated), E (error analysis).
_Avoid_: Section, step

**Final Examination**:
The closing mixed, timed assessment after Week 12.
_Avoid_: Final test

## Practice

**Item**:
A single question, identified by a code such as `W3D2-B1`, with a Skill tag and a point value.
_Avoid_: Exercise, problem, question

**Skill**:
The ability an Item trains, tagged PD, AB, WM, HT, PE, or IR.
_Avoid_: Category, topic

**Answer**:
The learner's response to an Item, recorded before the key is seen.
_Avoid_: Submission, guess

**Confidence**:
A 1–5 rating the learner gives an Answer before checking it.
_Avoid_: Certainty score

**Commit**:
Locking an Answer and its Confidence for every Item in a Block (except Items with a Skip flag), which is the precondition for viewing the Key.
_Avoid_: Submit, finalize

**Key**:
The correct answer, derivation, and common trap for an Item, from Part 4.
_Avoid_: Solution, answer sheet

**Discipline Rule**:
The Workbook's rule that the Key is never viewed before the whole Block is Committed.
_Avoid_: Honour system, lock

**Cover-and-reveal**:
A working-memory Item where material is shown, hidden, and then must be worked from memory.
_Avoid_: Memory item

**Digit span**:
A task where digits are presented one at a time and the learner recalls them, forward or backward. Not an Item: it has no id, points, or Key.
_Avoid_: Memory test

**Span test**:
The counted span measurement: two attempts per length (forward 4–9, backward 3–7), full ladder, results hidden until it ends. The Baseline one uses fixed workbook sequences and counts as two progress units, forward and backward; optional later retests use random sequences and count toward WMI only. An abandoned ladder is discarded for WMI.
_Avoid_: Span drill, memory check

**Span practice**:
The free, uncounted Digit span trainer with random sequences and immediate feedback.
_Avoid_: Span test

**Reliable span**:
The longest length at which both attempts in a Span test were correct.
_Avoid_: Max span, best span

**Soft limit**:
A time ceiling that is advisory; running over is recorded but not penalized. A Block with no stated limit has none and shows only elapsed time.
_Avoid_: Target time

**Strict limit**:
A time ceiling stated by the Workbook on a labelled drill, Baseline Section 5, or the Final Examination (hard limit 90 min, 85 min target). When it passes, the Answer is frozen as the Timed answer and marked `T`.
_Avoid_: Hard deadline

**Timed answer**:
The Answer as frozen when a Strict limit ran out. Indices use its score.
_Avoid_: First answer

**Untimed answer**:
The Answer after further work past a Strict limit, marked `U`. Scored separately only when it differs from the Timed answer; the difference is the timed-vs-untimed gap.
_Avoid_: Final answer

**Skip flag (↷)**:
A flag on an Item meaning "skipped for now, return later". Not an Answer: a flagged Item may be Committed blank, counts as zero, and is left out of Calibration.
_Avoid_: Skipped answer

**Item target**:
A per-Item time goal stated by the Workbook (Weeks 5–6). Running over it by more than 50% marks the Item `S`.
_Avoid_: Item limit

**Accuracy gate**:
The rule that a timed Block under 75% accuracy earns zero speed credit and widens the next timed Block in that week by 25%. Later weeks' limits are never tightened.
_Avoid_: Speed penalty

## Scoring and analysis

**Suggestion**:
A non-binding hint of how an Answer compares with the Key (parts found out of total, numeric-equivalence matching). It never pre-selects a score, and the learner always confirms. Pure open Items get none.
_Avoid_: Auto-grade, auto-mark

**Rubric dimension**:
One of the five §0.8 criteria (local pattern, general rule, generalisation, alternative representation, limitations for AB; hypotheses, predictions, falsifiability, discrimination, information value for HT), each self-scored 0–2. Captured only for open AB and HT Items; AI and HI come from their totals.
_Avoid_: Criterion

**Rubric score**:
The points score of an open-ended Item, derived from its Rubric dimensions (points × total ÷ 10, rounded to a whole point) and editable.
_Avoid_: Grade

**Multi-step Item**:
A WM Item needing four or more sequential dependent operations. Defaulted from the Workbook's explicit tag and toggled by the learner at review; feeds WMI's multi-step accuracy.
_Avoid_: Hard Item, starred Item

**Provisional**:
An Index shown with its Item count but greyed out because it rests on too little data (AI/HI under 3 rubric Items, PI under 8 PD Items, efficiency under 5 PE Items), or on a renormalised WMI missing a class.
_Avoid_: Estimated

**Error code**:
The single primary category assigned to a wrong Answer: P, R, A, WM, H, L, C, S, or K.
_Avoid_: Mistake type

**Error analysis**:
The step where every first-attempt miss in a Day (Block E), the Baseline, or the Final Examination gets an Error code and a Fix. Completes itself when there are no misses. Day 6 misses are handled as the first step of the week-end.
_Avoid_: Review, debrief

**Reflection**:
The Workbook's fixed questions answered at the end of a Week (8), the Baseline (4), or the Final Examination (4). A Week's Reflection is required, and its "Strategy change for next week" sentence must be non-empty.
_Avoid_: Journal, notes

**Error log**:
The per-Day record of each error with its Error code, conceptual vs careless flag, failed assumption, and a strategy Fix.
_Avoid_: Mistake journal

**Fix**:
A concrete strategy sentence in the Error log; "be more careful" does not qualify.
_Avoid_: Lesson learned

**Scorecard**:
The end-of-Week table of score, accuracy, time, and main error per Skill.
_Avoid_: Report card

**Index**:
A longitudinal training-progress measure (PI, AI, WMI, HI, EI). Not an IQ estimate and not norm-referenced.
_Avoid_: IQ score, rating

**Calibration**:
How closely Confidence ratings match actual accuracy, exposing over- or underconfidence.
_Avoid_: Self-awareness score

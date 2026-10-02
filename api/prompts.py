"""Gemini prompts used on every /analyze request.

Prompts 1 and 2 (ASSIST + Bulletin -> JSON tables) run once, locally,
from scripts/build_tables.py. They are not needed at serving time.
"""

PROMPT_3 = """The attached file is a student's unofficial community college transcript
(PDF or photo). Extract every course the student took or is taking.

For each course return: code (department + number exactly as printed, e.g. "CS 111B"),
title, units (number), grade (exactly as printed; use "IP" for in progress,
"W" for withdrawn), and term (e.g. "Fall 2024").

Rules: ignore names, student IDs, addresses and GPA totals; do not return them.
If a value is unreadable, use an empty string. Do not guess."""


PROMPT_4 = """You are helping a CCSF student who is transferring into SFSU's Computer Science B.S.

REQUIREMENTS STILL NEEDED (from the official ASSIST check):
{missing_and_sfsu_only_json}

SFSU COURSES YOU MAY USE (with prerequisites):
{sfsu_courses_json}

START TERM: {start_term}

Build a term-by-term plan to finish the major.
Rules:
- Use ONLY course codes from the lists above. Never invent a course.
- Respect prerequisites: a course must come after all of its prerequisites.
- 12 to 15 units per term; Fall and Spring only.
- Each course may carry a "roadmap_term" (1-4). That is the semester SFSU's own
  ADT transfer roadmap places it in. Schedule courses in non-decreasing
  roadmap_term order: never put a roadmap_term 1 course after a roadmap_term 2 one.
- For each course, give a one-sentence "why" a student would understand.
- If something can't be scheduled, add it to "unscheduled" with the reason."""

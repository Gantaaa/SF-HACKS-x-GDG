"""Phase 2: turn the ASSIST agreement and the SFSU Bulletin into the two JSON
lookup tables the API serves from, then upload them to Firestore.

Needs: gcloud auth application-default login

    python scripts/build_tables.py              # generate both JSON files
    python scripts/build_tables.py --upload     # upload them after you've checked the rows

Check every row against the PDFs by eye before uploading. The accuracy claim in
the pitch rests on these two files, not on the model.
"""
import argparse, json, pathlib, sys
from google import genai
from google.genai import types

PROJECT = "gator-transfer-nav"
LOCATION = "us-central1"
MODEL = "gemini-2.5-flash"

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSIST_PDF = ROOT / "2026-2027 Computer Science, B.S. Agreement.pdf"
BULLETIN_PDF = ROOT / "bs-computer-science(SFSU).pdf"
ASSIST_JSON = ROOT / "scripts" / "assist_table.json"
SFSU_JSON = ROOT / "scripts" / "sfsu_courses.json"

PROMPT_1 = """You are converting an official ASSIST.org articulation agreement into JSON.
The attached PDF shows which City College of San Francisco (CCSF) courses satisfy
each San Francisco State University (SFSU) requirement for the Computer Science B.S.

For every SFSU course or requirement row in the agreement, output one object with:
- id: short snake_case name
- sfsu_course, sfsu_title, units: exactly as printed
- ccsf_options: list of alternatives. Each alternative is a list of CCSF course codes
  that must ALL be completed ("AND"). Separate alternatives are "OR".
  If the row says "No Course Articulated", use an empty list.
- source_page: the PDF page number

Rules: copy course codes exactly as printed. Do not guess or add courses that are not
in the document. If a row is ambiguous, still include it and add "ambiguous": true.

Return a single object: {"source": {"name": "...", "year": "..."}, "requirements": [...]}"""

PROMPT_2 = """The attached PDF is the SFSU Bulletin page for the Computer Science B.S.
List every upper-division (300-level and above) required or elective course with:
code, title, units, prereqs (list of course codes, empty if none),
and category ("core" or "elective").
Copy codes and titles exactly as printed. Do not invent courses or prerequisites.

Return a single JSON array of course objects."""


# Official SFSU course sequence for a CS transfer student, from the COMP ADT Roadmap:
# https://bulletin.sfsu.edu/colleges/science-engineering/computer-science/bs-computer-science/adt-roadmap/
# "Plan of Study Grid", Bulletin 2026-2027. Semester 1-4 after transfer.
# This is ordering taken from an official page, not inferred prerequisites: the
# Bulletin requirements page carries no prerequisite data at all.
ROADMAP_SOURCE = {
    "name": "SFSU Bulletin 2026-2027, Computer Science B.S. COMP ADT Roadmap",
    "url": "https://bulletin.sfsu.edu/colleges/science-engineering/computer-science/bs-computer-science/adt-roadmap/",
}
ROADMAP_TERM = {
    "CSC 300GW": 1, "CSC 317": 1, "CSC 340": 1, "MATH 324": 1,
    "CSC 413": 2, "CSC 415": 2, "CSC 510": 2,
    "CSC 648": 4,
}


def apply_roadmap(courses):
    """Tag each course with the semester the official ADT roadmap places it in."""
    for c in courses:
        c["roadmap_term"] = ROADMAP_TERM.get(c["code"])
    tagged = sum(1 for c in courses if c["roadmap_term"])
    print(f"  tagged {tagged} courses with roadmap_term from the ADT roadmap")
    return courses


def run(client, pdf: pathlib.Path, prompt: str):
    if not pdf.exists():
        sys.exit(f"Missing {pdf}. Download it before running Phase 2.")
    resp = client.models.generate_content(
        model=MODEL,
        contents=[types.Part.from_bytes(data=pdf.read_bytes(), mime_type="application/pdf"), prompt],
        config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0),
    )
    return json.loads(resp.text)


def generate():
    client = genai.Client(vertexai=True, project=PROJECT, location=LOCATION)
    assist = run(client, ASSIST_PDF, PROMPT_1)
    ASSIST_JSON.write_text(json.dumps(assist, indent=2))
    print(f"{ASSIST_JSON.name}: {len(assist.get('requirements', []))} requirements")

    sfsu = run(client, BULLETIN_PDF, PROMPT_2)
    if isinstance(sfsu, dict):                      # model sometimes wraps the array
        sfsu = next(v for v in sfsu.values() if isinstance(v, list))
    sfsu = apply_roadmap(sfsu)
    SFSU_JSON.write_text(json.dumps(sfsu, indent=2))
    print(f"{SFSU_JSON.name}: {len(sfsu)} courses")
    print("\nNow check every row against the PDFs, fix by hand, then rerun with --upload.")


def upload():
    from google.cloud import firestore
    db = firestore.Client(project=PROJECT)
    assist = json.loads(ASSIST_JSON.read_text())
    sfsu = json.loads(SFSU_JSON.read_text())
    # Firestore rejects an array whose elements are arrays, so each ccsf_options
    # alternative is wrapped as {"courses": [...]}. api/main.py unwraps it on read.
    for r in assist["requirements"]:
        r["ccsf_options"] = [{"courses": o} for o in r["ccsf_options"]]
    db.collection("tables").document("assist_ccsf_sfsu_cs").set(assist)
    # Firestore documents can't be bare lists
    db.collection("tables").document("sfsu_cs_courses").set(
        {"courses": sfsu, "roadmap_source": ROADMAP_SOURCE})
    print(f"Uploaded: {len(assist['requirements'])} requirements, {len(sfsu)} SFSU courses.")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--upload", action="store_true", help="upload the checked JSON files to Firestore")
    a = p.parse_args()
    upload() if a.upload else generate()

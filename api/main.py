import os, json, uuid
from functools import lru_cache
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from google.genai import types
from google.cloud import firestore
from prompts import PROMPT_3, PROMPT_4

PROJECT = os.environ.get("PROJECT_ID", "gator-transfer-nav")
LOCATION = os.environ.get("LOCATION", "us-central1")
FAST_MODEL = os.environ.get("FAST_MODEL", "gemini-2.5-flash")
PLAN_MODEL = os.environ.get("PLAN_MODEL", "gemini-2.5-flash")

client = genai.Client(vertexai=True, project=PROJECT, location=LOCATION)
db = firestore.Client(project=PROJECT)
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class Course(BaseModel):
    code: str
    title: str
    units: float
    grade: str
    term: str

class Transcript(BaseModel):
    courses: list[Course]

class PlanCourse(BaseModel):
    code: str
    title: str
    units: float
    why: str

class Term(BaseModel):
    term: str
    courses: list[PlanCourse]

class Unscheduled(BaseModel):
    code: str
    reason: str

class Plan(BaseModel):
    terms: list[Term]
    unscheduled: list[Unscheduled]

@lru_cache
def tables():
    # Firestore docs can't be bare lists, so sfsu_courses is stored as {"courses": [...]}
    assist = db.collection("tables").document("assist_ccsf_sfsu_cs").get().to_dict()
    sfsu = db.collection("tables").document("sfsu_cs_courses").get().to_dict()["courses"]
    # Firestore can't nest an array inside an array, so each ccsf_options alternative
    # is stored as {"courses": [...]}. Unwrap back to the documented list-of-lists.
    for r in assist["requirements"]:
        r["ccsf_options"] = [o["courses"] if isinstance(o, dict) else o for o in r["ccsf_options"]]
    return assist, sfsu

def ask(model, contents, schema):
    resp = client.models.generate_content(
        model=model,
        contents=contents,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=schema,
            temperature=0,
        ),
    )
    return resp.parsed

@app.get("/health")
def health():
    return {"ok": True}

# --- Matching: plain Python, no AI. The AI never decides whether a course counts. ---

# ASSIST 2026-2027, p.1: "CR/NC grades are not accepted in courses for the Computer
# Science major." and "Grades of C or better are required for Mathematics and Physics,
# Core Computer Science Requirements, and Advanced Computer Science Requirements."
PASSING = {"A+", "A", "A-", "B+", "B", "B-", "C+", "C"}

def norm(code):
    return " ".join(code.upper().replace("-", " ").split())

def check_requirements(courses):
    assist, _ = tables()
    passed = {norm(c.code) for c in courses if c.grade.upper() in PASSING}
    flagged = {norm(c.code) for c in courses if c.grade.upper() not in PASSING | {"W"}}
    results, used = [], set()
    for req in assist["requirements"]:
        status, matched, note = "missing", [], ""
        if not req["ccsf_options"]:
            status, note = "no_articulation", "No CCSF course counts for this. Take it at SFSU."
        for option in req["ccsf_options"]:
            codes = [norm(c) for c in option]
            if all(c in passed for c in codes):
                status, matched, note = "done", option, ""
                used.update(codes)
                break
            if any(c in flagged for c in codes):
                status, matched = "review", option
                note = "Grade below C or still in progress. Ask a counselor."
        results.append({
            "id": req["id"], "sfsu_course": req["sfsu_course"], "sfsu_title": req["sfsu_title"],
            "status": status, "matched_with": matched, "note": note,
            "source": f"ASSIST {assist['source']['year']}, p. {req['source_page']}",
        })
    at_risk = [
        {"code": c.code, "title": c.title, "units": c.units,
         "why": "Doesn't match any CS B.S. requirement in ASSIST. May still count as GE or elective units."}
        for c in courses if c.grade.upper() in PASSING and norm(c.code) not in used
    ]
    return results, at_risk

def validate_plan(plan, results):
    assist, sfsu = tables()
    known = {c["code"]: c for c in sfsu} | {r["sfsu_course"]: r for r in assist["requirements"]}
    seen = {r["sfsu_course"] for r in results if r["status"] == "done"}
    terms, warnings = [], []
    last_rt = 0  # highest ADT-roadmap semester scheduled so far
    for t in plan.terms:
        kept = [c for c in t.courses if c.code in known]
        dropped = [c.code for c in t.courses if c.code not in known]
        if dropped:
            warnings.append(f"Removed courses not in the SFSU catalog: {', '.join(dropped)}")
        for c in kept:
            late = [p for p in known[c.code].get("prereqs", []) if p not in seen]
            if late:
                warnings.append(f"{c.code} is scheduled before its prerequisite {', '.join(late)}")
            # The SFSU ADT roadmap fixes the order of the core and advanced courses.
            rt = known[c.code].get("roadmap_term")
            if rt and rt < last_rt:
                warnings.append(
                    f"{c.code} is out of sequence: the SFSU ADT roadmap places it in "
                    f"semester {rt}, after courses already scheduled earlier in this plan"
                )
        rts = [known[c.code].get("roadmap_term") for c in kept]
        rts = [r for r in rts if r]
        if rts:
            last_rt = max(last_rt, max(rts))
        seen.update(c.code for c in kept)
        units = sum(c.units for c in kept)
        if units > 15:
            warnings.append(f"{t.term} has {units:g} units")
        terms.append({"term": t.term, "units": units, "courses": [c.model_dump() for c in kept]})
    return terms, warnings

# --- Endpoints ---

@app.post("/analyze")
async def analyze(file: UploadFile = File(...), start_term: str = "Fall 2027"):
    data = await file.read()
    if len(data) > 10_000_000:
        raise HTTPException(413, "File too large (10 MB max).")
    mime = file.content_type or "application/pdf"
    transcript = ask(FAST_MODEL, [types.Part.from_bytes(data=data, mime_type=mime), PROMPT_3], Transcript)
    del data  # the transcript is never written anywhere
    if not transcript or not transcript.courses:
        raise HTTPException(422, "We couldn't read any courses. Try a clearer PDF or photo.")

    results, at_risk = check_requirements(transcript.courses)
    _, sfsu = tables()
    needed = [r for r in results if r["status"] != "done"]
    prompt = PROMPT_4.format(
        missing_and_sfsu_only_json=json.dumps(needed),
        sfsu_courses_json=json.dumps(sfsu),
        start_term=start_term,
    )
    plan = ask(PLAN_MODEL, [prompt], Plan)
    terms, warnings = validate_plan(plan, results)

    count = lambda s: sum(r["status"] == s for r in results)
    return {
        "summary": {"courses_found": len(transcript.courses), "done": count("done"),
                    "missing": count("missing"), "review": count("review"),
                    "take_at_sfsu": count("no_articulation"),
                    "units_at_risk": sum(c["units"] for c in at_risk)},
        "requirements": results,
        "units_at_risk": at_risk,
        "plan": terms,
        "unscheduled": [u.model_dump() for u in plan.unscheduled],
        "warnings": ["Not official advising. Confirm with an SFSU or CCSF counselor."] + warnings,
    }

@app.post("/share")
async def share(result: dict):
    sid = uuid.uuid4().hex[:10]
    db.collection("shared_plans").document(sid).set({"result": result, "created": firestore.SERVER_TIMESTAMP})
    return {"id": sid}

@app.get("/plan/{sid}")
def get_plan(sid: str):
    doc = db.collection("shared_plans").document(sid).get()
    if not doc.exists:
        raise HTTPException(404, "Plan not found")
    return doc.to_dict()["result"]

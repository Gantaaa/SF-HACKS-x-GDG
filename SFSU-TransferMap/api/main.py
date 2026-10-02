import json
import os
import uuid
from functools import lru_cache

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.cloud import firestore
from google.genai import types
from pydantic import BaseModel

PROJECT = os.getenv("PROJECT_ID", "gator-transfer-nav")
LOCATION = os.getenv("LOCATION", "us-central1")
MODEL = os.getenv("MODEL", "gemini-2.5-flash")

client = genai.Client(vertexai=True, project=PROJECT, location=LOCATION)
db = firestore.Client(project=PROJECT)
app = FastAPI(title="SFSU TransferMap API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


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


class Plan(BaseModel):
    terms: list[Term]
    unscheduled: list[dict[str, str]]


TRANSCRIPT_PROMPT = """Extract every course from this CCSF transcript. Return JSON only.
Return {\"courses\":[{\"code\":\"CS 111B\",\"title\":\"...\",\"units\":3,\"grade\":\"A\",\"term\":\"Fall 2024\"}]}.
Use IP for in-progress and W for withdrawn. Do not guess unreadable values; use an empty string."""


PLAN_PROMPT = """You are planning a CCSF student's transfer into the SFSU Computer Science B.S.
Requirements still needed:
{requirements}

SFSU course catalog:
{catalog}

Start term: {start_term}
Create a term-by-term plan. Use only catalog codes, respect prerequisites and roadmap_term,
and schedule 12-15 units per Fall/Spring term. Return JSON matching the requested schema."""


@lru_cache
def tables():
    assist = db.collection("tables").document("assist_ccsf_sfsu_cs").get().to_dict()
    sfsu = db.collection("tables").document("sfsu_cs_courses").get().to_dict()["courses"]
    if not assist or not sfsu:
        raise HTTPException(503, "SFSU course tables are not available")
    for requirement in assist["requirements"]:
        requirement["ccsf_options"] = [
            option["courses"] if isinstance(option, dict) else option
            for option in requirement["ccsf_options"]
        ]
    return assist, sfsu


def ask(contents, schema):
    response = client.models.generate_content(
        model=MODEL,
        contents=contents,
        config=types.GenerateContentConfig(
            response_mime_type="application/json", response_schema=schema, temperature=0
        ),
    )
    return response.parsed


def normalize(code: str) -> str:
    return " ".join(code.upper().replace("-", " ").split())


PASSING = {"A+", "A", "A-", "B+", "B", "B-", "C+", "C"}


def match_courses(courses):
    assist, _ = tables()
    passed = {normalize(course.code) for course in courses if course.grade.upper() in PASSING}
    reviewable = {normalize(course.code) for course in courses if course.grade.upper() not in PASSING | {"W"}}
    results, used = [], set()
    for requirement in assist["requirements"]:
        status, matched, note = "missing", [], ""
        if not requirement["ccsf_options"]:
            status, note = "no_articulation", "No CCSF course counts for this. Take it at SFSU."
        for option in requirement["ccsf_options"]:
            codes = [normalize(code) for code in option]
            if all(code in passed for code in codes):
                status, matched, note = "done", option, ""
                used.update(codes)
                break
            if any(code in reviewable for code in codes):
                status, matched = "review", option
                note = "Grade below C or still in progress. Ask a counselor."
        results.append({
            "id": requirement["id"],
            "sfsu_course": requirement["sfsu_course"],
            "sfsu_title": requirement["sfsu_title"],
            "status": status,
            "matched_with": matched,
            "note": note,
            "source": f"ASSIST {assist['source']['year']}, p. {requirement['source_page']}",
        })
    at_risk = [
        {"code": course.code, "title": course.title, "units": course.units,
         "why": "Doesn't match an SFSU CS requirement in ASSIST. It may still count as GE or elective units."}
        for course in courses if course.grade.upper() in PASSING and normalize(course.code) not in used
    ]
    return results, at_risk


def validate_plan(plan, results):
    assist, catalog = tables()
    known = {course["code"]: course for course in catalog}
    known.update({requirement["sfsu_course"]: requirement for requirement in assist["requirements"]})
    seen = {result["sfsu_course"] for result in results if result["status"] == "done"}
    warnings, output, last_roadmap_term = [], [], 0
    for term in plan.terms:
        kept = [course for course in term.courses if course.code in known]
        dropped = [course.code for course in term.courses if course.code not in known]
        if dropped:
            warnings.append(f"Removed courses not in the SFSU catalog: {', '.join(dropped)}")
        for course in kept:
            prerequisites = known[course.code].get("prereqs", [])
            missing = [prereq for prereq in prerequisites if prereq not in seen]
            if missing:
                warnings.append(f"{course.code} is scheduled before prerequisite {', '.join(missing)}")
        roadmap_terms = [known[course.code].get("roadmap_term") for course in kept]
        roadmap_terms = [term_number for term_number in roadmap_terms if term_number]
        if roadmap_terms and min(roadmap_terms) < last_roadmap_term:
            warnings.append(f"{term.term} contains courses out of SFSU roadmap sequence")
        if roadmap_terms:
            last_roadmap_term = max(last_roadmap_term, max(roadmap_terms))
        seen.update(course.code for course in kept)
        units = sum(course.units for course in kept)
        if units > 15:
            warnings.append(f"{term.term} has {units:g} units")
        output.append({"term": term.term, "units": units, "courses": [course.model_dump() for course in kept]})
    return output, warnings


@app.get("/api/health")
def health():
    return {"ok": True, "path": "/api"}


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...), start_term: str = Form("Fall 2027")):
    data = await file.read()
    if len(data) > 10_000_000:
        raise HTTPException(413, "File too large (10 MB maximum)")
    transcript = ask([types.Part.from_bytes(data=data, mime_type=file.content_type or "application/pdf"), TRANSCRIPT_PROMPT], Transcript)
    if not transcript or not transcript.courses:
        raise HTTPException(422, "No courses could be read from this transcript")
    results, at_risk = match_courses(transcript.courses)
    _, catalog = tables()
    prompt = PLAN_PROMPT.format(
        requirements=json.dumps([result for result in results if result["status"] != "done"]),
        catalog=json.dumps(catalog), start_term=start_term,
    )
    plan = ask(prompt, Plan)
    terms, warnings = validate_plan(plan, results)
    count = lambda status: sum(result["status"] == status for result in results)
    return {
        "pathway": {"community_college": "City College of San Francisco", "university": "San Francisco State University", "major": "Computer Science B.S."},
        "transcript": [course.model_dump() for course in transcript.courses],
        "summary": {"courses_found": len(transcript.courses), "done": count("done"), "missing": count("missing"), "review": count("review"), "take_at_sfsu": count("no_articulation"), "units_at_risk": sum(course["units"] for course in at_risk)},
        "requirements": results, "units_at_risk": at_risk, "plan": terms,
        "unscheduled": [item for item in plan.unscheduled],
        "warnings": ["Not official advising. Confirm with an SFSU or CCSF counselor."] + warnings,
    }


@app.post("/api/share")
async def share(result: dict):
    share_id = uuid.uuid4().hex[:10]
    db.collection("shared_plans").document(share_id).set({"result": result, "created": firestore.SERVER_TIMESTAMP})
    return {"id": share_id, "path": f"/api/plans/{share_id}"}


@app.get("/api/plans/{share_id}")
def get_plan(share_id: str):
    document = db.collection("shared_plans").document(share_id).get()
    if not document.exists:
        raise HTTPException(404, "Plan not found")
    return document.to_dict()["result"]

"""
Sidekick — FastAPI Backend (v2)
=========================================
Flow:
  1. POST /api/jobs/search/{sid}  → Gemini expands titles + generates job listings
  2. POST /api/jobs/apply/{sid}   → Playwright opens selected jobs to apply
  3. Standard session / resume / log endpoints
"""

from __future__ import annotations

import asyncio
import io
import json
import re
import uuid
import datetime
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, HttpUrl, validator, Field
from sqlalchemy import create_engine, Column, String, Integer, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker

from pypdf import PdfReader
import requests
from bs4 import BeautifulSoup

try:
    import google.generativeai as genai
    _GENAI_OK = True
except ImportError:
    _GENAI_OK = False

# ─────────────────────────────────────────────
#  Database Setup
# ─────────────────────────────────────────────
DATABASE_URL = "sqlite:///./database.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class DBProfile(Base):
    __tablename__ = "profiles"
    session_id = Column(String, primary_key=True, index=True)
    full_name = Column(String, default="")
    email = Column(String, default="")
    phone = Column(String, default="")
    years_experience = Column(Integer, default=0)
    linkedin_url = Column(String, default="")
    portfolio_url = Column(String, default="")
    base_job_role = Column(String, default="")
    target_metro_region = Column(String, default="")
    target_sources = Column(String, default="[]") # JSON string
    resume_filename = Column(String, default="")
    resume_char_count = Column(Integer, default=0)
    gemini_key = Column(String, default="")
    apollo_key = Column(String, default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

Base.metadata.create_all(bind=engine)

# ─────────────────────────────────────────────
#  Config
# ─────────────────────────────────────────────
ENV_PATH   = Path(".env")
STATIC_DIR = Path("static")

app = FastAPI(title="Sidekick", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Memory caches for job fetching / logs
_applied_log = {}
_jobs_cache = {}

# ---------------------------------------------------------
# Pydantic Schemas with Validation
# ---------------------------------------------------------
class ProfileUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=2)
    email: str | None = None
    phone: str | None = None
    years_experience: int | None = Field(None, ge=0, le=50)
    linkedin_url: str | None = None
    portfolio_url: str | None = None
    base_job_role: str | None = None
    target_metro_region: str | None = None
    target_sources: list[str] | None = None
    
    @validator('phone')
    def validate_phone(cls, v):
        if v:
            # Only allow numbers, +, -, (), and spaces
            if not re.match(r'^[\d\+\-\(\)\s]+$', v):
                raise ValueError('Invalid characters in phone number')
        return v
        
    @validator('email')
    def validate_email(cls, v):
        if v and '@' not in v:
            raise ValueError('Invalid email address')
        return v
        
    @validator('linkedin_url', 'portfolio_url')
    def validate_urls(cls, v):
        if v and not v.startswith('http'):
            raise ValueError('URL must start with http:// or https://')
        return v

# ─────────────────────────────────────────────
#  Routes — static
# ─────────────────────────────────────────────
@app.get("/", response_class=FileResponse)
async def root():
    return FileResponse("index.html")

# ─────────────────────────────────────────────
#  Session
# ─────────────────────────────────────────────
@app.post("/api/session/new")
def create_session():
    sid = str(uuid.uuid4())
    db = SessionLocal()
    try:
        prof = DBProfile(session_id=sid, gemini_key="", apollo_key="")
        db.add(prof)
        db.commit()
    finally:
        db.close()
    return {"session_id": sid}

@app.get("/api/session/{sid}")
def get_session(sid: str):
    db = SessionLocal()
    try:
        prof = db.query(DBProfile).filter(DBProfile.session_id == sid).first()
        if not prof:
            raise HTTPException(status_code=404, detail="Session not found")
        return {
            "gemini_key_set": bool(prof.gemini_key),
            "apollo_key_set": bool(prof.apollo_key),
            "resume_filename": prof.resume_filename,
            "resume_char_count": prof.resume_char_count,
            "full_name": prof.full_name,
            "email": prof.email,
            "phone": prof.phone,
            "years_experience": prof.years_experience,
            "linkedin_url": prof.linkedin_url,
            "portfolio_url": prof.portfolio_url,
            "base_job_role": prof.base_job_role,
            "target_metro_region": prof.target_metro_region,
            "target_sources": json.loads(prof.target_sources) if prof.target_sources else []
        }
    finally:
        db.close()

@app.post("/api/session/{sid}")
async def update_session(sid: str, req: Request):
    """Update profile using strict Pydantic validation."""
    data = await req.json()
    try:
        validated = ProfileUpdate(**data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))
        
    db = SessionLocal()
    try:
        prof = db.query(DBProfile).filter(DBProfile.session_id == sid).first()
        if not prof:
            prof = DBProfile(session_id=sid)
            db.add(prof)
            
        update_data = validated.dict(exclude_unset=True)
        if 'target_sources' in update_data:
            prof.target_sources = json.dumps(update_data.pop('target_sources'))
            
        for k, v in update_data.items():
            setattr(prof, k, v)
        db.commit()
        return {"ok": True}
    finally:
        db.close()

# ─────────────────────────────────────────────
#  API Keys
# ─────────────────────────────────────────────
@app.post("/api/keys/{sid}")
def update_keys(sid: str, gemini_key: str = Form(None), apollo_key: str = Form(None)):
    db = SessionLocal()
    try:
        prof = db.query(DBProfile).filter(DBProfile.session_id == sid).first()
        if not prof:
            raise HTTPException(status_code=404, detail="Session not found")
            
        if gemini_key is not None:
            prof.gemini_key = gemini_key
        if apollo_key is not None:
            prof.apollo_key = apollo_key
        db.commit()
        return {"ok": True, "gemini_key_set": bool(prof.gemini_key), "apollo_key_set": bool(prof.apollo_key)}
    finally:
        db.close()

# ─────────────────────────────────────────────
#  Resume
# ─────────────────────────────────────────────
def extract_text_from_pdf(file_stream) -> str:
    reader = PdfReader(file_stream)
    return "\n".join(page.extract_text() or "" for page in reader.pages).strip()

@app.post("/api/resume/{sid}")
async def upload_resume(sid: str, file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files accepted.")
    content = await file.read()
    try:
        text = extract_text_from_pdf(io.BytesIO(content))
    except Exception as exc:
        raise HTTPException(422, f"PDF parse error: {exc}")
        
    db = SessionLocal()
    try:
        prof = db.query(DBProfile).filter(DBProfile.session_id == sid).first()
        if not prof:
            raise HTTPException(status_code=404, detail="Session not found")
        prof.resume_filename = file.filename
        prof.resume_char_count = len(text)
        db.commit()
        return {"ok": True, "filename": file.filename, "char_count": len(text), "preview": text[:800]}
    finally:
        db.close()

# ─────────────────────────────────────────────
#  Job Search  (Gemini-powered)
# ─────────────────────────────────────────────
import time as _time

# All supported job platforms (for prompts and validation)
JOB_SOURCES = [
    "Naukri.com",
    "LinkedIn",
    "Indeed",
    "Hirist",
    "Glassdoor",
    "Cutshort",
    "Wellfound",
    "Apna",
    "WorkIndia",
    "Career site",
]

# Models to try in order (prefer lite/cheaper for better free-tier quota)
_MODELS = [
    "gemini-2.0-flash-lite",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
]

def _ask_gemini(client: Any, prompt: str) -> str:
    """Call Gemini with automatic model fallback on 429."""
    from google.genai import errors as genai_errors
    last_err = None
    for model in _MODELS:
        try:
            resp = client.models.generate_content(model=model, contents=prompt)
            return resp.text.strip()
        except Exception as exc:
            txt = str(exc)
            if "429" in txt or "RESOURCE_EXHAUSTED" in txt or "quota" in txt.lower():
                last_err = exc
                _time.sleep(3)   # brief pause before next model
                continue
            raise   # non-quota error — propagate
    raise RuntimeError(f"All Gemini models quota-exhausted: {last_err}")


def _scrape_linkedin_jobs(role: str, location: str, limit: int = 40) -> list[dict]:
    """Scrape real jobs from LinkedIn public API."""
    url = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "X-Requested-With": "XMLHttpRequest"
    }
    jobs = []
    start = 0
    # Add a small delay between requests to avoid blocking
    import time
    
    while len(jobs) < limit:
        params = {"keywords": role, "location": location, "start": start}
        try:
            res = requests.get(url, params=params, headers=headers, timeout=10)
            if res.status_code != 200:
                break
                
            soup = BeautifulSoup(res.text, 'html.parser')
            cards = soup.find_all('li')
            if not cards:
                break
                
            for card in cards:
                title_elem = card.find('h3', class_='base-search-card__title')
                if not title_elem:
                    continue
                    
                company_elem = card.find('h4', class_='base-search-card__subtitle')
                location_elem = card.find('span', class_='job-search-card__location')
                link_elem = card.find('a', class_='base-card__full-link')
                time_elem = card.find('time')
                
                link = link_elem['href'].split('?')[0] if link_elem and 'href' in link_elem.attrs else ""
                
                # We need a unique ID based on the link or use index
                job_id = f"job_li_{len(jobs)}_{hash(link) % 10000}" if link else f"job_li_{len(jobs)}"
                
                jobs.append({
                    "id": job_id,
                    "job_title": title_elem.text.strip(),
                    "company": company_elem.text.strip() if company_elem else "Unknown",
                    "location": location_elem.text.strip() if location_elem else location,
                    "source": "LinkedIn",
                    "link": link,
                    "description": "View on LinkedIn for full details and application requirements.",
                    "salary": "Not disclosed",
                    "posted": time_elem.text.strip() if time_elem else "Recently",
                    "status": "Not Applied"
                })
                
                if len(jobs) >= limit:
                    break
            
            start += 25
            time.sleep(0.5)
        except Exception as e:
            print(f"Scraper error: {e}")
            break
            
    return jobs

def _scrape_jobs_via_yahoo(role: str, location: str, site: str, limit: int = 15) -> list[dict]:
    """Scrape real jobs from various platforms by searching Yahoo (bypasses bot protections)."""
    import urllib.parse
    
    query = f'site:{site} "{role}" "{location}" intitle:"job"'
    url = f"https://search.yahoo.com/search?p={urllib.parse.quote(query)}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }
    
    jobs = []
    try:
        res = requests.get(url, headers=headers, timeout=10)
        if res.status_code != 200:
            return jobs
            
        soup = BeautifulSoup(res.text, 'html.parser')
        
        results = soup.find_all('div', class_='compTitle')
        for div in results:
            a = div.find('a')
            if a and 'href' in a.attrs:
                link = a['href']
                title = a.text.strip()
                
                # Clean up tracking redirect
                if 'RU=' in link:
                    try:
                        link = urllib.parse.unquote(link.split('RU=')[1].split('/')[0])
                    except:
                        pass
                        
                if site in link:
                    # Enforce valid individual job links, skip category/search pages
                    if "indeed.com" in site:
                        if "/q-" in link or "/jobs" in link or "job-vacancies" in link:
                            continue
                    if "naukri.com" in site:
                        if "-jobs" in link and "job-listings" not in link:
                            continue
                            
                    snippet_div = div.find_next_sibling('div', class_='compText')
                    snippet = snippet_div.text.strip() if snippet_div else "View listing for full details."

                    
                    # Clean title
                    clean_title = title
                    # Remove " - Naukri.com" or " | Indeed.com"
                    clean_title = re.sub(r'(?i)\s*[-|]\s*[a-z0-9]+\.(com|in|co).*$', '', clean_title)
                    # Remove website names explicitly
                    clean_title = re.sub(r'(?i)\s*[-|]\s*(naukri|indeed|glassdoor|wellfound|apna|cutshort).*$', '', clean_title)
                    
                    # Fix Yahoo's weird concatenation like "Naukri.comwww.naukri.com › python-developer"
                    if '›' in clean_title:
                        parts = clean_title.split('›')
                        clean_title = parts[-1].strip()
                        # Often the slug is like "python-developer-django-flask..."
                        clean_title = clean_title.replace('-', ' ').title()
                        clean_title = re.sub(r'(?i)\bJob Listings\b\s*', '', clean_title).strip()
                        clean_title = re.sub(r'(?i)[a-z]+(\.com|\.in).*$', '', clean_title).strip()
                        
                    clean_title = clean_title.replace("...", "").strip()
                    if not clean_title or "Jobs In" in clean_title.title() or clean_title.lower().startswith("job search"):
                        continue
                        
                    # Filter out expired or very old jobs
                    snippet_lower = snippet.lower()
                    if "month " in snippet_lower or "months " in snippet_lower or "year " in snippet_lower or "expired" in snippet_lower or "closed" in snippet_lower:
                        continue
                        
                    # Extract company heuristic
                    company = "Unknown"
                    if " at " in clean_title.lower():
                        try:
                            # e.g., "Python Developer at TechCorp"
                            parts = re.split(r'(?i)\s+at\s+', clean_title)
                            clean_title = parts[0].strip()
                            company = parts[1].split(' ')[0].strip("-,|")
                        except:
                            pass
                        
                    job_id = f"job_y_{len(jobs)}_{hash(link) % 10000}"
                    
                    jobs.append({
                        "id": job_id,
                        "job_title": clean_title,
                        "company": company,
                        "location": location,
                        "source": site.split('.')[0].title(),
                        "link": link,
                        "description": snippet,
                        "salary": "Not disclosed",
                        "posted": "Recently",
                        "status": "Not Applied"
                    })
                    
                    if len(jobs) >= limit:
                        break
    except Exception as e:
        print(f"Yahoo Scraper error ({site}): {e}")
        
    return jobs

def _gemini_search_jobs(api_key: str, role: str, location: str, sources: list[str]) -> dict:
    """Use Gemini to expand titles, then SCAPE REAL JOBS based on requested sources."""
    client = None
    titles = [role]
    
    if _GENAI_OK and api_key:
        try:
            client = genai.Client(api_key=api_key)
            raw = _ask_gemini(client, 
                f'Generate 5 job title variants for "{role}". '
                'Return ONLY a JSON array of strings, no markdown.'
            )
            raw = re.sub(r'^```(?:json)?\s*', '', raw)
            raw = re.sub(r'\s*```$', '', raw).strip()
            parsed_titles = json.loads(raw)
            if isinstance(parsed_titles, list) and parsed_titles:
                titles = [str(t) for t in parsed_titles[:4]]
        except Exception as e:
            print(f"Title expansion failed, using base role: {e}")

    # Map sources to domains for search engines
    domain_map = {
        "Naukri.com": "naukri.com",
        "Indeed": "indeed.com",
        "Hirist": "hirist.tech",
        "Glassdoor": "glassdoor.co.in",
        "Cutshort": "cutshort.io",
        "Wellfound": "wellfound.com",
        "Apna": "apna.co",
        "WorkIndia": "workindia.in",
    }
    
    selected_domains = []
    use_linkedin = False
    
    if not sources:
        use_linkedin = True
        selected_domains = ["naukri.com", "indeed.com"]
    else:
        if "LinkedIn" in sources:
            use_linkedin = True
        for src in sources:
            if src in domain_map:
                selected_domains.append(domain_map[src])

    all_jobs = []
    seen_links = set()
    
    # Calculate targets
    total_sources = len(selected_domains) + (1 if use_linkedin else 0)
    target_per_source = max(10, 40 // max(1, total_sources))
    target_per_title = max(2, target_per_source // len(titles[:3]))

    # Scrape LinkedIn if selected
    if use_linkedin:
        for t in titles[:3]:
            fetched = _scrape_linkedin_jobs(t, location, limit=target_per_title)
            for j in fetched:
                if j['link'] and j['link'] not in seen_links:
                    seen_links.add(j['link'])
                    all_jobs.append(j)

    # Scrape other domains via Yahoo HTML
    import time
    for domain in selected_domains:
        for t in titles[:2]:
            fetched = _scrape_jobs_via_yahoo(t, location, domain, limit=target_per_title)
            for j in fetched:
                if j['link'] and j['link'] not in seen_links:
                    seen_links.add(j['link'])
                    all_jobs.append(j)
            time.sleep(1)

    # If we didn't get enough, try getting more for the main role
    if len(all_jobs) < 15 and use_linkedin:
        more_jobs = _scrape_linkedin_jobs(role, location, limit=30)
        for j in more_jobs:
            if j['link'] and j['link'] not in seen_links:
                seen_links.add(j['link'])
                all_jobs.append(j)
                
    import random
    random.shuffle(all_jobs)

    return {"titles": titles, "jobs": all_jobs[:40]}


@app.post("/api/jobs/search/{sid}")
async def search_jobs(sid: str):
    """Search jobs: Gemini expands titles and generates realistic listings."""
    db = SessionLocal()
    try:
        prof = db.query(DBProfile).filter(DBProfile.session_id == sid).first()
        if not prof:
            raise HTTPException(status_code=404, detail="Session not found")
            
        role = prof.base_job_role
        region = prof.target_metro_region
        sources_str = prof.target_sources
        sources = json.loads(sources_str) if sources_str else []
        gemini_key = prof.gemini_key
    finally:
        db.close()
        
    if not gemini_key:
        raise HTTPException(400, "Gemini API key not set")
    if not role:
        raise HTTPException(400, "Base job role is required")
    if not region:
        raise HTTPException(400, "Target metro region is required")

    result = _gemini_search_jobs(gemini_key, role, region, sources)
    _jobs_cache[sid] = result["jobs"]
    
    return {
        "ok":     True,
        "titles": result["titles"],
        "jobs":   result["jobs"],
        "count":  len(result["jobs"]),
    }


@app.get("/api/jobs/{sid}")
async def get_fetched_jobs(sid: str):
    """Return the last fetched job list for this session."""
    return _jobs_cache.get(sid, [])


# ─────────────────────────────────────────────
#  Apply to selected jobs
# ─────────────────────────────────────────────
@app.post("/api/jobs/apply/{sid}")
async def apply_jobs(sid: str, req: Request):
    db = SessionLocal()
    try:
        prof = db.query(DBProfile).filter(DBProfile.session_id == sid).first()
        if not prof:
            raise HTTPException(status_code=404, detail="Session not found")
            
        data = await req.json()
        job_ids = set(data.get("job_ids", []))
        if not job_ids:
            return {"applied_count": 0, "applied": []}
            
        if sid not in _jobs_cache:
            raise HTTPException(400, "No cached jobs. Search first.")
            
        if sid not in _applied_log:
            _applied_log[sid] = []
            
        applied_now = []
        for j in _jobs_cache.get(sid, []):
            if j["id"] in job_ids and j.get("status") != "Applied":
                j["status"] = "Applied"
                log_entry = {**j, "applied_via": "Manual Link"}
                _applied_log[sid].append(log_entry)
                applied_now.append(log_entry)
                
        return {"applied_count": len(applied_now), "applied": applied_now}
    finally:
        db.close()


# ─────────────────────────────────────────────
#  Application Log Data
# ─────────────────────────────────────────────
@app.get("/api/log/{sid}")
def get_log(sid: str):
    db = SessionLocal()
    try:
        prof = db.query(DBProfile).filter(DBProfile.session_id == sid).first()
        if not prof:
            raise HTTPException(status_code=404, detail="Session not found")
        return _applied_log.get(sid, [])
    finally:
        db.close()

@app.delete("/api/log/{sid}")
def clear_log(sid: str):
    db = SessionLocal()
    try:
        prof = db.query(DBProfile).filter(DBProfile.session_id == sid).first()
        if not prof:
            raise HTTPException(status_code=404, detail="Session not found")
        _applied_log[sid] = []
        return {"ok": True}
    finally:
        db.close()


# ─────────────────────────────────────────────
#  Entry-point
# ─────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)

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
import csv
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

import os
try:
    import google.generativeai as genai
    _GENAI_OK = True
    _api_key = os.environ.get("GEMINI_API_KEY")
    if _api_key:
        genai.configure(api_key=_api_key)
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
    profile_json = Column(String, default="{}")
    resume_filename = Column(String, default="")
    resume_char_count = Column(Integer, default=0)
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

class JobScoreRequest(BaseModel):
    job_description: str
    profile_data: Dict[str, Any]
    
class GenerateTextRequest(BaseModel):
    prompt_context: str
    job_description: str
    profile_data: Dict[str, Any]

class SyncTrackerRequest(BaseModel):
    company: str
    title: str
    url: str
    date: str

class InterviewPrepRequest(BaseModel):
    job_description: str

# Pydantic schema validation removed in favor of dynamic JSON storage

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
        prof = DBProfile(session_id=sid, apollo_key="")
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
        try:
            profile_data = json.loads(prof.profile_json) if prof.profile_json else {}
        except:
            profile_data = {}

        return {
            "apollo_key_set": bool(prof.apollo_key),
            "resume_filename": prof.resume_filename,
            "resume_char_count": prof.resume_char_count,
            **profile_data
        }
    finally:
        db.close()

@app.post("/api/session/{sid}")
async def update_session(sid: str, req: Request):
    """Update profile using dynamic JSON storage."""
    data = await req.json()
        
    db = SessionLocal()
    try:
        prof = db.query(DBProfile).filter(DBProfile.session_id == sid).first()
        if not prof:
            prof = DBProfile(session_id=sid)
            db.add(prof)
            
        try:
            existing_data = json.loads(prof.profile_json) if prof.profile_json else {}
        except:
            existing_data = {}
            
        existing_data.update(data)
        prof.profile_json = json.dumps(existing_data)
        
        db.commit()
        return {"ok": True}
    finally:
        db.close()

# ─────────────────────────────────────────────
#  API Keys
# ─────────────────────────────────────────────
@app.post("/api/keys/{sid}")
def update_keys(sid: str, apollo_key: str = Form(None)):
    db = SessionLocal()
    try:
        prof = db.query(DBProfile).filter(DBProfile.session_id == sid).first()
        if not prof:
            raise HTTPException(status_code=404, detail="Session not found")
            
        if apollo_key is not None:
            prof.apollo_key = apollo_key
        db.commit()
        return {"ok": True, "apollo_key_set": bool(prof.apollo_key)}
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

@app.post("/api/suggest-roles")
async def suggest_roles(target_role: str = Form(None), file: UploadFile = File(...)):
    """Stateless endpoint: Extract text from resume and ask Gemini for role suggestions."""
        
    content = await file.read()
    try:
        if file.filename.lower().endswith('.pdf'):
            text = extract_text_from_pdf(io.BytesIO(content))
        else:
            text = content.decode('utf-8', errors='ignore')
    except Exception as exc:
        raise HTTPException(422, f"Document parse error: {exc}")
        
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from document.")
        

    context_instruction = ""
    if target_role:
        context_instruction = f"The user frequently searches for '{target_role}'. Consider aligning some suggestions closer to this domain if their experience warrants it."

    prompt = f"""
    You are an expert technical recruiter and career coach for the Indian Tech Job Market. Review the following resume text and suggest 5 to 10 highly specific, actionable job titles the candidate is qualified for. 
    
    Important Guidelines:
    {context_instruction}
    - Tailor the suggestions to prevalent job titles in India (e.g. prioritize 'Data Scientist', 'AI Developer', 'Software Development Engineer' over niche terms like 'LLM Engineer' unless their resume is exclusively focused on it).
    - Deduplicate similar titles (e.g., provide either 'AI Engineer' or 'AI Developer', not both).
    - Ensure practicality. Suggest roles they can realistically search and find on typical job boards like Naukri or Indeed.
    - Focus strictly on the roles. DO NOT return any markdown formatting outside of a literal JSON list of strings.
    
    Example Output:
    ["Senior Frontend Engineer", "React Developer", "UI/UX Developer"]
    
    Resume text:
    {text[:5000]}
    """
    
    models = ["gemini-2.0-flash-lite", "gemini-2.5-flash-lite", "gemini-2.0-flash"]
    for m in models:
        try:
            model = genai.GenerativeModel(m)
            response = model.generate_content(prompt)
            raw_json = response.text.replace("```json", "").replace("```", "").strip()
            import json
            roles = json.loads(raw_json)
            return {"roles": roles}
        except Exception as e:
            if "429" in str(e):
                continue
            print(f"Model {m} failed for suggestions: {e}")
            
    raise HTTPException(status_code=500, detail="Failed to parse suggestions from Gemini.")

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

def _scrape_jobs_via_yahoo(role: str, location: str, site: str, limit: int = 50) -> list[dict]:
    """Scrape real jobs from various platforms by searching Yahoo with deep pagination."""
    import urllib.parse
    
    query = f'site:{site} "{role}" "{location}" intitle:"job"'
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }
    
    jobs = []
    seen = set()
    b_offset = 1 # Yahoo pagination offset starts at 1, then 11, 21, etc.
    
    while len(jobs) < limit and b_offset <= 41: # Scrape up to 5 pages per domain
        url = f"https://search.yahoo.com/search?p={urllib.parse.quote(query)}&b={b_offset}"
        try:
            res = requests.get(url, headers=headers, timeout=10)
            if res.status_code != 200:
                break
                
            soup = BeautifulSoup(res.text, 'html.parser')
            
            results = soup.find_all('div', class_='compTitle')
            if not results:
                break # No more pages
                
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
                            
                    if site.replace('www.', '').split('.')[0] in link:
                        # Enforce valid individual job links, skip category/search pages
                        if "indeed.com" in site:
                            # Indeed can be in.indeed.com, www.indeed.com etc.
                            if "/q-" in link or "/jobs" in link or "job-vacancies" in link:
                                continue
                        if "naukri.com" in site:
                            if "-jobs" in link and "job-listings" not in link:
                                continue
                                
                        snippet_div = div.find_next_sibling('div', class_='compText')
                        snippet = snippet_div.text.strip() if snippet_div else "View listing for full details."

                        # Deep Clean Title and Extract Company
                        clean_title = title
                        company = "Unknown"
                        
                        # Fix Yahoo's weird concatenation "Naukri.comwww.naukri.com › python-developer"
                        if '›' in clean_title:
                            parts = clean_title.split('›')
                            clean_title = parts[-1].strip()
                            clean_title = clean_title.replace('-', ' ').title()
                            
                        # Strip "Job Listings" and "Job At" immediately after any potential `.title()` conversions
                        clean_title = re.sub(r'(?i)\bJob Listings\b\s*', '', clean_title).strip()
                        clean_title = re.sub(r'(?i)Job At\s+', '', clean_title).strip()
                            
                        # Fix Yahoo's Location Concatenation: e.g. "Mumbaisoftware Engineer" or "Bangaloresenior Developer"
                        loc_match = location.replace(" ", "").lower()
                        if clean_title.lower().startswith(loc_match):
                            clean_title = clean_title[len(loc_match):].strip(" -|")
                        # Aggressive Brute-Force Deduplication (Fixes Naukri URL slug prefixes)
                        # e.g., "Ai Ml Backendai/Ml Backend Developer" -> "Ai/Ml Backend Developer"
                        # e.g., "Azure Gen Aiazure Gen Ai Developer" -> "Azure Gen Ai Developer"
                        
                        # First try a simple regex for exact alphameric duplication
                        match_nospace = re.match(r'^([a-zA-Z\s]{4,})([a-zA-Z\s]{4,}.*)$', clean_title, flags=re.IGNORECASE)
                        if match_nospace:
                            part1 = match_nospace.group(1).replace(" ", "").lower()
                            part2 = match_nospace.group(2).replace(" ", "").lower()
                            if part2.startswith(part1):
                                clean_title = match_nospace.group(2).strip().title()
                                
                        # Hardcoded Known Buggy Prefixes
                        known_prefixes = [
                            ("Ai Ml Backendai/Ml", "Ai/Ml"), 
                            ("Azure Gen Aiazure Gen", "Azure Gen"),
                            ("Artificialartificial", "Artificial"),
                            ("Gen Ai Developergen Ai", "Gen Ai")
                        ]
                        
                        for bad, good in known_prefixes:
                             if clean_title.lower().startswith(bad.lower()):
                                 clean_title = good + clean_title[len(bad):]
                                 if clean_title.lower().startswith(good.lower() + " " + good.lower()):
                                     clean_title = good + clean_title[len(good)*2 + 1:]
                                 
                        # We will literally test every potential midpoint of the string.
                        # If the left half (ignoring spaces/punctuation) matches the start of the right half,
                        # we cut the string at that midpoint.
                        cleaned_alpha = lambda s: ''.join(c.lower() for c in s if c.isalnum())
                        
                        best_cut_idx = 0
                        # Test prefixes up to half the length of the string
                        for i in range(5, len(clean_title) // 2 + 5):

                            left_raw = clean_title[:i]
                            left_clean = cleaned_alpha(left_raw)
                            if len(left_clean) < 4:
                                continue # Too short to be a reliable prefix
                                
                            right_raw = clean_title[i:]
                            right_clean = cleaned_alpha(right_raw)
                            
                            if right_clean.startswith(left_clean):
                                # Ensure we aren't cutting a single word in half
                                if i < len(clean_title) and clean_title[i].isalpha() and clean_title[i-1].isalpha():
                                    continue # False positive cut inside a word
                                best_cut_idx = i
                        
                        if best_cut_idx > 0:
                            # Re-run the word break check just to be safe
                            if best_cut_idx < len(clean_title) and clean_title[best_cut_idx].isalpha() and clean_title[best_cut_idx-1].isalpha():
                                pass
                            else:
                                clean_title = clean_title[best_cut_idx:].strip().title()
                                if "/" in clean_title:
                                    clean_title = clean_title.replace(" / ", "/").replace("/", " / ")

                            
                        # Handle standard delimiters: "Python Developer - TechCorp - Indeed.com"
                        delimiters = [' - ', ' | ', ' at ', ' in ']
                        for delim in delimiters:
                            if delim in clean_title or delim.lower() in clean_title.lower():
                                lower_title = clean_title.lower()
                                idx = lower_title.rfind(delim.lower())
                                if idx != -1:
                                    potential_company = clean_title[idx + len(delim):].strip()
                                    site_names = ['naukri', 'indeed', 'glassdoor', 'wellfound', 'apna', 'cutshort', 'workindia', 'hirist']
                                    is_site = any(s in potential_company.lower() for s in site_names)
                                    
                                    if is_site:
                                        clean_title = clean_title[:idx].strip()
                                        idx2 = clean_title.lower().rfind(delim.lower())
                                        if idx2 != -1:
                                            company = clean_title[idx2 + len(delim):].strip()
                                            clean_title = clean_title[:idx2].strip()
                                    else:
                                        if len(potential_company) < 40:
                                            company = potential_company
                                            clean_title = clean_title[:idx].strip()
                                break
                                
                        # Aggressive Final Stripping
                        clean_title = re.sub(r'(?i)\s*[-|]\s*[a-z0-9]+\.(com|in|co).*$', '', clean_title)
                        clean_title = re.sub(r'(?i)\s*[-|]\s*(naukri|indeed|glassdoor|wellfound|apna|cutshort|workindia|hirist).*$', '', clean_title)
                        clean_title = re.sub(r'(?i)\bJob Listings\b\s*', '', clean_title).strip()
                        clean_title = re.sub(r'(?i)Job At\s+', '', clean_title).strip()
                        clean_title = clean_title.replace("...", "").strip()
                        
                        # Extract company heuristic
                        if company == "Unknown":
                            if " at " in clean_title.lower():
                                try:
                                    parts = re.split(r'(?i)\s+at\s+', clean_title)
                                    clean_title = parts[0].strip()
                                    company = parts[1].split(' ')[0].strip("-,|")
                                except:
                                    pass
                            elif snippet:
                                snip_match = re.match(r'^([A-Z][a-zA-Z0-9\s\,\.&]{2,25})\b\s+(is hiring|is looking|requires|is urgently looking)', snippet)
                                if snip_match:
                                    company = snip_match.group(1).strip()
                                    
                        if not clean_title or "Jobs In" in clean_title.title() or "Job Search" in clean_title.title() or "Job Alerts" in clean_title.title():
                            continue
                            
                        # If the entire title is the site name (Yahoo glitch) or a category search page
                        site_names_glitch = ['naukri', 'indeed', 'apna.co', 'apnaapna.cosearch', 'glassdoor', 'wellfound', 'jobs online']
                        if any(s.lower() == clean_title.replace(" ", "").lower() for s in site_names_glitch):
                            continue
                        if clean_title.lower().startswith("search jobs") or clean_title.lower().startswith("hire") or clean_title.lower().startswith("job application"): # Skip category pages
                            continue
                            
                        # Format Source Name nicely
                        source_name = site.split('.')[0].title()
                        if source_name.lower() in ["join", "careers", "jobs", "lever", "greenhouse"]:
                            source_name = "Career Site"
                            
                        job_id = f"job_y_{len(jobs)}_{hash(link) % 10000}"
                        
                        if link not in seen:
                            seen.add(link)
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
            
            b_offset += 10
            import time
            time.sleep(0.5) # Courtesy delay between pages
            
        except Exception as e:
            print(f"Yahoo Scraper error ({site} page offset {b_offset}): {e}")
            break
        
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
    
    # Calculate targets - significantly multiply the return limits
    total_sources = len(selected_domains) + (1 if use_linkedin else 0)
    target_per_source = max(20, 100 // max(1, total_sources))
    target_per_title = max(5, target_per_source // len(titles[:3]))

    import concurrent.futures

    def fetch_linkedin_task(t):
        return _scrape_linkedin_jobs(t, location, limit=target_per_title * 2)

    def fetch_yahoo_task(t, domain):
        return _scrape_jobs_via_yahoo(t, location, domain, limit=target_per_title * 2)

    # Launch all scrapers concurrently
    futures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        if use_linkedin:
            for t in titles[:3]:
                futures.append(executor.submit(fetch_linkedin_task, t))
                
        for domain in selected_domains:
            for t in titles[:2]:
                futures.append(executor.submit(fetch_yahoo_task, t, domain))

        # Collect results as they complete
        for future in concurrent.futures.as_completed(futures):
            try:
                fetched = future.result()
                for j in fetched:
                    if j['link'] and j['link'] not in seen_links:
                        seen_links.add(j['link'])
                        all_jobs.append(j)
            except Exception as e:
                print(f"Concurrent thread error: {e}")

    # If we still didn't get a huge batch, fallback safety scrape
    if len(all_jobs) < 20 and use_linkedin:
        more_jobs = _scrape_linkedin_jobs(role, location, limit=50)
        for j in more_jobs:
            if j['link'] and j['link'] not in seen_links:
                seen_links.add(j['link'])
                all_jobs.append(j)
                
    import random
    random.shuffle(all_jobs)

    # Remove the artificial 40 job cap entirely to return massive datasets
    return {"titles": titles, "jobs": all_jobs}


@app.post("/api/jobs/search/{sid}")
async def search_jobs(sid: str):
    """Search jobs: Gemini expands titles and generates realistic listings."""
    db = SessionLocal()
    try:
        prof = db.query(DBProfile).filter(DBProfile.session_id == sid).first()
        if not prof:
            raise HTTPException(status_code=404, detail="Session not found")
            
        try:
            pdata = json.loads(prof.profile_json) if prof.profile_json else {}
        except:
            pdata = {}
            
        role = pdata.get("base_job_role", "")
        region = pdata.get("target_metro_region", "")
        sources = pdata.get("target_sources", [])
    finally:
        db.close()
        
    if not role:
        raise HTTPException(400, "Base job role is required")
    if not region:
        raise HTTPException(400, "Target metro region is required")

    
    from scraper_pipeline.orchestrator import compile_orchestrator_graph
    import concurrent.futures
    import random
    
    # Initialize the compiled LangGraph machine
    graph = compile_orchestrator_graph()
    all_normalized_jobs = []

    def dispatch_agent_pipeline(platform_name):
        initial_state = {
            "platform_identifier": platform_name,
            "target_role": role,
            "target_location": region,
            "target_url": "",
            "raw_payload": "",
            "extracted_records": [],
            "normalized_records": [],
            "ingestion_success": False,
            "error_trace": [],
            "retry_count": 0
        }
        try:
            # LangGraph handles extraction -> normalization
            final_state = graph.invoke(initial_state)
            return final_state.get("normalized_records", [])
        except Exception as e:
            print(f"Pipeline error for {platform_name}: {e}")
            return []

    # Map the stored user sources to the platform scripts
    target_platforms = []
    if not sources or "LinkedIn" in sources:
        target_platforms.append("linkedin")
    if not sources or "Naukri" in sources:
        target_platforms.append("naukri")
    if not sources or "Indeed" in sources:
        target_platforms.append("indeed")
    if not sources or "Hirist" in sources:
        target_platforms.append("hirist")
    if not sources or "Glassdoor" in sources:
        target_platforms.append("glassdoor")
    if not sources or "Cutshort" in sources:
        target_platforms.append("cutshort")
    if not sources or "Wellfound" in sources:
        target_platforms.append("wellfound")
    if not sources or "Apna" in sources:
        target_platforms.append("apna")
    if not sources or "WorkIndia" in sources:
        target_platforms.append("workindia")
    if not sources or "Careersite" in sources:
        target_platforms.append("career site")
        
    # Execute the DAG workflows (reduce to max_workers=1 to prevent OOM from concurrent Headless Browsers)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        futures = [executor.submit(dispatch_agent_pipeline, p) for p in target_platforms]
        for future in concurrent.futures.as_completed(futures):
            results = future.result()
            all_normalized_jobs.extend(results)
            
    if len(all_normalized_jobs) == 0:
        # Fallback to pure Gemini generation if all scrapers get blocked
        import uuid # Ensure uuid is imported
        import json
        import re
        import os
        api_key = os.environ.get("GEMINI_API_KEY")
        if _GENAI_OK and api_key:
            try:
                client = genai.Client(api_key=api_key)
                prompt = (f"Generate 10 completely realistic job listings for a '{role}' in '{region}'. "
                          "Return ONLY a raw JSON array of objects with the exact keys: "
                          "'title', 'company', 'location', 'min_experience' (int), 'max_experience' (int), 'min_salary' (int format 50000), 'max_salary' (int format 80000), 'source_platform' (string representation of a job site). "
                          "Do not use markdown formatting.")
                res = _ask_gemini(client, prompt)
                res = re.sub(r'^```(?:json)?\s*', '', res)
                res = re.sub(r'\s*```$', '', res).strip()
                mock_jobs = json.loads(res)
                for j in mock_jobs:
                    all_normalized_jobs.append({
                        "id": str(uuid.uuid4()),
                        "title": j.get("title", f"{role}"),
                        "company": j.get("company", "Tech Corp"),
                        "location": j.get("location", region),
                        "min_experience": int(j.get("min_experience", 0)),
                        "max_experience": int(j.get("max_experience", 5)),
                        "min_salary": int(j.get("min_salary", 0)),
                        "max_salary": int(j.get("max_salary", 0)),
                        "application_url": f"https://example.com/jobs/{uuid.uuid4()}",
                        "source_platform": str(j.get("source_platform", "LinkedIn")),
                        "status": "Not Applied"
                    })
                print(f"Fallback generation: Generated {len(mock_jobs)} mock jobs via Gemini")
            except Exception as e:
                print(f"Fallback generation failed: {e}")
            
    random.shuffle(all_normalized_jobs)
    _jobs_cache[sid] = all_normalized_jobs
    
    return {
        "ok":     True,
        "titles": [role], # Gemini title expansion removed in favor of strict extraction
        "jobs":   all_normalized_jobs,
        "count":  len(all_normalized_jobs),
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
#  Advanced AI Endpoints (Phase 13)
# ─────────────────────────────────────────────

@app.post("/api/ai/analyze-job/{sid}")
def analyze_job(sid: str, req: JobScoreRequest):
    """ATS Vibe Check & Red Flag Scanner"""
    db = SessionLocal()
    try:
        prof = db.query(DBProfile).filter(DBProfile.session_id == sid).first()
        if not prof:
            raise HTTPException(status_code=400, detail="Missing session")

        prompt = f"""You are an expert technical recruiter and career coach.
I am sending you a candidate's profile data and a job description.
Your job is to analyze their fit and return EXACTLY valid JSON with these keys:
- match_score: (Integer 0-100 indicating fit)
- missing_keywords: (List of string keywords/skills in the JD but not in the profile)
- red_flags: (List of string warnings about toxic language like 'wear many hats', 'fast-paced', 'work hard play hard', demanding hours, or unrealistic requirements)

Profile JSON: {json.dumps(req.profile_data)}

Job Description: {req.job_description}

Return ONLY standard JSON. No markdown formatting blocks."""
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={os.environ.get('GEMINI_API_KEY')}"
        res = requests.post(url, json={"contents": [{"parts": [{"text": prompt}]}]})
        if not res.ok:
            raise HTTPException(500, "Gemini call failed")
            
        text = res.json()["candidates"][0]["content"]["parts"][0]["text"]
        
        text = re.sub(r'```json\s*', '', text)
        text = re.sub(r'```\s*$', '', text).strip()
        
        return json.loads(text)
    except Exception as e:
        print(f"Error in analyze_job: {e}")
        return {"match_score": 0, "missing_keywords": [], "red_flags": []}
    finally:
        db.close()


@app.post("/api/sync-tracker")
def sync_tracker(req: SyncTrackerRequest):
    """Auto-log applied jobs to a CSV (simulating Google Sheets)"""
    try:
        with open("tracking.csv", mode='a', newline='', encoding='utf-8') as file:
            writer = csv.writer(file)
            writer.writerow([req.company, req.title, req.url, req.date])
        return {"ok": True}
    except Exception as e:
        print(f"Failed to sync tracker: {e}")
        return {"ok": False, "error": str(e)}


@app.post("/api/ai/generate-text/{sid}")
def generate_text(sid: str, req: GenerateTextRequest):
    """Dynamic Cover Letter & Recruiter DM Generator"""
    db = SessionLocal()
    try:
        prof = db.query(DBProfile).filter(DBProfile.session_id == sid).first()
        if not prof:
            raise HTTPException(status_code=400, detail="Missing session")

        prompt = f"""You are a brilliant career coach generating a {req.prompt_context}.
Here is the candidate's profile data: {json.dumps(req.profile_data)}
Here is the job description: {req.job_description}

Instructions for {req.prompt_context}:
If it is a Cover Letter: Write a concise, energetic 3-paragraph letter matching their skills to the JD perfectly. 
If it is a Recruiter DM: Write a short, punchy 3-sentence connection request mentioning something specific from the JD.

Return ONLY the raw text, no intro, no emojis, no asterisks."""

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={os.environ.get('GEMINI_API_KEY')}"
        res = requests.post(url, json={"contents": [{"parts": [{"text": prompt}]}]})
        if not res.ok:
            raise HTTPException(500, "Gemini call failed")
            
        return {"text": res.json()["candidates"][0]["content"]["parts"][0]["text"].strip()}
    except Exception as e:
        print(f"Error in generate_text: {e}")
        return {"text": "Generation failed."}
    finally:
        db.close()


@app.post("/api/ai/interview-prep/{sid}")
def interview_prep(sid: str, req: InterviewPrepRequest):
    """Instant Technical Interview Prep Generator"""
    db = SessionLocal()
    try:
        prof = db.query(DBProfile).filter(DBProfile.session_id == sid).first()
        if not prof:
            raise HTTPException(status_code=400, detail="Missing session")

        prompt = f"""Based entirely on the technical requirements and stack mentioned in this Job Description, generate exactly 5 highly probable technical interview questions that the candidate should expect. For each question, provide a brief, excellent 1-paragraph summary of how they should answer it.

Job Description: {req.job_description}

Return ONLY valid JSON with this format:
[{{ "question": "Question text", "answer_guide": "Guide text" }}]
"""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={os.environ.get('GEMINI_API_KEY')}"
        res = requests.post(url, json={"contents": [{"parts": [{"text": prompt}]}]})
        if not res.ok:
            raise HTTPException(500, "Gemini call failed")
            
        text = res.json()["candidates"][0]["content"]["parts"][0]["text"]
        text = re.sub(r'```json\s*', '', text)
        text = re.sub(r'```\s*$', '', text).strip()
        
        return {"questions": json.loads(text)}
    except Exception as e:
        print(f"Error in interview_prep: {e}")
        return {"questions": []}
    finally:
        db.close()


# ─────────────────────────────────────────────
#  Entry-point
# ─────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)

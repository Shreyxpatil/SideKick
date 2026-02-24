import sys
import os

from scraper_pipeline.extractors.naukri import extract_naukri_jobs
from scraper_pipeline.extractors.linkedin import extract_linkedin_jobs
from scraper_pipeline.extractors.indeed import extract_indeed_jobs
from scraper_pipeline.extractors.glassdoor import extract_glassdoor_jobs
from scraper_pipeline.extractors.hirist import extract_hirist_jobs
from scraper_pipeline.extractors.cutshort import extract_cutshort_jobs
from scraper_pipeline.extractors.wellfound import extract_wellfound_jobs
from scraper_pipeline.extractors.apna import extract_apna_jobs
from scraper_pipeline.extractors.workindia import extract_workindia_jobs
from scraper_pipeline.extractors.careersites import extract_careersites_jobs

def test_extractor(name, func, keyword="Software Engineer", location="Pune"):
    print(f"\n[{name}] Testing...")
    try:
        jobs = func(keyword, location)
        print(f"[{name}] Done. Found {len(jobs)} jobs.")
        for j in jobs[:2]:
            print(f"  - {j.get('raw_title', 'No Title')} @ {j.get('raw_company', 'No Company')}")
    except Exception as e:
        print(f"[{name}] Error: {e}")

if __name__ == "__main__":
    test_extractor("Naukri", extract_naukri_jobs)
    test_extractor("LinkedIn", extract_linkedin_jobs)
    test_extractor("Indeed", extract_indeed_jobs)
    test_extractor("Glassdoor", extract_glassdoor_jobs)
    test_extractor("Hirist", extract_hirist_jobs)
    test_extractor("Cutshort", extract_cutshort_jobs)
    test_extractor("Wellfound", extract_wellfound_jobs)
    test_extractor("Apna", extract_apna_jobs)
    test_extractor("WorkIndia", extract_workindia_jobs)
    test_extractor("CareerSites", extract_careersites_jobs)

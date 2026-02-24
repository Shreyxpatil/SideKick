import requests

def extract_careersites_jobs(keyword: str, ats_provider: str = "greenhouse") -> list:
    """
    Bypasses custom CSS implementations on company websites by querying the 
    standardized APIs exposed by the underlying ATS platforms.
    For this generic pipeline, we will use a sample company for each to demonstrate.
    """
    extracted_jobs = []
    headers = {"Accept": "application/json", "User-Agent": "Mozilla/5.0"}
    
    # We use some well-known sample companies that use these ATSs 
    # since 'Career site' doesn't specify a single company.
    
    try:
        if ats_provider == "greenhouse":
            company_identifier = "airbnb" # Sample company targeting Greenhouse
            api_url = f"https://boards-api.greenhouse.io/v1/boards/{company_identifier}/jobs"
            response = requests.get(api_url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                for job in response.json().get('jobs', []):
                    title = job.get('title', '')
                    if keyword.lower() in title.lower() or not keyword:
                        extracted_jobs.append({
                            "raw_title": title,
                            "raw_company": company_identifier.capitalize(),
                            "raw_location": job.get('location', {}).get('name', 'Remote'),
                            "raw_experience": "Not specified",
                            "raw_salary": "Not specified",
                            "application_url": job.get('absolute_url', ''),
                            "source_platform": "Career site"
                        })
                    
        elif ats_provider == "lever":
            company_identifier = "netflix" # Sample company targeting Lever
            api_url = f"https://api.lever.co/v0/postings/{company_identifier}"
            response = requests.get(api_url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                for job in response.json():
                    title = job.get('text', '')
                    if keyword.lower() in title.lower() or not keyword:
                        extracted_jobs.append({
                            "raw_title": title,
                            "raw_company": company_identifier.capitalize(),
                            "raw_location": job.get('categories', {}).get('location', 'Remote'),
                            "raw_experience": "Not specified",
                            "raw_salary": "Not specified",
                            "application_url": job.get('hostedUrl', ''),
                            "source_platform": "Career site"
                        })
                    
        elif ats_provider == "workday":
            # Workday relies on paginated POST requests [69, 70]
            company_identifier = "upenn" # Sample company
            api_url = f"https://wd1.myworkdaysite.com/wday/cxs/{company_identifier}/careers/jobs"
            payload = {"appliedFacets":{}, "limit":50, "offset":0, "searchText": keyword}
            
            response = requests.post(api_url, json=payload, headers=headers, timeout=10)
            if response.status_code == 200:
                for job in response.json().get('jobPostings', []):
                    extracted_jobs.append({
                        "raw_title": job.get('title', ''),
                        "raw_company": company_identifier.capitalize(),
                        "raw_location": job.get('locationsText', 'Remote'),
                        "raw_experience": "Not specified",
                        "raw_salary": "Not specified",
                        # Reconstruct the application URL from the externalPath hash
                        "application_url": f"https://wd1.myworkdaysite.com/en-US/{company_identifier}/careers/job/{job.get('externalPath', '')}",
                        "source_platform": "Career site"
                    })
    except Exception as e:
        print(f"Career Site ({ats_provider}) Extraction Error: {e}")
                
    return extracted_jobs

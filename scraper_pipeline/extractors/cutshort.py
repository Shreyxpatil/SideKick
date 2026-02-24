import requests

def extract_cutshort_jobs(keyword: str, location: str, limit: int = 50, offset: int = 0) -> list:
    """
    Reconstructs the GraphQL operation payload to query the backend directly,
    bypassing the frontend SPA entirely.
    """
    graphql_endpoint = "https://cutshort.io/api/graphql"
    
    # Payload derived from inspecting XHR traffic 
    payload = {
        "operationName": "SearchJobs",
        "variables": {
            "limit": limit,
            "offset": offset,
            "filters": {
                "keywords": [keyword],
                "locations": [location]
            }
        },
        "query": """
        query SearchJobs($limit: Int, $offset: Int) {
            jobs(limit: $limit, offset: $offset) {
                id
                title
                company { name }
                locations { city }
                experience { min max }
                salary { min max currency }
                url
            }
        }
        """
    }
    
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0"
    }
    
    extracted_jobs = []
    try:
        response = requests.post(graphql_endpoint, json=payload, headers=headers, timeout=10)
        
        if response.status_code == 200:
            json_data = response.json()
            jobs_array = json_data.get('data', {}).get('jobs', [])
            
            for job in jobs_array:
                locations = job.get('locations', [])
                loc_str = ", ".join([loc.get('city', '') for loc in locations]) if locations else "Remote"
                
                exp_data = job.get('experience', {})
                sal_data = job.get('salary', {})
                
                extracted_jobs.append({
                    "raw_title": job.get('title', ''),
                    "raw_company": job.get('company', {}).get('name', ''),
                    "raw_location": loc_str,
                    "raw_experience": f"{exp_data.get('min', 0)}-{exp_data.get('max', 0)} years",
                    "raw_salary": f"{sal_data.get('min', '')}-{sal_data.get('max', '')} {sal_data.get('currency', '')}",
                    "application_url": job.get('url', ''),
                    "source_platform": "Cutshort"
                })
    except Exception as e:
        print(f"Cutshort Extraction Error: {e}")
            
    return extracted_jobs

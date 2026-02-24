import requests

def extract_hirist_jobs(keyword: str, location: str) -> list:
    """
    Interacts directly with the reverse-engineered Hirist REST API endpoint.
    Keyword and location search integration.
    """
    # Using generic category 1 for demonstration if specific search endpoint is complex
    # In production, we'd reverse-engineer the exact search payload mapping
    api_endpoint = "https://www.hirist.tech/api/jobs/category/1"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Referer": "https://www.hirist.tech/"
    }
    
    extracted_jobs = []
    try:
        response = requests.get(api_endpoint, headers=headers, timeout=10)
        
        if response.status_code == 200:
            json_payload = response.json()
            # Navigate the JSON structure to extract job nodes
            for item in json_payload.get('data', []):
                # Basic string matching for keyword/location filtering since we hit a generic endpoint
                title = item.get('title', 'Unknown')
                loc = item.get('location', 'Unknown')
                
                if keyword.lower() in title.lower() or location.lower() in loc.lower():
                    extracted_jobs.append({
                        "raw_title": title,
                        "raw_company": item.get('company_name', 'Unknown'),
                        "raw_location": loc,
                        # Construct experience string from min/max integer fields
                        "raw_experience": f"{item.get('min_experience', 0)}-{item.get('max_experience', 0)} years",
                        "raw_salary": "Not specified", # Hirist rarely exposes explicit salaries in this payload
                        "application_url": item.get('job_url', ''),
                        "source_platform": "Hirist"
                    })
    except Exception as e:
        print(f"Hirist Extraction error: {e}")
            
    return extracted_jobs

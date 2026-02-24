import requests
import json
from bs4 import BeautifulSoup

def extract_wellfound_jobs(keyword: str, location: str) -> list:
    """
    Unpacks the Apollo state graph embedded within Next.js hydration scripts,
    extracting data without executing JavaScript.
    """
    from urllib.parse import quote
    target_url = f"https://wellfound.com/jobs?location={quote(location)}&keywords={quote(keyword)}"
    extracted_jobs = []
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
        "Accept-Language": "en-US,en;q=0.9"
    }
    
    try:
        response = requests.get(target_url, headers=headers, timeout=15)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Locate the critical script tag containing the initial application state 
        script_tag = soup.find('script', id='__NEXT_DATA__')
        
        if script_tag and script_tag.string:
            try:
                json_data = json.loads(script_tag.string)
                # Traverse the nested dictionary structure to locate the Apollo cache
                apollo_state = json_data.get('props', {}).get('pageProps', {}).get('apolloState', {})
                
                # Iterate through all entities in the graph looking for JobListing nodes
                for key, node in apollo_state.items():
                    if key.startswith('JobListing:'):
                        extracted_jobs.append({
                            "raw_title": node.get('title', 'Unknown'),
                            "raw_company": node.get('company', {}).get('name', 'Unknown'),
                            "raw_location": node.get('locationNames', 'Unknown'),
                            "raw_experience": "Not explicitly defined in cache",
                            "raw_salary": node.get('compensationString', 'Not specified'),
                            "application_url": node.get('jobUrl', target_url),
                            "source_platform": "Wellfound"
                        })
            except json.JSONDecodeError:
                pass # Handle potential parsing failures gracefully
    except Exception as e:
        print(f"Wellfound Extraction Error: {e}")
            
    return extracted_jobs

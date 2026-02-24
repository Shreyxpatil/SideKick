import requests
from bs4 import BeautifulSoup

def extract_linkedin_jobs(keyword: str, location: str, total_pages: int = 5) -> list:
    base_api_url = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
    extracted_jobs = []
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }
    
    for start_idx in range(0, total_pages * 25, 25):
        params = {"keywords": keyword, "location": location, "start": start_idx}
        
        try:
            response = requests.get(base_api_url, params=params, headers=headers, timeout=10)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                job_cards = soup.find_all('div', class_='base-card')
                
                for card in job_cards:
                    title_elem = card.find('h3', class_='base-search-card__title')
                    company_elem = card.find('h4', class_='base-search-card__subtitle')
                    loc_elem = card.find('span', class_='job-search-card__location')
                    url_elem = card.find('a', class_='base-card__full-link')
                    
                    if title_elem and company_elem:
                        extracted_jobs.append({
                            "raw_title": title_elem.get_text(strip=True),
                            "raw_company": company_elem.get_text(strip=True),
                            "raw_location": loc_elem.get_text(strip=True) if loc_elem else "Not specified",
                            "raw_experience": "Not specified", 
                            "raw_salary": "Not specified",
                            "application_url": url_elem['href'] if url_elem else "",
                            "source_platform": "LinkedIn"
                        })
            else:
                break
        except Exception as e:
            print(f"LinkedIn Extraction error: {e}")
            break
            
    return extracted_jobs

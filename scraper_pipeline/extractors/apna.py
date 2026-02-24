import requests
from bs4 import BeautifulSoup
from urllib.parse import quote

def extract_apna_jobs(keyword: str, location: str) -> list:
    """
    Lightweight HTML extraction using Requests pointed at the mobile site 
    where aggressive WAF blocks are disabled, ensuring fast and RAM-efficient scrapes.
    """
    target_url = f"https://apna.co/jobs?search=true&text={quote(keyword)}&location_id=any&location_identifier={quote(location)}"
    extracted_jobs = []
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36",
        "Accept-Language": "en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
    }
    
    try:
        response = requests.get(target_url, headers=headers, timeout=12)
        if response.status_code != 200:
            return []
            
        soup = BeautifulSoup(response.text, 'html.parser')
        job_cards = soup.select('div.JobCard, div[data-testid="job-card"]')
        
        for card in job_cards:
            title_elem = card.select_one('h3.JobTitle, h2')
            title = title_elem.text.strip() if title_elem else "Unknown Title"
            
            company_elem = card.select_one('p.CompanyName, p.title')
            company = company_elem.text.strip() if company_elem else "Unknown Company"
            
            salary_elem = card.select_one('div.SalaryDetails, p.salary')
            salary = salary_elem.text.strip() if salary_elem else "Not specified"
            
            loc_elem = card.select_one('span.LocationText, p.location')
            loc = loc_elem.text.strip() if loc_elem else "Not specified"
            
            sponsored = card.find(string=lambda text: text and ("Promoted" in text or "Sponsored" in text))
            if sponsored:
                continue
                
            link_elem = card.select_one('a')
            link_path = link_elem.get('href') if link_elem else ""
            full_link = f"https://apna.co{link_path}" if str(link_path).startswith('/') else target_url
            
            if title != "Unknown Title":
                extracted_jobs.append({
                    "raw_title": title, 
                    "raw_company": company, 
                    "raw_location": loc,
                    "raw_experience": "Not specified",
                    "raw_salary": salary, 
                    "application_url": full_link,
                    "source_platform": "Apna"
                })
    except Exception as e:
        print(f"Apna Extraction Error: {e}")
        
    return extracted_jobs

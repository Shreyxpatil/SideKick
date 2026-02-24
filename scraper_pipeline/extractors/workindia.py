from playwright.async_api import async_playwright
import asyncio

async def _workindia_async(keyword: str, location: str) -> list:
    from urllib.parse import quote
    target_url = f"https://www.workindia.in/jobs-in-{quote(location.lower().replace(' ', '-'))}/?query={quote(keyword)}"
    extracted_jobs = []
    
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            # wait_until="domcontentloaded" is sufficient for WorkIndia's architecture
            await page.goto(target_url, wait_until="domcontentloaded", timeout=15000)
            
            # Target the specific CSS classes for job listings 
            job_cards = await page.locator('div.JobCard, div.job-card').all()
            
            for card in job_cards:
                try:
                    title = await card.locator('h2, span.job-title').text_content()
                    company = await card.locator('span.company-name, p.company').text_content()
                    salary = await card.locator('span.salary, p.salary').text_content()
                    
                    try:
                        link_element = card.locator('a.job-link, a').first
                        relative_link = await link_element.get_attribute('href')
                        link = f"https://www.workindia.in{relative_link}" if relative_link and relative_link.startswith('/') else relative_link
                    except:
                        link = target_url
                    
                    if title and company:
                        extracted_jobs.append({
                            "raw_title": title.strip(), 
                            "raw_company": company.strip(), 
                            "raw_location": location, # Location often embedded in URL slug
                            "raw_experience": "Not specified",
                            "raw_salary": salary.strip() if salary else "Not specified", 
                            "application_url": link or target_url,
                            "source_platform": "WorkIndia"
                        })
                except Exception:
                    continue
                    
            await browser.close()
    except Exception as e:
        print(f"WorkIndia Extraction Error: {e}")
        
    return extracted_jobs

def extract_workindia_jobs(keyword: str, location: str) -> list:
    """
    Waits for the DOM content to load fully before executing extraction logic
    against dynamically rendered components. Sync wrapper.
    """
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(_workindia_async(keyword, location))

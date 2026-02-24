from playwright.async_api import async_playwright
import asyncio

async def extract_naukri_jobs(keyword: str, location: str) -> list:
    from urllib.parse import quote
    target_url = f"https://www.naukri.com/{quote(keyword.replace(' ', '-'))}-jobs-in-{quote(location.replace(' ', '-'))}"
    extracted_jobs = []
    
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=['--disable-blink-features=AutomationControlled']
            )
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
            )
            page = await context.new_page()
            
            await page.goto(target_url, wait_until="networkidle")
            await asyncio.sleep(2.0)
            
            job_cards = await page.locator("div.jobTuple, div.srp-jobtuple-wrapper").all()
            
            for card in job_cards:
                try:
                    title = await card.locator("a.title").text_content()
                    company = await card.locator("a.comp-name, a.subTitle").text_content()
                    exp = await card.locator("span.expwdth").text_content() if await card.locator("span.expwdth").count() > 0 else "Not specified"
                    loc = await card.locator("span.locWdth").text_content() if await card.locator("span.locWdth").count() > 0 else "Not specified"
                    sal = await card.locator("span.sal").text_content() if await card.locator("span.sal").count() > 0 else "Not disclosed"
                    link = await card.locator("a.title").get_attribute("href")
                    
                    if title and company:
                        extracted_jobs.append({
                            "raw_title": title.strip(), 
                            "raw_company": company.strip(), 
                            "raw_experience": exp.strip(),
                            "raw_salary": sal.strip(), 
                            "raw_location": loc.strip(), 
                            "application_url": link,
                            "source_platform": "Naukri.com"
                        })
                except Exception as e:
                    continue
                    
            await browser.close()
    except Exception as e:
        print(f"Naukri Extraction error: {e}")
        
    return extracted_jobs

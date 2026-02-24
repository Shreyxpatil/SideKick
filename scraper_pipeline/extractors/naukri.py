from seleniumbase import Driver
import time

def extract_naukri_jobs(keyword: str, location: str) -> list:
    from urllib.parse import quote
    target_url = f"https://www.naukri.com/{quote(keyword.replace(' ', '-'))}-jobs-in-{quote(location.replace(' ', '-'))}"
    extracted_jobs = []
    
    try:
        # Utilize SeleniumBase UC Mode to bypass DataDome/Turnstile blocks
        driver = Driver(uc=True, headless=True)
        driver.uc_open_with_reconnect(target_url, 4)
        
        # Additional time for CAPTCHA resolution and DOM hydration
        time.sleep(5)
        
        # Locate the new Naukri SRP job wrapper cards
        job_cards = driver.find_elements("css selector", "div.srp-jobtuple-wrapper")
        
        for card in job_cards:
            try:
                title = card.find_element("css selector", "a.title").text
                company = card.find_element("css selector", "a.comp-name").text
                exp = card.find_element("css selector", "span.expwdth").text
                loc = card.find_element("css selector", "span.locWdth").text
                
                try:
                    sal = card.find_element("css selector", "span.sal").text
                except:
                    sal = "Not disclosed"
                
                link = card.find_element("css selector", "a.title").get_attribute("href")
                
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
                # Capture missing sub-elements silently without crashing the loop
                continue
                
    except Exception as e:
        print(f"Naukri Extraction error: {e}")
    finally:
        try:
            driver.quit()
        except:
            pass
            
    return extracted_jobs

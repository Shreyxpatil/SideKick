import asyncio
import os
from scraper_pipeline.orchestrator import compile_orchestrator_graph

def test_pipeline():
    graph = compile_orchestrator_graph()
    
    initial_state = {
        "platform_identifier": "linkedin",
        "target_role": "Software Engineer",
        "target_location": "New York",
        "target_url": "",
        "raw_payload": "",
        "extracted_records": [],
        "normalized_records": [],
        "ingestion_success": False,
        "error_trace": [],
        "retry_count": 0,
        "gemini_key": os.environ.get("GEMINI_API_KEY", "")
    }

    print("Submitting state to LangGraph orchestrator...")
    result = graph.invoke(initial_state)
    
    normalized = result.get("normalized_records", [])
    errors = result.get("error_trace", [])
    
    print("\n--- Pipeline Execution Complete ---")
    print(f"Extracted and Normalized {len(normalized)} jobs.")
    
    if len(normalized) > 0:
        print("\nSample Output (Job 1):")
        print(normalized[0])
        
    if errors:
        print("\nErrors Encoutnered:")
        for e in errors:
            print(f" - {e}")

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    test_pipeline()

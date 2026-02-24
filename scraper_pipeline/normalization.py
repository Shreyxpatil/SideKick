from pydantic import ValidationError
from google.genai import types
from google.genai.client import Client
from .state import NormalizedJobRecord
import json
import uuid

def execute_llm_normalization_gemini(state: dict) -> dict:
    """LangGraph node utilizing Gemini structured output for data normalization."""
    raw_jobs = state.get("extracted_records", [])
    normalized_results = []
    errors = state.get("error_trace", [])
    retry_count = state.get("retry_count", 0) + 1
    
    if not state.get("gemini_key"):
        errors.append("Validation failed: No Gemini Key provided.")
        return {"normalized_records": normalized_results, "error_trace": errors}
        
    client = Client(api_key=state["gemini_key"])
    
    # We batch process up to 10 at a time to avoid huge payload limits
    batch_size = 10
    
    for i in range(0, len(raw_jobs), batch_size):
        batch = raw_jobs[i:i+batch_size]
        
        prompt = f"""
        You are an expert data normalization engine. Extract and format the following 
        unstructured job listings into a JSON list.
        Crucial: Convert all experience ranges into integer years. Convert all salaries to integers.
        Return ONLY valid JSON matching the schema.
        
        Raw Data:
        {json.dumps(batch, indent=2)}
        """
        
        try:
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=list[NormalizedJobRecord],
                    temperature=0.0,
                ),
            )
            
            if response.text:
                parsed = json.loads(response.text)
                for item in parsed:
                    # Enforce default GUIDs if the LLM forgot
                    if not item.get("id"):
                        item["id"] = f"job_y_{uuid.uuid4().hex[:8]}"
                    normalized_results.append(item)
                    
        except Exception as e:
            errors.append(f"Validation batch failed: {str(e)}")
    return {"normalized_records": normalized_results, "error_trace": errors, "retry_count": retry_count}

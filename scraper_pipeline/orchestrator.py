from langgraph.graph import StateGraph, END
from .state import PipelineState
from .extractors.naukri import extract_naukri_jobs
from .extractors.linkedin import extract_linkedin_jobs
from .extractors.indeed import extract_indeed_jobs
from .extractors.hirist import extract_hirist_jobs
from .extractors.glassdoor import extract_glassdoor_jobs
from .extractors.cutshort import extract_cutshort_jobs
from .extractors.wellfound import extract_wellfound_jobs
from .extractors.apna import extract_apna_jobs
from .extractors.workindia import extract_workindia_jobs
from .extractors.careersites import extract_careersites_jobs
from .normalization import execute_llm_normalization_gemini
import asyncio

def execute_platform_extraction(state: dict) -> dict:
    """Invokes the specific extractor based on the platform requested."""
    extracted = []
    platform = state.get("platform_identifier", "").lower()
    
    # Simple router loop to run the async extractors synchronously for the workflow
    if platform == "naukri":
        extracted = extract_naukri_jobs(state["target_role"], state["target_location"])
    elif platform == "linkedin":
        extracted = extract_linkedin_jobs(state["target_role"], state["target_location"])
    elif platform == "indeed":
        extracted = extract_indeed_jobs(state["target_role"], state["target_location"])
    elif platform == "hirist":
        extracted = extract_hirist_jobs(state["target_role"], state["target_location"])
    elif platform == "glassdoor":
        extracted = extract_glassdoor_jobs(state["target_role"], state["target_location"])
    elif platform == "cutshort":
        extracted = extract_cutshort_jobs(state["target_role"], state["target_location"])
    elif platform == "wellfound":
        extracted = extract_wellfound_jobs(state["target_role"], state["target_location"])
    elif platform == "apna":
        extracted = extract_apna_jobs(state["target_role"], state["target_location"])
    elif platform == "workindia":
        extracted = extract_workindia_jobs(state["target_role"], state["target_location"])
    elif platform == "career site":
        extracted = extract_careersites_jobs(state["target_role"])
        
    return {"extracted_records": extracted}

def check_validation_status(state: dict) -> str:
    """Conditional routing based on validation errors and retry limits."""
    # If the LLM normalization populated data, success.
    if state.get("normalized_records"):
        return "success"
    
    # If there are errors and we haven't hit the limit, retry.
    if state.get("error_trace") and state.get("retry_count", 0) < 3:
        # Increment retry
        return "retry"
        
    # Unrecoverable error
    return "fail"

def compile_orchestrator_graph():
    """Builds and compiles the complex DAG state machine."""
    workflow = StateGraph(PipelineState)
    
    # Add Nodes
    workflow.add_node("extraction_agent", execute_platform_extraction)
    workflow.add_node("normalization_agent", execute_llm_normalization_gemini)
    
    # We skip physical DB Ingestion Node logic because we are returning straight
    # to the FastAPI cache per User instructions (No SQLite for PII). 
    # Let's represent the end state.
    
    # Edge Routing
    workflow.set_entry_point("extraction_agent")
    workflow.add_edge("extraction_agent", "normalization_agent")
    
    # Conditional Edges for LLM Retries
    workflow.add_conditional_edges(
        "normalization_agent",
        check_validation_status,
        {
            "success": END,
            "retry": "normalization_agent",
            "fail": END
        }
    )
    
    return workflow.compile()

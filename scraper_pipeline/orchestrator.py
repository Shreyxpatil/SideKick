from langgraph.graph import StateGraph, END
from .state import PipelineState
from .extractors.naukri import extract_naukri_jobs
from .extractors.linkedin import extract_linkedin_jobs
from .normalization import execute_llm_normalization_gemini
import asyncio

def execute_platform_extraction(state: dict) -> dict:
    """Invokes the specific extractor based on the platform requested."""
    extracted = []
    platform = state.get("platform_identifier", "").lower()
    
    # Simple router loop to run the async extractors synchronously for the workflow
    if platform == "naukri":
        # Run async function using asyncio
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        extracted = loop.run_until_complete(extract_naukri_jobs(state["target_role"], state["target_location"]))
        
    elif platform == "linkedin":
        # Run synchronous python requests function
        extracted = extract_linkedin_jobs(state["target_role"], state["target_location"])
        
    # Other platforms (Indeed, Glassdoor, etc.) would be added here in full production.
    # We are demonstrating the core architecture requested.
        
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

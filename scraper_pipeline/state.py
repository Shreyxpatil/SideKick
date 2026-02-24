from typing import TypedDict, List, Dict, Any, Optional, Annotated
import operator
from pydantic import BaseModel, Field

class NormalizedJobRecord(BaseModel):
    id: str = Field(description="Unique internal ID (e.g., job_y_{hash}). Generate a short GUID if none provided.")
    job_title: str = Field(description="Standardized job title, removing promotional text.")
    company_name: str = Field(description="Cleaned company name without legal suffixes.")
    location: str = Field(description="Standardized City and Country format.")
    source: str = Field(description="The platform name (e.g. LinkedIn, Naukri).")
    experience_min: int = Field(description="Minimum years of experience required. Convert months to years. 0 if fresher. If none provided, infer 0.")
    experience_max: int = Field(description="Maximum years of experience required.")
    salary_min: Optional[int] = Field(description="Minimum base salary as an integer.")
    salary_max: Optional[int] = Field(description="Maximum base salary as an integer.")
    application_url: str = Field(description="The original URL of the job posting.")
    description: str = Field(description="2-sentence teaser or snippet of the job.")
    salary: str = Field(description="String representation of the salary or 'Not disclosed'.")
    posted: str = Field(description="String representation of posting time e.g. 'Recently'")
    status: str = Field(description="Always 'Not Applied'")

class PipelineState(TypedDict):
    platform_identifier: str
    target_role: str
    target_location: str
    target_url: str
    raw_payload: str
    extracted_records: List[Dict[str, Any]]
    normalized_records: Annotated[List[Dict[str, Any]], operator.add]
    ingestion_success: bool
    error_trace: Annotated[List[str], operator.add]
    retry_count: Annotated[int, operator.add]


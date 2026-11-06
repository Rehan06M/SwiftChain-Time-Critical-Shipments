from datetime import datetime, timedelta, timezone
from typing import Literal
from math import isfinite

from fastapi import FastAPI
from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)

app = FastAPI(
    title="SwiftChain Intelligence Service",
    version="1.0.0",
)


class ETARequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        allow_inf_nan=False,
    )

    shipment_id: str = Field(min_length=1, max_length=100)
    deadline: AwareDatetime

    remaining_distance_km: float = Field(ge=0, le=50000)
    average_speed_kmh: float = Field(gt=0, le=1000)

    # Remaining time before movement or delivery can proceed.
    pickup_minutes: float = Field(default=0, ge=0, le=10080)
    handling_minutes: float = Field(default=0, ge=0, le=10080)
    disruption_minutes: float = Field(default=0, ge=0, le=10080)

    @field_validator("average_speed_kmh")
    @classmethod
    def validate_speed(cls, value: float) -> float:
        if not isfinite(value):
            raise ValueError("Speed must be finite")
        return value


class ETAResponse(BaseModel):
    shipment_id: str
    calculated_at: datetime
    estimated_arrival: datetime
    remaining_minutes: float
    slack_minutes: float
    predicted_late_by_minutes: float

    risk_status: Literal[
        "On Track",
        "At Risk",
        "Critical Risk",
        "Delayed",
    ]

    explanation: str
    model_version: str

    breakdown: dict[str, float]


@app.get("/health")
def health():
    return {
        "service": "SwiftChain Intelligence",
        "status": "running",
    }


@app.post("/predict/eta", response_model=ETAResponse)
def predict_eta(payload: ETARequest) -> ETAResponse:
    now = datetime.now(timezone.utc)
    deadline = payload.deadline.astimezone(timezone.utc)

    travel_minutes = (
        payload.remaining_distance_km
        / payload.average_speed_kmh
        * 60
    )

    remaining_minutes = (
        travel_minutes
        + payload.pickup_minutes
        + payload.handling_minutes
        + payload.disruption_minutes
    )

    estimated_arrival = now + timedelta(
        minutes=remaining_minutes
    )

    slack_minutes = (
        deadline - estimated_arrival
    ).total_seconds() / 60

    late_by_minutes = max(0, -slack_minutes)

    # These thresholds are initial demo rules.
    if now >= deadline:
        risk_status = "Delayed"
        explanation = (
            "The delivery deadline has already passed."
        )
    elif slack_minutes <= 30:
        risk_status = "Critical Risk"

        if slack_minutes < 0:
            explanation = (
                "Estimated arrival is after the deadline."
            )
        else:
            explanation = (
                "Estimated arrival leaves at most "
                "30 minutes of deadline buffer."
            )
    elif slack_minutes <= 90:
        risk_status = "At Risk"
        explanation = (
            "Estimated arrival leaves at most "
            "90 minutes of deadline buffer."
        )
    else:
        risk_status = "On Track"
        explanation = (
            "Estimated arrival leaves more than "
            "90 minutes of deadline buffer."
        )

    return ETAResponse(
        shipment_id=payload.shipment_id,
        calculated_at=now,
        estimated_arrival=estimated_arrival,
        remaining_minutes=round(remaining_minutes, 2),
        slack_minutes=round(slack_minutes, 2),
        predicted_late_by_minutes=round(late_by_minutes, 2),
        risk_status=risk_status,
        explanation=explanation,
        model_version="rules-v1",
        breakdown={
            "travel_minutes": round(travel_minutes, 2),
            "pickup_minutes": payload.pickup_minutes,
            "handling_minutes": payload.handling_minutes,
            "disruption_minutes": payload.disruption_minutes,
        },
    )
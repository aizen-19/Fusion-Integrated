"""Submit Leave Request service (HR-UC-003 / SubmitLeaveControl / BW-HR-01 Entry)."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.db import transaction

from core.api.exceptions import BadRequestError, ConflictError
from modules.directory import contracts as directory_contracts
from modules.leave.domain import state_machine as sm
from modules.leave.domain.rules import (
    determine_approval_authority,
    validate_balance_and_eligibility,
    validate_required_fields,
)
from modules.leave.models import ApprovingAuthority, LeaveBalance, LeaveRequest
from modules.leave.services.balances import ensure_balances_for_user


def submit_leave_request(
    user_id: int,
    leave_type: str,
    start_date: date,
    end_date: date,
    duration_days: Decimal,
    justification: str,
) -> LeaveRequest:
    """Submit a valid leave request and route it to the designated approving authority.

    Enforces:
    - BR-HR-007 & BR-HR-034: Mandatory fields & supported leave types
    - BR-HR-008: Leave balance sufficiency
    - BR-HR-009: Authority selection and routing based on category
    - BW-HR-01: Entry state transition from Draft -> Pending Current Authority
    """
    # 1. Validate fields
    val = validate_required_fields(
        leave_type=leave_type,
        start_date=start_date,
        end_date=end_date,
        duration_days=duration_days,
        justification=justification,
    )
    if not val.is_valid:
        raise BadRequestError("; ".join(val.errors))

    # 2. Check balance & eligibility (BR-HR-008)
    year = start_date.year
    ensure_balances_for_user(user_id, year)
    bal = LeaveBalance.objects.filter(
        user_id=user_id,
        leave_type=leave_type,
        year=year,
    ).first()

    available = bal.available_balance if bal else Decimal("0.0")
    bal_val = validate_balance_and_eligibility(available, duration_days)
    if not bal_val.is_valid:
        raise ConflictError("; ".join(bal_val.errors))

    # 3. State transition check (Draft -> Pending)
    sm.resolve(sm.DRAFT, sm.PENDING_CURRENT_AUTHORITY, sm.APPLICANT)

    # 4. Resolve approval authority per BR-HR-009
    # Lookup directory info for user category and department
    users_info = directory_contracts.get_users([user_id])
    user_info = users_info.get(user_id, {})
    category = user_info.get("kind", "staff")
    department = user_info.get("department", "")

    # Look up configured active authorities
    active_authorities = ApprovingAuthority.objects.filter(is_active=True)
    auth_dir = {}
    for a in active_authorities:
        auth_dir[a.role] = a.user_id
        if a.department:
            auth_dir[f"{a.role}_{a.department}"] = a.user_id

    auth_id, auth_role = determine_approval_authority(
        employee_category=category,
        department=department,
        authority_directory=auth_dir,
    )

    # 5. Create LeaveRequest in atomic block
    with transaction.atomic():
        request = LeaveRequest.objects.create(
            user_id=user_id,
            leave_type=leave_type,
            start_date=start_date,
            end_date=end_date,
            duration_days=duration_days,
            justification=justification.strip(),
            status=LeaveRequest.Status.PENDING_CURRENT_AUTHORITY,
            current_authority_id=auth_id,
            current_authority_role=auth_role.value if auth_role else "",
        )

    return request

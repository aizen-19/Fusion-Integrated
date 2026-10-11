"""Review and Decide Leave Request service (HR-UC-004 / ReviewDecideRequestControl / BW-HR-01 Terminal)."""
from __future__ import annotations

from django.db import transaction

from core.api.exceptions import ConflictError, NotFoundError, PermissionDeniedError
from modules.leave.domain import state_machine as sm
from modules.leave.domain.entities import ApprovalOutcome
from modules.leave.models import ApprovalDecision, ApprovingAuthority, LeaveRequest
from modules.leave.services.balances import deduct_leave_balance


def decide_leave_request(
    request_id: int,
    authority_user_id: int,
    outcome: str,
    remarks: str = "",
    is_admin_override: bool = False,
) -> ApprovalDecision:
    """Record a review decision for a routed leave request and trigger balance update on approval.

    Enforces:
    - BR-HR-002: Authority RBAC authorization
    - BR-HR-023: Permitted outcomes and workflow order preservation
    - BR-HR-010: Automated leave balance update upon approval
    - BW-HR-01: Terminal transition from Pending Current Authority -> Approved (direct path)
    """
    with transaction.atomic():
        leave_request = (
            LeaveRequest.objects.select_for_update()
            .filter(id=request_id)
            .first()
        )
        if not leave_request:
            raise NotFoundError(f"Leave request #{request_id} not found.")

        # Invariant check: workflow order must be preserved (BR-HR-023)
        if leave_request.status != LeaveRequest.Status.PENDING_CURRENT_AUTHORITY:
            raise ConflictError(
                f"Cannot decide on leave request in status {leave_request.status!r}; "
                f"must be {LeaveRequest.Status.PENDING_CURRENT_AUTHORITY!r}."
            )

        # RBAC & Authority authorization check (BR-HR-002)
        if not is_admin_override:
            # Must match current_authority_id or be an active registered authority
            is_assigned = (
                leave_request.current_authority_id is None
                or leave_request.current_authority_id == authority_user_id
            )
            is_auth_role = ApprovingAuthority.objects.filter(
                user_id=authority_user_id,
                is_active=True,
            ).exists()
            if not is_assigned and not is_auth_role:
                raise PermissionDeniedError(
                    "You are not the designated approving authority for this request."
                )

        target_status = (
            LeaveRequest.Status.APPROVED
            if outcome == ApprovalOutcome.APPROVED.value
            else LeaveRequest.Status.REJECTED
        )

        # State machine transition check
        sm.resolve(sm.PENDING_CURRENT_AUTHORITY, target_status, sm.AUTHORITY)

        # Update leave request status
        leave_request.status = target_status
        leave_request.save(update_fields=["status", "updated_at"])

        # Create decision record
        decision = ApprovalDecision.objects.create(
            request=leave_request,
            authority_id=authority_user_id,
            outcome=outcome,
            remarks=remarks.strip(),
        )

        # Automated leave balance deduction on approval (BR-HR-010)
        if target_status == LeaveRequest.Status.APPROVED:
            deduct_leave_balance(
                user_id=leave_request.user_id,
                leave_type=leave_request.leave_type,
                days=leave_request.duration_days,
                year=leave_request.start_date.year,
            )

    return decision

"""Pure Python unit tests for Leave Management (ELM) domain layer.

Enforces:
- BW-HR-01 State Machine progression (Draft -> Pending -> Approved/Rejected)
- BR-HR-007 (Mandatory fields)
- BR-HR-008 (Leave balance sufficiency)
- BR-HR-009 (Approval authority routing)
- BR-HR-010 (Balance deduction)
- BR-HR-023 (Workflow order and outcomes)
- BR-HR-034 (Supported leave types)
"""
from datetime import date
from decimal import Decimal
import unittest

from modules.leave.domain import state_machine as sm
from modules.leave.domain.entities import (
    ApprovalOutcome,
    AuthorityRole,
    EmployeeCategory,
    LeaveType,
)
from modules.leave.domain.rules import (
    SUPPORTED_LEAVE_TYPES,
    calculate_balance_deduction,
    determine_approval_authority,
    validate_balance_and_eligibility,
    validate_required_fields,
)


class TestLeaveStateMachine(unittest.TestCase):
    def test_direct_approval_path_transitions_are_legal(self):
        """BW-HR-01: Draft -> Pending -> Approved is the canonical direct path."""
        self.assertTrue(sm.is_legal(sm.DRAFT, sm.PENDING_CURRENT_AUTHORITY))
        self.assertTrue(sm.is_legal(sm.PENDING_CURRENT_AUTHORITY, sm.APPROVED))
        self.assertTrue(sm.is_legal(sm.PENDING_CURRENT_AUTHORITY, sm.REJECTED))

    def test_illegal_transitions_raise(self):
        """Bypassing pending state or moving backward is forbidden."""
        with self.assertRaises(sm.InvalidTransition):
            sm.resolve(sm.DRAFT, sm.APPROVED)

        with self.assertRaises(sm.InvalidTransition):
            sm.resolve(sm.APPROVED, sm.DRAFT)

        with self.assertRaises(sm.InvalidTransition):
            sm.resolve(sm.REJECTED, sm.APPROVED)

    def test_actor_authorization_on_transitions(self):
        """Only APPLICANT may submit; only AUTHORITY may approve or reject."""
        t1 = sm.resolve(sm.DRAFT, sm.PENDING_CURRENT_AUTHORITY, sm.APPLICANT)
        self.assertEqual(t1.permission, "leave.request.create")

        with self.assertRaises(sm.ActorNotAllowed):
            sm.resolve(sm.DRAFT, sm.PENDING_CURRENT_AUTHORITY, sm.AUTHORITY)

        t2 = sm.resolve(sm.PENDING_CURRENT_AUTHORITY, sm.APPROVED, sm.AUTHORITY)
        self.assertEqual(t2.permission, "leave.request.approve")

        with self.assertRaises(sm.ActorNotAllowed):
            sm.resolve(sm.PENDING_CURRENT_AUTHORITY, sm.APPROVED, sm.APPLICANT)

    def test_terminal_states_have_no_further_targets(self):
        """Approved and Rejected are terminal states."""
        self.assertEqual(sm.allowed_targets(sm.APPROVED), [])
        self.assertEqual(sm.allowed_targets(sm.REJECTED), [])


class TestLeaveBusinessRules(unittest.TestCase):
    def test_br_hr_034_supported_leave_types(self):
        """Per BR-HR-034: Casual, Restricted, Medical, Earned, Vacation, Sabbatical."""
        expected = {"casual", "restricted", "medical", "earned", "vacation", "sabbatical"}
        self.assertEqual(SUPPORTED_LEAVE_TYPES, expected)

    def test_br_hr_007_mandatory_fields_validation(self):
        """A leave request must have type, duration > 0, dates, justification."""
        # Valid case
        res = validate_required_fields(
            leave_type=LeaveType.CASUAL.value,
            start_date=date(2026, 10, 15),
            end_date=date(2026, 10, 16),
            duration_days=Decimal("2.0"),
            justification="Attending family function",
        )
        self.assertTrue(res.is_valid)
        self.assertEqual(res.errors, [])

        # Missing justification
        res2 = validate_required_fields(
            leave_type=LeaveType.CASUAL.value,
            start_date=date(2026, 10, 15),
            end_date=date(2026, 10, 16),
            duration_days=Decimal("2.0"),
            justification="",
        )
        self.assertFalse(res2.is_valid)
        self.assertTrue(any("Justification is mandatory" in e for e in res2.errors))

        # Invalid date range
        res3 = validate_required_fields(
            leave_type=LeaveType.CASUAL.value,
            start_date=date(2026, 10, 20),
            end_date=date(2026, 10, 15),
            duration_days=Decimal("1.0"),
            justification="Conference",
        )
        self.assertFalse(res3.is_valid)
        self.assertTrue(any("End date cannot be prior" in e for e in res3.errors))

        # Unsupported leave type
        res4 = validate_required_fields(
            leave_type="unsupported_type",
            start_date=date(2026, 10, 15),
            end_date=date(2026, 10, 16),
            duration_days=Decimal("1.0"),
            justification="Travel",
        )
        self.assertFalse(res4.is_valid)
        self.assertTrue(any("Invalid or unsupported" in e for e in res4.errors))

    def test_br_hr_008_balance_validation(self):
        """Leave balance sufficiency verification."""
        # Sufficient balance
        res = validate_balance_and_eligibility(
            available_balance=Decimal("10.0"),
            requested_days=Decimal("3.0"),
        )
        self.assertTrue(res.is_valid)

        # Insufficient balance
        res2 = validate_balance_and_eligibility(
            available_balance=Decimal("2.0"),
            requested_days=Decimal("5.0"),
        )
        self.assertFalse(res2.is_valid)
        self.assertTrue(any("Insufficient leave balance" in e for e in res2.errors))

    def test_br_hr_009_routing_authority(self):
        """Hierarchical authority selection per BR-HR-009."""
        dir_map = {
            "HOD_CSE": 101,
            "HOD": 102,
            "Registrar": 201,
            "Director": 301,
        }

        # Staff routed to Registrar
        auth_id, role = determine_approval_authority("staff", "Accounts", dir_map)
        self.assertEqual(role, AuthorityRole.REGISTRAR)
        self.assertEqual(auth_id, 201)

        # Faculty routed to Department HOD
        auth_id2, role2 = determine_approval_authority("faculty", "CSE", dir_map)
        self.assertEqual(role2, AuthorityRole.HOD)
        self.assertEqual(auth_id2, 101)

    def test_br_hr_010_balance_deduction(self):
        """Automated balance deduction upon approval."""
        consumed, available = calculate_balance_deduction(
            current_consumed=Decimal("2.0"),
            current_available=Decimal("10.0"),
            days=Decimal("3.5"),
        )
        self.assertEqual(consumed, Decimal("5.5"))
        self.assertEqual(available, Decimal("6.5"))


if __name__ == "__main__":
    unittest.main()

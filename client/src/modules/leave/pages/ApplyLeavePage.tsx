import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router-dom";
import { FaCalendarAlt, FaCheckCircle, FaExclamationCircle } from "react-icons/fa";

import { errorMessage } from "../../../lib/http";
import { PageHeader } from "../../../ui/components/PageHeader";
import { useMyBalances, useSubmitLeave } from "../api";
import type { LeaveType } from "../types";

const LEAVE_TYPES = [
  { value: "casual", label: "Casual Leave (CL)" },
  { value: "restricted", label: "Restricted Holiday (RH)" },
  { value: "medical", label: "Medical Leave (ML)" },
  { value: "earned", label: "Earned Leave (EL)" },
  { value: "vacation", label: "Vacation Leave (VL)" },
  { value: "sabbatical", label: "Sabbatical Leave (SL)" },
];

export default function ApplyLeavePage() {
  const navigate = useNavigate();
  const { data: balances } = useMyBalances();
  const submitMutation = useSubmitLeave();

  const [leaveType, setLeaveType] = useState<LeaveType>("casual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [durationDays, setDurationDays] = useState<number>(1);
  const [justification, setJustification] = useState("");

  const activeBalance = balances?.find((b) => b.leave_type === leaveType);
  const isBalanceInsufficient =
    activeBalance !== undefined && activeBalance.available_balance < durationDays;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      notifications.show({
        color: "red",
        title: "Validation Error",
        message: "Start date and end date are mandatory.",
      });
      return;
    }

    if (!justification.trim()) {
      notifications.show({
        color: "red",
        title: "Validation Error",
        message: "Justification is required before submission.",
      });
      return;
    }

    submitMutation.mutate(
      {
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        duration_days: Number(durationDays),
        justification: justification.trim(),
      },
      {
        onSuccess: () => {
          notifications.show({
            color: "teal",
            title: "Leave Request Submitted",
            message: "Your leave application has been routed to the designated authority.",
            icon: <FaCheckCircle />,
          });
          navigate("/leave/mine");
        },
        onError: (err) => {
          notifications.show({
            color: "red",
            title: "Submission Failed",
            message: errorMessage(err),
            icon: <FaExclamationCircle />,
          });
        },
      },
    );
  };

  return (
    <Container size="md">
      <PageHeader
        title="Apply for Leave"
        subtitle="Submit a leave application for approval routing (BW-HR-01 / HR-UC-003)"
      />

      <Card padding="xl" radius="md" withBorder>
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <Select
              label="Leave Type"
              description="Choose one supported leave category per BR-HR-034"
              data={LEAVE_TYPES}
              value={leaveType}
              onChange={(val) => setLeaveType((val as LeaveType) || "casual")}
              required
            />

            {activeBalance && (
              <Group justify="space-between" p="sm" bg="gray.0" style={{ borderRadius: 6 }}>
                <Text size="sm" fw={500}>
                  Current Available Balance:
                </Text>
                <Badge
                  color={isBalanceInsufficient ? "red" : "teal"}
                  size="lg"
                  variant="filled"
                >
                  {activeBalance.available_balance} days available
                </Badge>
              </Group>
            )}

            {isBalanceInsufficient && (
              <Alert
                color="red"
                icon={<FaExclamationCircle />}
                title="Insufficient Balance (BR-HR-008)"
              >
                You requested {durationDays} days but only have{" "}
                {activeBalance?.available_balance} days available in this category.
              </Alert>
            )}

            <Group grow>
              <TextInput
                label="Start Date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
              <TextInput
                label="End Date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </Group>

            <NumberInput
              label="Duration (in days)"
              description="Minimum 0.5 days"
              value={durationDays}
              onChange={(v) => setDurationDays(Number(v) || 1)}
              min={0.5}
              step={0.5}
              required
            />

            <Textarea
              label="Justification"
              placeholder="State the reason or justification for leave (mandatory per BR-HR-007)..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              minRows={3}
              required
            />

            <Button
              type="submit"
              color="blue"
              size="md"
              loading={submitMutation.isPending}
              disabled={isBalanceInsufficient}
              leftSection={<FaCalendarAlt />}
              mt="md"
            >
              Submit Application
            </Button>
          </Stack>
        </form>
      </Card>
    </Container>
  );
}

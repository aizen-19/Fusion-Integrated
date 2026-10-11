import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { FaCheck, FaTimes } from "react-icons/fa";

import { errorMessage } from "../../../lib/http";
import { DataTable } from "../../../ui/components/DataTable";
import { ErrorState } from "../../../ui/components/ErrorState";
import { PageHeader } from "../../../ui/components/PageHeader";
import { useDecideLeave, usePendingApprovals } from "../api";
import type { LeaveRequest } from "../types";

export default function PendingApprovalsPage() {
  const { data, isPending, error } = usePendingApprovals();
  const decideMutation = useDecideLeave();

  const [activeRequest, setActiveRequest] = useState<LeaveRequest | null>(null);
  const [decisionOutcome, setDecisionOutcome] = useState<"approved" | "rejected">("approved");
  const [remarks, setRemarks] = useState("");

  if (error) {
    return (
      <Container size="xl">
        <ErrorState error={error} />
      </Container>
    );
  }

  const handleOpenDecision = (req: LeaveRequest, outcome: "approved" | "rejected") => {
    setActiveRequest(req);
    setDecisionOutcome(outcome);
    setRemarks("");
  };

  const handleConfirmDecision = () => {
    if (!activeRequest) return;

    decideMutation.mutate(
      {
        id: activeRequest.id,
        outcome: decisionOutcome,
        remarks: remarks.trim(),
      },
      {
        onSuccess: () => {
          notifications.show({
            color: decisionOutcome === "approved" ? "teal" : "red",
            title: `Request ${decisionOutcome === "approved" ? "Approved" : "Rejected"}`,
            message: `Leave request #${activeRequest.id} has been ${decisionOutcome}.`,
          });
          setActiveRequest(null);
        },
        onError: (err) => {
          notifications.show({
            color: "red",
            title: "Decision Failed",
            message: errorMessage(err),
          });
        },
      },
    );
  };

  const rows = data || [];

  return (
    <Container size="xl">
      <PageHeader
        title="Pending Approvals"
        subtitle="Review and decide pending leave requests (HR-UC-004 / BW-HR-01)"
      />

      <Card padding="lg" withBorder radius="md">
        <DataTable<LeaveRequest>
          rows={rows}
          loading={isPending}
          rowKey={(r) => r.id}
          minWidth={850}
          emptyText="No leave requests currently pending your evaluation."
          columns={[
            {
              key: "applicant",
              header: "Applicant ID",
              render: (r) => (
                <Text fw={600}>Employee #{r.user_id}</Text>
              ),
            },
            {
              key: "type",
              header: "Leave Type",
              render: (r) => (
                <Badge color="blue" variant="light" style={{ textTransform: "capitalize" }}>
                  {r.leave_type}
                </Badge>
              ),
            },
            {
              key: "duration",
              header: "Duration",
              render: (r) => (
                <Stack gap={2}>
                  <Text size="sm" fw={500}>
                    {r.duration_days} day(s)
                  </Text>
                  <Text size="xs" c="dimmed">
                    {r.start_date} to {r.end_date}
                  </Text>
                </Stack>
              ),
            },
            {
              key: "justification",
              header: "Justification",
              render: (r) => (
                <Text size="sm" lineClamp={2}>
                  {r.justification}
                </Text>
              ),
            },
            {
              key: "actions",
              header: "Action",
              render: (r) => (
                <Group gap="xs">
                  <Button
                    size="xs"
                    color="teal"
                    leftSection={<FaCheck />}
                    onClick={() => handleOpenDecision(r, "approved")}
                  >
                    Approve
                  </Button>
                  <Button
                    size="xs"
                    color="red"
                    variant="outline"
                    leftSection={<FaTimes />}
                    onClick={() => handleOpenDecision(r, "rejected")}
                  >
                    Reject
                  </Button>
                </Group>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        opened={Boolean(activeRequest)}
        onClose={() => setActiveRequest(null)}
        title={
          <Text fw={600}>
            {decisionOutcome === "approved" ? "Approve" : "Reject"} Leave Request #
            {activeRequest?.id}
          </Text>
        }
      >
        <Stack gap="md">
          <Text size="sm">
            You are about to <b>{decisionOutcome}</b> the request for{" "}
            <b>{activeRequest?.duration_days} day(s)</b> of{" "}
            <b>{activeRequest?.leave_type} leave</b>.
          </Text>

          <Textarea
            label="Remarks (optional)"
            placeholder="Add decision comments or audit remarks..."
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            minRows={3}
          />

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setActiveRequest(null)}>
              Cancel
            </Button>
            <Button
              color={decisionOutcome === "approved" ? "teal" : "red"}
              loading={decideMutation.isPending}
              onClick={handleConfirmDecision}
            >
              Confirm {decisionOutcome === "approved" ? "Approval" : "Rejection"}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

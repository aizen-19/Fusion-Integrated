import { Badge, Button, Card, Container, Group, Stack, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import { FaCalendarPlus } from "react-icons/fa";

import { DataTable } from "../../../ui/components/DataTable";
import { ErrorState } from "../../../ui/components/ErrorState";
import { PageHeader } from "../../../ui/components/PageHeader";
import { useMyLeaves } from "../api";
import type { LeaveRequest } from "../types";

function statusBadge(status: string) {
  switch (status) {
    case "approved":
      return <Badge color="teal" variant="filled">Approved</Badge>;
    case "rejected":
      return <Badge color="red" variant="filled">Rejected</Badge>;
    case "pending_current_authority":
      return <Badge color="yellow" variant="filled">Pending Authority</Badge>;
    default:
      return <Badge color="gray">{status}</Badge>;
  }
}

export default function MyLeavesPage() {
  const { data, isPending, error } = useMyLeaves();

  if (error) {
    return (
      <Container size="xl">
        <ErrorState error={error} />
      </Container>
    );
  }

  const rows = data || [];

  return (
    <Container size="xl">
      <PageHeader
        title="My Leaves"
        subtitle="Track submitted leave requests, statuses, and decision outcomes"
        action={
          <Button
            component={Link}
            to="/leave/apply"
            leftSection={<FaCalendarPlus />}
            color="blue"
          >
            Apply for Leave
          </Button>
        }
      />

      <Card padding="lg" withBorder radius="md">
        <DataTable<LeaveRequest>
          rows={rows}
          loading={isPending}
          rowKey={(r) => r.id}
          minWidth={850}
          emptyText="No leave requests submitted yet."
          columns={[
            {
              key: "leave_type",
              header: "Type",
              render: (r) => (
                <Text fw={600} style={{ textTransform: "capitalize" }}>
                  {r.leave_type} Leave
                </Text>
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
              key: "authority",
              header: "Routing Tier",
              render: (r) => (
                <Badge variant="outline" color="indigo">
                  {r.current_authority_role || "Designated Authority"}
                </Badge>
              ),
            },
            {
              key: "status",
              header: "Status",
              render: (r) => statusBadge(r.status),
            },
            {
              key: "decision",
              header: "Remarks / Decision",
              render: (r) => {
                const latestDecision = r.decisions?.[r.decisions.length - 1];
                if (!latestDecision) {
                  return <Text size="xs" c="dimmed">Awaiting evaluation</Text>;
                }
                return (
                  <Stack gap={2}>
                    <Text size="xs" fw={500}>
                      {latestDecision.outcome.toUpperCase()}
                    </Text>
                    {latestDecision.remarks && (
                      <Text size="xs" c="dimmed" fs="italic">
                        "{latestDecision.remarks}"
                      </Text>
                    )}
                  </Stack>
                );
              },
            },
          ]}
        />
      </Card>
    </Container>
  );
}

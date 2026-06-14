/**
 * Work items currently traveling through queues to agents. Combines two sources:
 *   - AgentWork rows in an active status are items already assigned to an agent.
 *   - PendingServiceRouting rows ready for routing are items still in their queue.
 * The merged shape mirrors what the Work page (src/data/normalize.js
 * normalizeWorkRecord) and the Salesforce data provider's /work fetch expect.
 */
public with sharing class PanoramaWorkService {
    public class WorkItemDto {
        public String id;
        public String subject;
        public String channelKey;
        public String queueId;
        public String agentId;
        public String status; // 'assigned' | 'queued'
        public Integer ageSec;
    }

    public class WorkResponse {
        public List<WorkItemDto> work;
    }

    public static WorkResponse getWork() {
        WorkResponse response = new WorkResponse();
        response.work = new List<WorkItemDto>();

        Datetime nowDt = System.now();

        // Resolve case subjects for both sources in one pass.
        Set<Id> caseIds = new Set<Id>();

        List<AgentWork> assigned = [
            SELECT Id, UserId, WorkItemId, Status,
                   ServiceChannel.MasterLabel, ServiceChannel.DeveloperName,
                   RequestDateTime, OriginalQueueId
            FROM AgentWork
            WHERE Status IN ('Opened', 'Assigned', 'Accepted')
            ORDER BY RequestDateTime DESC
            LIMIT 2000
        ];
        for (AgentWork aw : assigned) {
            if (isCaseId(aw.WorkItemId)) {
                caseIds.add(aw.WorkItemId);
            }
        }

        List<PendingServiceRouting> pending = [
            SELECT Id, WorkItemId, QueueId,
                   ServiceChannel.MasterLabel, ServiceChannel.DeveloperName,
                   CreatedDate
            FROM PendingServiceRouting
            WHERE IsReadyForRouting = true
            ORDER BY CreatedDate ASC
            LIMIT 2000
        ];
        for (PendingServiceRouting psr : pending) {
            if (isCaseId(psr.WorkItemId)) {
                caseIds.add(psr.WorkItemId);
            }
        }

        Map<Id, Case> caseById = caseIds.isEmpty()
            ? new Map<Id, Case>()
            : new Map<Id, Case>([SELECT Id, CaseNumber, Subject FROM Case WHERE Id IN :caseIds]);

        response.work.addAll(buildAssignedItems(assigned, caseById, nowDt));
        response.work.addAll(buildQueuedItems(pending, caseById, nowDt));
        return response;
    }

    /**
     * Map active AgentWork rows to assigned work items. Pure over its inputs (no
     * SOQL) so it stays unit-testable; AgentWork cannot be inserted in tests.
     */
    @TestVisible
    private static List<WorkItemDto> buildAssignedItems(
        List<AgentWork> assigned, Map<Id, Case> caseById, Datetime nowDt
    ) {
        List<WorkItemDto> items = new List<WorkItemDto>();
        for (AgentWork aw : assigned) {
            WorkItemDto dto = new WorkItemDto();
            dto.id = String.valueOf(aw.Id);
            dto.channelKey = PanoramaAgentService.mapChannelKey(
                aw.ServiceChannel?.DeveloperName, aw.ServiceChannel?.MasterLabel);
            dto.queueId = aw.OriginalQueueId == null ? null : String.valueOf(aw.OriginalQueueId);
            dto.agentId = aw.UserId == null ? null : String.valueOf(aw.UserId);
            dto.status = 'assigned';
            dto.ageSec = secondsSince(nowDt, aw.RequestDateTime);
            dto.subject = subjectFor(aw.WorkItemId, caseById, aw.ServiceChannel?.MasterLabel);
            items.add(dto);
        }
        return items;
    }

    /**
     * Map ready PendingServiceRouting rows to queued work items. Pure over its
     * inputs (no SOQL) so it stays unit-testable; PendingServiceRouting cannot be
     * inserted in tests.
     */
    @TestVisible
    private static List<WorkItemDto> buildQueuedItems(
        List<PendingServiceRouting> pending, Map<Id, Case> caseById, Datetime nowDt
    ) {
        List<WorkItemDto> items = new List<WorkItemDto>();
        for (PendingServiceRouting psr : pending) {
            WorkItemDto dto = new WorkItemDto();
            dto.id = String.valueOf(psr.Id);
            dto.channelKey = PanoramaAgentService.mapChannelKey(
                psr.ServiceChannel?.DeveloperName, psr.ServiceChannel?.MasterLabel);
            dto.queueId = psr.QueueId == null ? null : String.valueOf(psr.QueueId);
            dto.agentId = null;
            dto.status = 'queued';
            dto.ageSec = secondsSince(nowDt, psr.CreatedDate);
            dto.subject = subjectFor(psr.WorkItemId, caseById, psr.ServiceChannel?.MasterLabel);
            items.add(dto);
        }
        return items;
    }

    @TestVisible
    private static Boolean isCaseId(Id workItemId) {
        return workItemId != null && String.valueOf(workItemId).startsWith('500');
    }

    @TestVisible
    private static String subjectFor(Id workItemId, Map<Id, Case> caseById, String channelLabel) {
        if (workItemId != null && caseById.containsKey(workItemId)) {
            Case c = caseById.get(workItemId);
            if (!String.isBlank(c.Subject)) {
                return c.Subject;
            }
            return 'Case ' + c.CaseNumber;
        }
        return String.isBlank(channelLabel) ? 'Work item' : channelLabel;
    }

    @TestVisible
    private static Integer secondsSince(Datetime nowDt, Datetime startedAt) {
        if (startedAt == null) {
            return 0;
        }
        Long diff = (nowDt.getTime() - startedAt.getTime()) / 1000;
        return diff < 0 ? 0 : Integer.valueOf(diff);
    }
}

public with sharing class PanoramaQueueService {
    public class QueueDto {
        public String id;
        public String name;
        public String color;
        public Integer backlog;
        public Integer longest;
        public Integer avg;
        public Integer online;
    }

    public class QueuesResponse {
        public List<QueueDto> queues;
    }

    private static final List<String> PALETTE = new List<String>{
        '#6A5BE8', '#E05641', '#15A06A', '#D9981F', '#A98AFF', '#3B82F6', '#EC4899'
    };

    public static QueuesResponse getQueues() {
        QueuesResponse response = new QueuesResponse();
        response.queues = new List<QueueDto>();

        List<Group> groups = [
            SELECT Id, Name
            FROM Group
            WHERE Type = 'Queue'
            ORDER BY Name
            LIMIT 200
        ];
        if (groups.isEmpty()) {
            return response;
        }

        Set<Id> queueIds = new Map<Id, Group>(groups).keySet();
        Map<Id, BacklogStats> backlogByQueue = loadBacklogByQueue(queueIds);
        Map<Id, Integer> onlineByQueue = loadOnlineAgentsByQueue(queueIds);

        Integer colorIdx = 0;
        for (Group g : groups) {
            BacklogStats stats = backlogByQueue.get(g.Id);

            QueueDto dto = new QueueDto();
            dto.id = g.Id;
            dto.name = g.Name;
            dto.color = PALETTE[Math.mod(colorIdx, PALETTE.size())];
            dto.backlog = stats == null ? 0 : stats.count;
            dto.longest = stats == null ? 0 : stats.longestSec;
            dto.avg = stats == null ? 0 : stats.avgSec;
            dto.online = onlineByQueue.containsKey(g.Id) ? onlineByQueue.get(g.Id) : 0;
            response.queues.add(dto);
            colorIdx++;
        }

        return response;
    }

    /** Aggregated wait-time stats for a single queue. */
    @TestVisible
    private class BacklogStats {
        public Integer count = 0;
        public Integer longestSec = 0;
        public Long totalSec = 0;

        public Integer avgSec {
            get { return count == 0 ? 0 : Integer.valueOf(totalSec / count); }
        }
    }

    /**
     * Pending work waiting to be routed, per queue. Each PendingServiceRouting
     * row is a work item sitting in queue; its age (now - CreatedDate) is the
     * caller's wait time. Backlog is the row count, longest/avg are wait-time
     * aggregates in seconds.
     */
    private static Map<Id, BacklogStats> loadBacklogByQueue(Set<Id> queueIds) {
        List<PendingServiceRouting> pending = [
            SELECT QueueId, CreatedDate
            FROM PendingServiceRouting
            WHERE QueueId IN :queueIds AND IsReadyForRouting = true
            LIMIT 10000
        ];
        return aggregateBacklog(pending, System.now());
    }

    /**
     * Fold pending routing rows into per-queue wait-time stats. Pure over its
     * inputs (no SOQL) so it can be unit-tested without the PendingServiceRouting
     * system object, which cannot be inserted in tests.
     */
    @TestVisible
    private static Map<Id, BacklogStats> aggregateBacklog(List<PendingServiceRouting> pending, Datetime nowDt) {
        Map<Id, BacklogStats> byQueue = new Map<Id, BacklogStats>();
        for (PendingServiceRouting psr : pending) {
            if (psr.QueueId == null) {
                continue;
            }
            Integer waitSec = secondsSince(nowDt, psr.CreatedDate);
            BacklogStats stats = byQueue.get(psr.QueueId);
            if (stats == null) {
                stats = new BacklogStats();
                byQueue.put(psr.QueueId, stats);
            }
            stats.count++;
            stats.totalSec += waitSec;
            if (waitSec > stats.longestSec) {
                stats.longestSec = waitSec;
            }
        }
        return byQueue;
    }

    /**
     * Count of agents currently online that are members of each queue. Mirrors
     * the presence logic in PanoramaAgentService: an agent is "online" when they
     * have a current Omni-Channel presence that maps to the online status.
     */
    private static Map<Id, Integer> loadOnlineAgentsByQueue(Set<Id> queueIds) {
        Set<Id> onlineUserIds = new Set<Id>();
        for (UserServicePresence usp : [
            SELECT UserId, ServicePresenceStatus.MasterLabel
            FROM UserServicePresence
            WHERE IsCurrentState = true
            LIMIT 500
        ]) {
            if (usp.UserId != null && isOnlineStatus(usp.ServicePresenceStatus?.MasterLabel)) {
                onlineUserIds.add(usp.UserId);
            }
        }
        if (onlineUserIds.isEmpty()) {
            return new Map<Id, Integer>();
        }

        Map<Id, List<String>> queueIdsByUser = PanoramaGroupMembership.loadQueueIdsByUser(onlineUserIds);
        return countOnlinePerQueue(queueIdsByUser);
    }

    /**
     * Count online agents per queue from a user→queues membership map. Pure over
     * its input (no SOQL) so it stays unit-testable; UserServicePresence is a
     * system object that cannot be inserted in tests.
     */
    @TestVisible
    private static Map<Id, Integer> countOnlinePerQueue(Map<Id, List<String>> queueIdsByUser) {
        Map<Id, Integer> onlineByQueue = new Map<Id, Integer>();
        for (List<String> userQueueIds : queueIdsByUser.values()) {
            if (userQueueIds == null) {
                continue;
            }
            for (String queueId : userQueueIds) {
                Id qId = (Id) queueId;
                Integer current = onlineByQueue.containsKey(qId) ? onlineByQueue.get(qId) : 0;
                onlineByQueue.put(qId, current + 1);
            }
        }
        return onlineByQueue;
    }

    /**
     * Mirror of PanoramaAgentService.mapPresenceStatus for the "online" bucket:
     * an agent counts as online unless their presence label maps to busy, away,
     * or offline. Kept local so queue metrics do not depend on the agent
     * service's private method visibility.
     */
    @TestVisible
    private static Boolean isOnlineStatus(String masterLabel) {
        if (String.isBlank(masterLabel)) {
            return false;
        }
        String normalized = masterLabel.toLowerCase();
        if (normalized.contains('busy') || normalized.contains('occupied') || normalized.contains('ocupat')) {
            return false;
        }
        if (normalized.contains('away') || normalized.contains('break') || normalized.contains('absent')) {
            return false;
        }
        if (normalized.contains('offline') || normalized.contains('unavailable')) {
            return false;
        }
        return true;
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

public with sharing class PanoramaAgentService {
    public class WorkItemDto {
        public String id;
        public String recordId;
        public String label;
        public String subject;
        public String channel;
        public String channelKey;
        public String status;
        public String queue;
        public String queueId;
        public Integer ageMin;
    }

    public class AgentDto {
        public String id;
        public String name;
        public String role;
        public String status;
        public Integer max;
        public Integer used;
        public List<String> queueIds;
        public Integer loginMin;
        public String photo;
        public Map<String, Integer> chans;
        public List<WorkItemDto> work;
    }

    public class AgentsResponse {
        public List<AgentDto> agents;
    }

    public static AgentsResponse getAgents() {
        AgentsResponse response = new AgentsResponse();
        response.agents = new List<AgentDto>();

        Map<Id, List<WorkItemDto>> workByUser = loadWorkItemsByUser();

        String orgUrl = Url.getOrgDomainUrl().toExternalForm();

        List<UserServicePresence> presenceRecords = [
            SELECT UserId, User.Name, User.Title, User.SmallPhotoUrl,
                   ServicePresenceStatus.MasterLabel,
                   StatusStartDate, ConfiguredCapacity
            FROM UserServicePresence
            WHERE IsCurrentState = true
            ORDER BY User.Name
            LIMIT 500
        ];

        Set<Id> userIds = new Set<Id>();
        for (UserServicePresence usp : presenceRecords) {
            userIds.add(usp.UserId);
        }
        Map<Id, List<String>> queueIdsByUser = loadQueueIdsByUser(userIds);

        for (UserServicePresence usp : presenceRecords) {
            AgentDto dto = new AgentDto();
            dto.id = String.valueOf(usp.UserId);
            dto.name = usp.User.Name;
            dto.role = String.isBlank(usp.User.Title) ? 'Agent' : usp.User.Title;
            dto.status = mapPresenceStatus(usp.ServicePresenceStatus?.MasterLabel);
            dto.max = usp.ConfiguredCapacity != null && usp.ConfiguredCapacity > 0
                ? Integer.valueOf(usp.ConfiguredCapacity)
                : 5;
            List<WorkItemDto> items = workByUser.containsKey(usp.UserId)
                ? workByUser.get(usp.UserId)
                : new List<WorkItemDto>();
            dto.work = items;
            dto.used = items.size();
            dto.chans = buildChannelCounts(items);
            dto.queueIds = mergeQueueIds(
                queueIdsByUser.containsKey(usp.UserId)
                    ? queueIdsByUser.get(usp.UserId)
                    : new List<String>(),
                items
            );
            dto.loginMin = minutesSince(usp.StatusStartDate);
            dto.photo = buildPhotoUrl(orgUrl, usp.User.SmallPhotoUrl);
            response.agents.add(dto);
        }

        return response;
    }

    @TestVisible
    private static Map<Id, List<String>> loadQueueIdsByUser(Set<Id> userIds) {
        return PanoramaGroupMembership.loadQueueIdsByUser(userIds);
    }

    @TestVisible
    private static List<String> mergeQueueIds(List<String> membershipIds, List<WorkItemDto> workItems) {
        Set<String> merged = new Set<String>(membershipIds == null ? new List<String>() : membershipIds);
        if (workItems != null) {
            for (WorkItemDto item : workItems) {
                if (!String.isBlank(item.queueId)) {
                    merged.add(item.queueId);
                }
            }
        }
        return new List<String>(merged);
    }

    private static Map<Id, List<WorkItemDto>> loadWorkItemsByUser() {
        List<AgentWork> works = [
            SELECT Id, UserId, WorkItemId, Status,
                   ServiceChannel.MasterLabel, ServiceChannel.DeveloperName,
                   RequestDateTime, OriginalQueueId
            FROM AgentWork
            WHERE Status IN ('Opened', 'Assigned', 'Accepted')
            ORDER BY RequestDateTime DESC
            LIMIT 2000
        ];

        Set<Id> caseIds = new Set<Id>();
        Set<Id> queueIds = new Set<Id>();
        for (AgentWork aw : works) {
            if (aw.WorkItemId != null && String.valueOf(aw.WorkItemId).startsWith('500')) {
                caseIds.add(aw.WorkItemId);
            }
            if (aw.OriginalQueueId != null) {
                queueIds.add(aw.OriginalQueueId);
            }
        }

        Map<Id, Case> caseById = caseIds.isEmpty()
            ? new Map<Id, Case>()
            : new Map<Id, Case>([SELECT Id, CaseNumber, Subject FROM Case WHERE Id IN :caseIds]);
        Map<Id, Group> queueById = queueIds.isEmpty()
            ? new Map<Id, Group>()
            : new Map<Id, Group>([SELECT Id, Name FROM Group WHERE Id IN :queueIds]);

        Map<Id, List<WorkItemDto>> byUser = new Map<Id, List<WorkItemDto>>();
        for (AgentWork aw : works) {
            WorkItemDto item = new WorkItemDto();
            item.id = String.valueOf(aw.Id);
            item.recordId = aw.WorkItemId == null ? null : String.valueOf(aw.WorkItemId);
            item.channel = aw.ServiceChannel?.MasterLabel;
            item.channelKey = mapChannelKey(aw.ServiceChannel?.DeveloperName, aw.ServiceChannel?.MasterLabel);
            item.status = aw.Status;
            item.ageMin = minutesSince(aw.RequestDateTime);
            item.queueId = aw.OriginalQueueId == null ? null : String.valueOf(aw.OriginalQueueId);
            item.queue = aw.OriginalQueueId != null && queueById.containsKey(aw.OriginalQueueId)
                ? queueById.get(aw.OriginalQueueId).Name
                : null;

            if (aw.WorkItemId != null && caseById.containsKey(aw.WorkItemId)) {
                Case c = caseById.get(aw.WorkItemId);
                item.label = 'Case ' + c.CaseNumber;
                item.subject = c.Subject;
            } else {
                item.label = String.isBlank(item.channel) ? 'Work item' : item.channel;
                item.subject = null;
            }

            if (!byUser.containsKey(aw.UserId)) {
                byUser.put(aw.UserId, new List<WorkItemDto>());
            }
            byUser.get(aw.UserId).add(item);
        }
        return byUser;
    }

    private static Map<String, Integer> buildChannelCounts(List<WorkItemDto> items) {
        Map<String, Integer> chans = new Map<String, Integer>{
            'veu' => 0, 'chat' => 0, 'email' => 0, 'wa' => 0, 'cas' => 0
        };
        for (WorkItemDto item : items) {
            String key = String.isBlank(item.channelKey) ? 'cas' : item.channelKey;
            if (!chans.containsKey(key)) {
                chans.put(key, 0);
            }
            chans.put(key, chans.get(key) + 1);
        }
        return chans;
    }

    @TestVisible
    private static String mapChannelKey(String devName, String label) {
        String s = ((devName == null ? '' : devName) + ' ' + (label == null ? '' : label)).toLowerCase();
        if (s.contains('phone') || s.contains('voice') || s.contains('call')) {
            return 'veu';
        }
        if (s.contains('whatsapp')) {
            return 'wa';
        }
        if (s.contains('email') || s.contains('mail')) {
            return 'email';
        }
        if (s.contains('message') || s.contains('chat')) {
            return 'chat';
        }
        return 'cas';
    }

    @TestVisible
    private static String buildPhotoUrl(String orgUrl, String photoUrl) {
        if (String.isBlank(photoUrl)) {
            return null;
        }
        String trimmed = photoUrl.trim();
        String lower = trimmed.toLowerCase();
        if (lower.startsWith('http://') || lower.startsWith('https://')) {
            return trimmed;
        }
        if (lower.startsWith('https//')) {
            return 'https://' + trimmed.substring(7);
        }
        if (lower.startsWith('http//')) {
            return 'http://' + trimmed.substring(6);
        }
        if (trimmed.startsWith('//')) {
            return 'https:' + trimmed;
        }
        String base = orgUrl.endsWith('/') ? orgUrl.substring(0, orgUrl.length() - 1) : orgUrl;
        if (trimmed.startsWith('/')) {
            return base + trimmed;
        }
        return base + '/' + trimmed;
    }

    @TestVisible
    private static String mapPresenceStatus(String masterLabel) {
        if (String.isBlank(masterLabel)) {
            return 'offline';
        }
        String normalized = masterLabel.toLowerCase();
        if (normalized.contains('busy') || normalized.contains('occupied') || normalized.contains('ocupat')) {
            return 'busy';
        }
        if (normalized.contains('away') || normalized.contains('break') || normalized.contains('absent')) {
            return 'away';
        }
        if (normalized.contains('offline') || normalized.contains('unavailable')) {
            return 'offline';
        }
        return 'online';
    }

    private static Integer minutesSince(Datetime startedAt) {
        if (startedAt == null) {
            return 0;
        }
        return Integer.valueOf((System.now().getTime() - startedAt.getTime()) / 60000);
    }
}

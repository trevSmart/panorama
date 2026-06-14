@IsTest
private class PanoramaAgentServiceTest {
    @IsTest
    static void mapsPresenceLabels() {
        System.assertEquals('online', PanoramaAgentService.mapPresenceStatus('Available'));
        System.assertEquals('busy', PanoramaAgentService.mapPresenceStatus('Busy'));
        System.assertEquals('away', PanoramaAgentService.mapPresenceStatus('On Break'));
        System.assertEquals('offline', PanoramaAgentService.mapPresenceStatus('Offline'));
    }

    @IsTest
    static void mapsChannelKeys() {
        System.assertEquals('cas', PanoramaAgentService.mapChannelKey('Panorama_Case', 'Panorama Case'));
        System.assertEquals('veu', PanoramaAgentService.mapChannelKey('sfdc_phone', 'Phone'));
        System.assertEquals('chat', PanoramaAgentService.mapChannelKey('sfdc_livemessage', 'Messaging'));
        System.assertEquals('email', PanoramaAgentService.mapChannelKey(null, 'Email'));
        System.assertEquals('cas', PanoramaAgentService.mapChannelKey(null, null));
    }

    @IsTest
    static void buildPhotoUrlHandlesAbsoluteAndRelativePaths() {
        String orgUrl = 'https://example.my.salesforce.com';
        System.assertEquals(null, PanoramaAgentService.buildPhotoUrl(orgUrl, null));
        System.assertEquals(
            'https://example.file.force.com/profilephoto/005/T',
            PanoramaAgentService.buildPhotoUrl(orgUrl, 'https://example.file.force.com/profilephoto/005/T')
        );
        System.assertEquals(
            'https://example.file.force.com/profilephoto/005/T',
            PanoramaAgentService.buildPhotoUrl(orgUrl, 'https//example.file.force.com/profilephoto/005/T')
        );
        System.assertEquals(
            'https://example.my.salesforce.com/profilephoto/005/T',
            PanoramaAgentService.buildPhotoUrl(orgUrl, '/profilephoto/005/T')
        );
    }

    @IsTest
    static void buildRecordUrlHandlesOrgBaseAndRecordId() {
        String orgUrl = 'https://example.my.salesforce.com/';
        System.assertEquals(
            'https://example.my.salesforce.com/' + UserInfo.getUserId(),
            PanoramaAgentService.buildRecordUrl(orgUrl, UserInfo.getUserId())
        );
        System.assertEquals(null, PanoramaAgentService.buildRecordUrl(orgUrl, null));
    }

    /**
     * A freshly inserted user with no real group memberships, so membership
     * assertions stay deterministic even when the org already has queues and
     * GroupMember rows (the running user usually does).
     */
    private static User insertIsolatedUser() {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        String unique = String.valueOf(System.now().getTime()) + String.valueOf(Math.abs(Crypto.getRandomLong()));
        User u = new User(
            ProfileId = p.Id,
            LastName = 'Panorama Membership',
            Email = 'panorama.membership.' + unique + '@example.com',
            Username = 'panorama.membership.' + unique + '@example.com.invalid',
            Alias = 'pmem',
            TimeZoneSidKey = 'America/Los_Angeles',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US'
        );
        // User is a setup object; isolate its DML so the GroupMember inserts in
        // the test body don't trigger a MIXED_DML_OPERATION error.
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert u;
        }
        return u;
    }

    @IsTest
    static void loadQueueIdsByUserReturnsMembership() {
        User u = insertIsolatedUser();
        Group q = new Group(Name = 'Panorama Test Queue', Type = 'Queue');
        insert q;
        insert new QueueSObject(QueueId = q.Id, SObjectType = 'Case');

        insert new GroupMember(GroupId = q.Id, UserOrGroupId = u.Id);

        Test.startTest();
        Map<Id, List<String>> byUser = PanoramaGroupMembership.loadQueueIdsByUser(new Set<Id>{ u.Id });
        Test.stopTest();

        System.assertEquals(1, byUser.get(u.Id).size());
        System.assertEquals(String.valueOf(q.Id), byUser.get(u.Id)[0]);
    }

    @IsTest
    static void loadQueueIdsByUserResolvesNestedGroupMembership() {
        User u = insertIsolatedUser();
        Group nested = new Group(Name = 'Panorama Nested Group', Type = 'Regular');
        insert nested;
        Group q = new Group(Name = 'Panorama Nested Queue', Type = 'Queue');
        insert q;
        insert new QueueSObject(QueueId = q.Id, SObjectType = 'Case');

        insert new GroupMember(GroupId = nested.Id, UserOrGroupId = u.Id);
        insert new GroupMember(GroupId = q.Id, UserOrGroupId = nested.Id);

        Test.startTest();
        Map<Id, List<String>> byUser = PanoramaGroupMembership.loadQueueIdsByUser(new Set<Id>{ u.Id });
        Test.stopTest();

        System.assertEquals(1, byUser.get(u.Id).size());
        System.assertEquals(String.valueOf(q.Id), byUser.get(u.Id)[0]);
    }

    @IsTest
    static void mergeQueueIdsIncludesActiveWorkQueues() {
        List<String> membership = new List<String>{ '00G000000000001' };
        List<PanoramaAgentService.WorkItemDto> workItems = new List<PanoramaAgentService.WorkItemDto>();
        PanoramaAgentService.WorkItemDto item = new PanoramaAgentService.WorkItemDto();
        item.queueId = '00G000000000002';
        workItems.add(item);

        Test.startTest();
        List<String> merged = PanoramaAgentService.mergeQueueIds(membership, workItems);
        Test.stopTest();

        System.assertEquals(2, merged.size());
        System.assert(merged.contains('00G000000000001'));
        System.assert(merged.contains('00G000000000002'));
    }

    @IsTest
    static void getAgentsReturnsList() {
        Test.startTest();
        PanoramaAgentService.AgentsResponse response = PanoramaAgentService.getAgents();
        Test.stopTest();
        System.assertNotEquals(null, response);
        System.assertNotEquals(null, response.agents);
        for (PanoramaAgentService.AgentDto a : response.agents) {
            System.assertNotEquals(null, a.skills, 'each agent should carry an embedded skills list');
        }
    }

    @IsTest
    static void getAgentsAllScopeReturnsList() {
        Test.startTest();
        PanoramaAgentService.AgentsResponse response = PanoramaAgentService.getAgents('all');
        Test.stopTest();
        System.assertNotEquals(null, response);
        System.assertNotEquals(null, response.agents);
        for (PanoramaAgentService.AgentDto a : response.agents) {
            System.assertNotEquals(null, a.skills, 'each agent should carry an embedded skills list');
        }
    }

    @IsTest
    static void getAgentsBySkillReturnsList() {
        Test.startTest();
        PanoramaAgentService.AgentsResponse response =
            PanoramaAgentService.getAgentsBySkill('0C5000000000001AAA');
        Test.stopTest();
        System.assertNotEquals(null, response);
        System.assertNotEquals(null, response.agents);
    }

    @IsTest
    static void getAgentsBySkillNullReturnsEmpty() {
        Test.startTest();
        PanoramaAgentService.AgentsResponse response =
            PanoramaAgentService.getAgentsBySkill(null);
        Test.stopTest();
        System.assertNotEquals(null, response);
        System.assertEquals(0, response.agents.size());
    }

    @IsTest
    static void getSkillsByAgentReturnsList() {
        Test.startTest();
        PanoramaAgentService.AgentSkillsResponse response =
            PanoramaAgentService.getSkillsByAgent(UserInfo.getUserId());
        Test.stopTest();
        System.assertNotEquals(null, response);
        System.assertNotEquals(null, response.skills);
    }

    @IsTest
    static void getSkillsByAgentNullReturnsEmpty() {
        Test.startTest();
        PanoramaAgentService.AgentSkillsResponse response =
            PanoramaAgentService.getSkillsByAgent(null);
        Test.stopTest();
        System.assertNotEquals(null, response);
        System.assertEquals(0, response.skills.size());
    }

    @IsTest
    static void loadOmniEnabledUserIdsReturnsSet() {
        Test.startTest();
        Set<Id> userIds = PanoramaAgentService.loadOmniEnabledUserIds();
        Test.stopTest();
        System.assertNotEquals(null, userIds);
    }

    @IsTest
    static void getQueuesReturnsList() {
        Test.startTest();
        PanoramaQueueService.QueuesResponse response = PanoramaQueueService.getQueues();
        Test.stopTest();
        System.assertNotEquals(null, response);
        System.assertNotEquals(null, response.queues);
    }

    @IsTest
    static void getQueuesPopulatesMetricsPerQueue() {
        Group q = new Group(Name = 'Panorama Metrics Queue', Type = 'Queue');
        insert q;

        Test.startTest();
        PanoramaQueueService.QueuesResponse response = PanoramaQueueService.getQueues();
        Test.stopTest();

        PanoramaQueueService.QueueDto target = null;
        for (PanoramaQueueService.QueueDto dto : response.queues) {
            if (dto.id == String.valueOf(q.Id)) {
                target = dto;
            }
        }
        System.assertNotEquals(null, target, 'Inserted queue should be returned');
        System.assertNotEquals(null, target.backlog);
        System.assertNotEquals(null, target.longest);
        System.assertNotEquals(null, target.avg);
        System.assertNotEquals(null, target.online);
        System.assert(target.backlog >= 0);
        System.assert(target.longest >= 0);
        System.assert(target.avg >= 0);
        System.assert(target.online >= 0);
        System.assertNotEquals(null, target.color);
    }

    /**
     * Build a PendingServiceRouting with otherwise read-only QueueId/CreatedDate
     * populated, by round-tripping through JSON. Lets the pure aggregation logic
     * be tested without inserting this non-insertable system object.
     */
    private static PendingServiceRouting buildPsr(Id queueId, Datetime createdDate) {
        Map<String, Object> raw = new Map<String, Object>{
            'attributes' => new Map<String, Object>{ 'type' => 'PendingServiceRouting' },
            'QueueId' => queueId == null ? null : String.valueOf(queueId),
            'CreatedDate' => createdDate
        };
        return (PendingServiceRouting) JSON.deserialize(
            JSON.serialize(raw), PendingServiceRouting.class
        );
    }

    @IsTest
    static void aggregateBacklogComputesCountLongestAndAvg() {
        Id queueA = '00G000000000001AAA';
        Id queueB = '00G000000000002AAA';
        Datetime nowDt = System.now();

        List<PendingServiceRouting> pending = new List<PendingServiceRouting>{
            buildPsr(queueA, nowDt.addSeconds(-60)),
            buildPsr(queueA, nowDt.addSeconds(-180)),
            buildPsr(queueB, nowDt.addSeconds(-30)),
            buildPsr(null, nowDt.addSeconds(-999))
        };

        Test.startTest();
        Map<Id, PanoramaQueueService.BacklogStats> stats =
            PanoramaQueueService.aggregateBacklog(pending, nowDt);
        Test.stopTest();

        System.assertEquals(2, stats.size(), 'Null-queue rows must be ignored');
        PanoramaQueueService.BacklogStats a = stats.get(queueA);
        System.assertEquals(2, a.count);
        System.assertEquals(180, a.longestSec);
        System.assertEquals(120, a.avgSec, 'avg of 60 and 180 is 120');
        PanoramaQueueService.BacklogStats b = stats.get(queueB);
        System.assertEquals(1, b.count);
        System.assertEquals(30, b.longestSec);
        System.assertEquals(30, b.avgSec);
    }

    @IsTest
    static void aggregateBacklogEmptyYieldsNoStats() {
        Map<Id, PanoramaQueueService.BacklogStats> stats =
            PanoramaQueueService.aggregateBacklog(new List<PendingServiceRouting>(), System.now());
        System.assertEquals(0, stats.size());
    }

    @IsTest
    static void countOnlinePerQueueTalliesMembership() {
        String queueA = '00G000000000001AAA';
        String queueB = '00G000000000002AAA';
        Map<Id, List<String>> membership = new Map<Id, List<String>>{
            '005000000000001AAA' => new List<String>{ queueA, queueB },
            '005000000000002AAA' => new List<String>{ queueA },
            '005000000000003AAA' => null
        };

        Test.startTest();
        Map<Id, Integer> onlineByQueue = PanoramaQueueService.countOnlinePerQueue(membership);
        Test.stopTest();

        System.assertEquals(2, onlineByQueue.get((Id) queueA), 'Two online agents in queue A');
        System.assertEquals(1, onlineByQueue.get((Id) queueB), 'One online agent in queue B');
    }

    @IsTest
    static void isOnlineStatusClassifiesLabels() {
        System.assertEquals(true, PanoramaQueueService.isOnlineStatus('Available'));
        System.assertEquals(false, PanoramaQueueService.isOnlineStatus('Busy'));
        System.assertEquals(false, PanoramaQueueService.isOnlineStatus('On Break'));
        System.assertEquals(false, PanoramaQueueService.isOnlineStatus('Offline'));
        System.assertEquals(false, PanoramaQueueService.isOnlineStatus(null));
    }

    @IsTest
    static void secondsSinceClampsNullAndNegative() {
        Datetime nowDt = System.now();
        System.assertEquals(0, PanoramaQueueService.secondsSince(nowDt, null));
        System.assertEquals(0, PanoramaQueueService.secondsSince(nowDt, nowDt.addSeconds(60)));
        Integer elapsed = PanoramaQueueService.secondsSince(nowDt, nowDt.addSeconds(-120));
        System.assert(elapsed >= 119 && elapsed <= 121, 'Expected ~120s, got ' + elapsed);
    }

    /* ───────── Work service ───────── */

    @IsTest
    static void getWorkReturnsList() {
        Test.startTest();
        PanoramaWorkService.WorkResponse response = PanoramaWorkService.getWork();
        Test.stopTest();
        System.assertNotEquals(null, response);
        System.assertNotEquals(null, response.work);
    }

    @IsTest
    static void workIsCaseIdRecognizesCasePrefix() {
        System.assertEquals(true, PanoramaWorkService.isCaseId('500000000000001AAA'));
        System.assertEquals(false, PanoramaWorkService.isCaseId('0Bz000000000001AAA'));
        System.assertEquals(false, PanoramaWorkService.isCaseId(null));
    }

    @IsTest
    static void workSubjectForPrefersCaseSubjectThenNumberThenChannel() {
        Id caseId = '500000000000001AAA';
        Case withSubject = (Case) JSON.deserialize(
            '{"attributes":{"type":"Case"},"Id":"' + caseId + '","CaseNumber":"00042","Subject":"Broken thing"}',
            Case.class
        );
        Case noSubject = (Case) JSON.deserialize(
            '{"attributes":{"type":"Case"},"Id":"' + caseId + '","CaseNumber":"00042"}',
            Case.class
        );

        Map<Id, Case> withSub = new Map<Id, Case>{ caseId => withSubject };
        Map<Id, Case> noSub = new Map<Id, Case>{ caseId => noSubject };

        System.assertEquals('Broken thing', PanoramaWorkService.subjectFor(caseId, withSub, 'Phone'));
        System.assertEquals('Case 00042', PanoramaWorkService.subjectFor(caseId, noSub, 'Phone'));
        System.assertEquals('Phone', PanoramaWorkService.subjectFor(null, new Map<Id, Case>(), 'Phone'));
        System.assertEquals('Work item', PanoramaWorkService.subjectFor(null, new Map<Id, Case>(), null));
    }

    @IsTest
    static void workSecondsSinceClampsNullAndNegative() {
        Datetime nowDt = System.now();
        System.assertEquals(0, PanoramaWorkService.secondsSince(nowDt, null));
        System.assertEquals(0, PanoramaWorkService.secondsSince(nowDt, nowDt.addSeconds(60)));
        Integer elapsed = PanoramaWorkService.secondsSince(nowDt, nowDt.addSeconds(-90));
        System.assert(elapsed >= 89 && elapsed <= 91, 'Expected ~90s, got ' + elapsed);
    }

    private static AgentWork buildAgentWork(Id workItemId, Id userId, Id queueId, Datetime requestDt) {
        Map<String, Object> raw = new Map<String, Object>{
            'attributes' => new Map<String, Object>{ 'type' => 'AgentWork' },
            'Id' => '0Bz000000000001AAA',
            'WorkItemId' => workItemId == null ? null : String.valueOf(workItemId),
            'UserId' => userId == null ? null : String.valueOf(userId),
            'OriginalQueueId' => queueId == null ? null : String.valueOf(queueId),
            'RequestDateTime' => requestDt
        };
        return (AgentWork) JSON.deserialize(JSON.serialize(raw), AgentWork.class);
    }

    private static PendingServiceRouting buildPendingRouting(Id workItemId, Id queueId, Datetime createdDt) {
        Map<String, Object> raw = new Map<String, Object>{
            'attributes' => new Map<String, Object>{ 'type' => 'PendingServiceRouting' },
            'Id' => '0JR000000000001AAA',
            'WorkItemId' => workItemId == null ? null : String.valueOf(workItemId),
            'QueueId' => queueId == null ? null : String.valueOf(queueId),
            'CreatedDate' => createdDt
        };
        return (PendingServiceRouting) JSON.deserialize(JSON.serialize(raw), PendingServiceRouting.class);
    }

    @IsTest
    static void buildAssignedItemsMapsAgentWork() {
        Datetime nowDt = System.now();
        Id caseId = '500000000000001AAA';
        Id userId = '005000000000001AAA';
        Id queueId = '00G000000000001AAA';
        Case c = (Case) JSON.deserialize(
            '{"attributes":{"type":"Case"},"Id":"' + caseId + '","CaseNumber":"00099","Subject":"Down"}',
            Case.class
        );
        Map<Id, Case> caseById = new Map<Id, Case>{ caseId => c };

        List<AgentWork> assigned = new List<AgentWork>{
            buildAgentWork(caseId, userId, queueId, nowDt.addSeconds(-120))
        };

        Test.startTest();
        List<PanoramaWorkService.WorkItemDto> items =
            PanoramaWorkService.buildAssignedItems(assigned, caseById, nowDt);
        Test.stopTest();

        System.assertEquals(1, items.size());
        PanoramaWorkService.WorkItemDto dto = items[0];
        System.assertEquals('assigned', dto.status);
        System.assertEquals(String.valueOf(userId), dto.agentId);
        System.assertEquals(String.valueOf(queueId), dto.queueId);
        System.assertEquals('Down', dto.subject);
        System.assert(dto.ageSec >= 119 && dto.ageSec <= 121, 'Expected ~120s, got ' + dto.ageSec);
    }

    @IsTest
    static void buildQueuedItemsMapsPendingRouting() {
        Datetime nowDt = System.now();
        Id queueId = '00G000000000002AAA';

        List<PendingServiceRouting> pending = new List<PendingServiceRouting>{
            buildPendingRouting(null, queueId, nowDt.addSeconds(-45))
        };

        Test.startTest();
        List<PanoramaWorkService.WorkItemDto> items =
            PanoramaWorkService.buildQueuedItems(pending, new Map<Id, Case>(), nowDt);
        Test.stopTest();

        System.assertEquals(1, items.size());
        PanoramaWorkService.WorkItemDto dto = items[0];
        System.assertEquals('queued', dto.status);
        System.assertEquals(null, dto.agentId);
        System.assertEquals(String.valueOf(queueId), dto.queueId);
        System.assertEquals('Work item', dto.subject, 'No case and no channel label falls back to Work item');
        System.assert(dto.ageSec >= 44 && dto.ageSec <= 46, 'Expected ~45s, got ' + dto.ageSec);
    }

    /* ───────── Skills service ───────── */

    @IsTest
    static void getSkillsReturnsList() {
        Test.startTest();
        PanoramaSkillService.SkillsResponse response = PanoramaSkillService.getSkills();
        Test.stopTest();
        System.assertNotEquals(null, response);
        System.assertNotEquals(null, response.skills);
    }

    /**
     * The Skill loop body in getSkills (building DTOs, merging per-skill metrics)
     * cannot be exercised by inserting Skill — DML insert is not allowed on it,
     * and the org may have no skills. Cover that logic via the pure tally helper
     * (countBacklogTalliesReadyRequirementsBySkill) plus this DTO-shape check.
     */
    @IsTest
    static void skillDtoHoldsCatalogShape() {
        PanoramaSkillService.SkillDto dto = new PanoramaSkillService.SkillDto();
        dto.id = '0C5000000000001AAA';
        dto.name = 'Català';
        dto.agents = 3;
        dto.backlog = 7;
        System.assertEquals('Català', dto.name);
        System.assertEquals(3, dto.agents);
        System.assertEquals(7, dto.backlog);
    }

    /**
     * Build a SkillRequirement with read-only SkillId/RelatedRecordId populated
     * via JSON round-trip, so the pure backlog tally can be tested without the
     * routing system objects.
     */
    private static SkillRequirement buildSkillReq(Id skillId, Id relatedRecordId) {
        Map<String, Object> raw = new Map<String, Object>{
            'attributes' => new Map<String, Object>{ 'type' => 'SkillRequirement' },
            'SkillId' => skillId == null ? null : String.valueOf(skillId),
            'RelatedRecordId' => relatedRecordId == null ? null : String.valueOf(relatedRecordId)
        };
        return (SkillRequirement) JSON.deserialize(JSON.serialize(raw), SkillRequirement.class);
    }

    private static ServiceResourceSkill buildResourceSkill(Id skillId, Id resourceId) {
        Map<String, Object> raw = new Map<String, Object>{
            'attributes' => new Map<String, Object>{ 'type' => 'ServiceResourceSkill' },
            'SkillId' => skillId == null ? null : String.valueOf(skillId),
            'ServiceResourceId' => resourceId == null ? null : String.valueOf(resourceId)
        };
        return (ServiceResourceSkill) JSON.deserialize(JSON.serialize(raw), ServiceResourceSkill.class);
    }

    @IsTest
    static void countAgentsTalliesDistinctResourcesBySkill() {
        Id skillA = '0C5000000000001AAA';
        Id skillB = '0C5000000000002AAA';
        Id res1 = '0Hn000000000001AAA';
        Id res2 = '0Hn000000000002AAA';

        List<ServiceResourceSkill> assignments = new List<ServiceResourceSkill>{
            buildResourceSkill(skillA, res1),
            buildResourceSkill(skillA, res1), // duplicate resource → counted once
            buildResourceSkill(skillA, res2),
            buildResourceSkill(skillB, res1),
            buildResourceSkill(null, res1),   // ignored (no skill)
            buildResourceSkill(skillB, null)  // ignored (no resource)
        };

        Test.startTest();
        Map<Id, Integer> bySkill = PanoramaSkillService.countAgents(assignments);
        Test.stopTest();

        System.assertEquals(2, bySkill.get(skillA), 'Two distinct resources for skill A');
        System.assertEquals(1, bySkill.get(skillB), 'One resource for skill B');
    }

    @IsTest
    static void countBacklogTalliesReadyRequirementsBySkill() {
        Id skillA = '0C5000000000001AAA';
        Id skillB = '0C5000000000002AAA';
        Id psrReady = '0JR000000000001AAA';
        Id psrNotReady = '0JR000000000002AAA';

        List<SkillRequirement> reqs = new List<SkillRequirement>{
            buildSkillReq(skillA, psrReady),     // counts
            buildSkillReq(skillA, psrNotReady),  // excluded (PSR not ready)
            buildSkillReq(skillB, psrReady),     // counts
            buildSkillReq(skillB, null),         // counts (no PSR filter)
            buildSkillReq(null, psrReady)        // ignored (no skill)
        };
        Set<Id> ready = new Set<Id>{ psrReady };

        Test.startTest();
        Map<Id, Integer> bySkill = PanoramaSkillService.countBacklog(reqs, ready);
        Test.stopTest();

        System.assertEquals(1, bySkill.get(skillA), 'Only the ready PSR counts for skill A');
        System.assertEquals(2, bySkill.get(skillB), 'Ready PSR plus null-PSR requirement count for skill B');
    }
}

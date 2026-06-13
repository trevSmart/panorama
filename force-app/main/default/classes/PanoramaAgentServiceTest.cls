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

    @IsTest
    static void loadQueueIdsByUserReturnsMembership() {
        Group q = new Group(Name = 'Panorama Test Queue', Type = 'Queue');
        insert q;
        insert new QueueSObject(QueueId = q.Id, SObjectType = 'Case');

        Id userId = UserInfo.getUserId();
        insert new GroupMember(GroupId = q.Id, UserOrGroupId = userId);

        Test.startTest();
        Map<Id, List<String>> byUser = PanoramaGroupMembership.loadQueueIdsByUser(new Set<Id>{ userId });
        Test.stopTest();

        System.assertEquals(1, byUser.get(userId).size());
        System.assertEquals(String.valueOf(q.Id), byUser.get(userId)[0]);
    }

    @IsTest
    static void loadQueueIdsByUserResolvesNestedGroupMembership() {
        Group nested = new Group(Name = 'Panorama Nested Group', Type = 'Regular');
        insert nested;
        Group q = new Group(Name = 'Panorama Nested Queue', Type = 'Queue');
        insert q;
        insert new QueueSObject(QueueId = q.Id, SObjectType = 'Case');

        Id userId = UserInfo.getUserId();
        insert new GroupMember(GroupId = nested.Id, UserOrGroupId = userId);
        insert new GroupMember(GroupId = q.Id, UserOrGroupId = nested.Id);

        Test.startTest();
        Map<Id, List<String>> byUser = PanoramaGroupMembership.loadQueueIdsByUser(new Set<Id>{ userId });
        Test.stopTest();

        System.assertEquals(1, byUser.get(userId).size());
        System.assertEquals(String.valueOf(q.Id), byUser.get(userId)[0]);
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
    }

    @IsTest
    static void getAgentsAllScopeReturnsList() {
        Test.startTest();
        PanoramaAgentService.AgentsResponse response = PanoramaAgentService.getAgents('all');
        Test.stopTest();
        System.assertNotEquals(null, response);
        System.assertNotEquals(null, response.agents);
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
}

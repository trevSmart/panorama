public without sharing class PanoramaGroupMembership {
    public static Map<Id, List<String>> loadQueueIdsByUser(Set<Id> userIds) {
        Map<Id, List<String>> byUser = new Map<Id, List<String>>();
        if (userIds == null || userIds.isEmpty()) {
            return byUser;
        }

        Set<Id> queueGroupIds = new Map<Id, Group>([
            SELECT Id
            FROM Group
            WHERE Type = 'Queue'
            LIMIT 1000
        ]).keySet();
        if (queueGroupIds.isEmpty()) {
            return byUser;
        }

        Map<Id, Set<Id>> memberToContainers = buildMemberToContainersMap();
        for (Id userId : userIds) {
            Set<Id> reachable = expandReachableContainers(new Set<Id>{ userId }, memberToContainers);
            List<String> queueIds = new List<String>();
            for (Id containerId : reachable) {
                if (queueGroupIds.contains(containerId)) {
                    queueIds.add(String.valueOf(containerId));
                }
            }
            byUser.put(userId, queueIds);
        }
        return byUser;
    }

    @TestVisible
    private static Map<Id, Set<Id>> buildMemberToContainersMap() {
        Map<Id, Set<Id>> memberToContainers = new Map<Id, Set<Id>>();
        for (GroupMember gm : [
            SELECT UserOrGroupId, GroupId
            FROM GroupMember
            LIMIT 10000
        ]) {
            if (!memberToContainers.containsKey(gm.UserOrGroupId)) {
                memberToContainers.put(gm.UserOrGroupId, new Set<Id>());
            }
            memberToContainers.get(gm.UserOrGroupId).add(gm.GroupId);
        }
        return memberToContainers;
    }

    @TestVisible
    private static Set<Id> expandReachableContainers(
        Set<Id> seeds,
        Map<Id, Set<Id>> memberToContainers
    ) {
        Set<Id> reachable = new Set<Id>(seeds);
        Set<Id> frontier = new Set<Id>(seeds);

        while (!frontier.isEmpty()) {
            Set<Id> nextFrontier = new Set<Id>();
            for (Id memberId : frontier) {
                Set<Id> containers = memberToContainers.get(memberId);
                if (containers == null) {
                    continue;
                }
                for (Id containerId : containers) {
                    if (!reachable.contains(containerId)) {
                        reachable.add(containerId);
                        nextFrontier.add(containerId);
                    }
                }
            }
            frontier = nextFrontier;
        }
        return reachable;
    }
}

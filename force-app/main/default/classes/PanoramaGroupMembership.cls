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

        Map<Id, Set<Id>> reachableByUser = expandReachableContainers(userIds);
        for (Id userId : userIds) {
            Set<Id> reachable = reachableByUser.get(userId);
            List<String> queueIds = new List<String>();
            if (reachable != null) {
                for (Id containerId : reachable) {
                    if (queueGroupIds.contains(containerId)) {
                        queueIds.add(String.valueOf(containerId));
                    }
                }
            }
            byUser.put(userId, queueIds);
        }
        return byUser;
    }

    /**
     * Resolve every group each seed user reaches, directly or through nested
     * group membership. The traversal is a breadth-first walk over GroupMember,
     * querying only the current frontier each level (UserOrGroupId IN :frontier)
     * instead of loading every membership in the org. That keeps the result
     * scoped to the seeds — so callers (and tests) never pick up unrelated
     * memberships — and bounds the SOQL to the depth of the group hierarchy.
     *
     * @return reachable container ids keyed by seed user id (excludes the seed).
     */
    @TestVisible
    private static Map<Id, Set<Id>> expandReachableContainers(Set<Id> seeds) {
        Map<Id, Set<Id>> reachableByUser = new Map<Id, Set<Id>>();
        // Track which seed users each frontier member descends from, so a shared
        // intermediate group propagates to every user that reaches it.
        Map<Id, Set<Id>> seedsByMember = new Map<Id, Set<Id>>();
        Set<Id> frontier = new Set<Id>();
        for (Id seed : seeds) {
            reachableByUser.put(seed, new Set<Id>());
            seedsByMember.put(seed, new Set<Id>{ seed });
            frontier.add(seed);
        }

        Set<Id> visited = new Set<Id>(frontier);
        while (!frontier.isEmpty()) {
            Map<Id, Set<Id>> nextSeedsByMember = new Map<Id, Set<Id>>();
            for (GroupMember gm : [
                SELECT UserOrGroupId, GroupId
                FROM GroupMember
                WHERE UserOrGroupId IN :frontier
                LIMIT 10000
            ]) {
                Set<Id> originSeeds = seedsByMember.get(gm.UserOrGroupId);
                if (originSeeds == null) {
                    continue;
                }
                for (Id seed : originSeeds) {
                    reachableByUser.get(seed).add(gm.GroupId);
                }
                if (!visited.contains(gm.GroupId)) {
                    if (!nextSeedsByMember.containsKey(gm.GroupId)) {
                        nextSeedsByMember.put(gm.GroupId, new Set<Id>());
                    }
                    nextSeedsByMember.get(gm.GroupId).addAll(originSeeds);
                }
            }

            frontier = nextSeedsByMember.keySet().clone();
            visited.addAll(frontier);
            seedsByMember = nextSeedsByMember;
        }

        return reachableByUser;
    }
}

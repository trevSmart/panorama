/**
 * Skill catalog with routing pressure. For each Omni-Channel Skill we report:
 *   - agents:  qualified agents (resources assigned the skill).
 *   - backlog: pending work items whose routing requires the skill.
 * Shape mirrors what the Skills page (src/data/normalize.js normalizeSkill) and
 * the Salesforce data provider's /skills fetch expect.
 */
public with sharing class PanoramaSkillService {
    public class SkillDto {
        public String id;
        public String name;
        public String type;
        public Integer agents;
        public Integer backlog;
    }

    public class SkillsResponse {
        public List<SkillDto> skills;
    }

    public static SkillsResponse getSkills() {
        SkillsResponse response = new SkillsResponse();
        response.skills = new List<SkillDto>();

        // Order by skill type first so the client can render type sections in a
        // stable order without re-sorting.
        List<Skill> skills = [
            SELECT Id, MasterLabel, Type.MasterLabel
            FROM Skill
            ORDER BY Type.MasterLabel NULLS LAST, MasterLabel
            LIMIT 500
        ];
        if (skills.isEmpty()) {
            return response;
        }

        Set<Id> skillIds = new Map<Id, Skill>(skills).keySet();
        Map<Id, Integer> backlogBySkill = loadBacklogBySkill(skillIds);
        Map<Id, Integer> agentsBySkill = loadAgentsBySkill(skillIds);

        for (Skill s : skills) {
            SkillDto dto = new SkillDto();
            dto.id = String.valueOf(s.Id);
            dto.name = s.MasterLabel;
            dto.type = s.Type == null ? null : s.Type.MasterLabel;
            dto.agents = agentsBySkill.containsKey(s.Id) ? agentsBySkill.get(s.Id) : 0;
            dto.backlog = backlogBySkill.containsKey(s.Id) ? backlogBySkill.get(s.Id) : 0;
            response.skills.add(dto);
        }

        return response;
    }

    /**
     * Pending work routed by skill. SkillRequirement links a routing record
     * (RelatedRecordId → PendingServiceRouting) to a required Skill; we count the
     * requirements whose PSR is still waiting to be routed.
     */
    private static Map<Id, Integer> loadBacklogBySkill(Set<Id> skillIds) {
        List<SkillRequirement> reqs = [
            SELECT SkillId, RelatedRecordId
            FROM SkillRequirement
            WHERE SkillId IN :skillIds
            LIMIT 10000
        ];
        if (reqs.isEmpty()) {
            return new Map<Id, Integer>();
        }

        // Keep only requirements tied to a routing row still ready for routing.
        Set<Id> psrIds = new Set<Id>();
        for (SkillRequirement req : reqs) {
            if (req.RelatedRecordId != null && String.valueOf(req.RelatedRecordId).startsWith('0JR')) {
                psrIds.add(req.RelatedRecordId);
            }
        }
        Set<Id> readyPsrIds = new Set<Id>();
        if (!psrIds.isEmpty()) {
            for (PendingServiceRouting psr : [
                SELECT Id FROM PendingServiceRouting
                WHERE Id IN :psrIds AND IsReadyForRouting = true
                LIMIT 10000
            ]) {
                readyPsrIds.add(psr.Id);
            }
        }

        return countBacklog(reqs, readyPsrIds);
    }

    /**
     * Fold skill requirements into per-skill backlog counts, keeping only those
     * whose routing row is ready. Pure over its inputs (no SOQL) so it stays
     * unit-testable without the routing system objects.
     */
    @TestVisible
    private static Map<Id, Integer> countBacklog(List<SkillRequirement> reqs, Set<Id> readyPsrIds) {
        Map<Id, Integer> bySkill = new Map<Id, Integer>();
        for (SkillRequirement req : reqs) {
            if (req.SkillId == null) {
                continue;
            }
            if (req.RelatedRecordId != null && !readyPsrIds.contains(req.RelatedRecordId)) {
                continue;
            }
            Integer current = bySkill.containsKey(req.SkillId) ? bySkill.get(req.SkillId) : 0;
            bySkill.put(req.SkillId, current + 1);
        }
        return bySkill;
    }

    /**
     * Qualified agents per skill. In Omni-Channel each agent is a ServiceResource
     * (RelatedRecordId → User) and ServiceResourceSkill links a resource to a
     * Skill. Count distinct active resources per skill so a resource listed twice
     * for the same skill is not double-counted.
     */
    private static Map<Id, Integer> loadAgentsBySkill(Set<Id> skillIds) {
        List<ServiceResourceSkill> assignments = [
            SELECT SkillId, ServiceResourceId
            FROM ServiceResourceSkill
            WHERE SkillId IN :skillIds AND ServiceResource.IsActive = true
            LIMIT 10000
        ];
        return countAgents(assignments);
    }

    /**
     * Fold resource→skill assignments into per-skill distinct-resource counts.
     * Pure over its input (no SOQL) so it stays unit-testable.
     */
    @TestVisible
    private static Map<Id, Integer> countAgents(List<ServiceResourceSkill> assignments) {
        Map<Id, Set<Id>> resourcesBySkill = new Map<Id, Set<Id>>();
        for (ServiceResourceSkill srs : assignments) {
            if (srs.SkillId == null || srs.ServiceResourceId == null) {
                continue;
            }
            Set<Id> resources = resourcesBySkill.get(srs.SkillId);
            if (resources == null) {
                resources = new Set<Id>();
                resourcesBySkill.put(srs.SkillId, resources);
            }
            resources.add(srs.ServiceResourceId);
        }
        Map<Id, Integer> bySkill = new Map<Id, Integer>();
        for (Id skillId : resourcesBySkill.keySet()) {
            bySkill.put(skillId, resourcesBySkill.get(skillId).size());
        }
        return bySkill;
    }
}

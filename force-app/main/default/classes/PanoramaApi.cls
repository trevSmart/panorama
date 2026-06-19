@RestResource(urlMapping='/panorama/v1/*')
global with sharing class PanoramaApi {
    @HttpGet
    global static void handleGet() {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;
        String path = normalizePath(req.requestURI);

        try {
            if (path == '/agents') {
                String scope = req.params.get('scope');
                writeJson(res, 200, PanoramaAgentService.getAgents(scope));
            } else if (path.startsWith('/agents/') && path.endsWith('/skills')) {
                String userId = path.substring('/agents/'.length(), path.length() - '/skills'.length());
                writeJson(res, 200, PanoramaAgentService.getSkillsByAgent(userId));
            } else if (path == '/queues') {
                writeJson(res, 200, PanoramaQueueService.getQueues());
            } else if (path == '/skills') {
                writeJson(res, 200, PanoramaSkillService.getSkills());
            } else if (path.startsWith('/skills/') && path.endsWith('/agents')) {
                String skillId = path.substring('/skills/'.length(), path.length() - '/agents'.length());
                writeJson(res, 200, PanoramaAgentService.getAgentsBySkill(skillId));
            } else if (path == '/work') {
                writeJson(res, 200, PanoramaWorkService.getWork());
            } else if (path == '/capabilities') {
                writeJson(res, 200, PanoramaCapabilityService.getCapabilities());
            } else {
                writeJson(res, 404, new Map<String, Object>{
                    'error' => 'Not found',
                    'path' => path
                });
            }
        } catch (Exception ex) {
            writeJson(res, 500, new Map<String, Object>{
                'error' => ex.getMessage()
            });
        }
    }

    @HttpPut
    global static void handlePut() {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;
        String path = normalizePath(req.requestURI);
        try {
            if (path.startsWith('/agents/') && path.endsWith('/skills')) {
                String userId = path.substring('/agents/'.length(), path.length() - '/skills'.length());
                Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(req.requestBody.toString());
                List<Object> raw = (List<Object>) body.get('changes');
                List<PanoramaSkillService.SkillChange> changes = new List<PanoramaSkillService.SkillChange>();
                if (raw != null) {
                    for (Object o : raw) {
                        Map<String, Object> m = (Map<String, Object>) o;
                        PanoramaSkillService.SkillChange ch = new PanoramaSkillService.SkillChange();
                        ch.skillId = (Id) (String) m.get('skillId');
                        ch.level = m.get('level') == null ? null : Double.valueOf(m.get('level'));
                        ch.remove = m.get('remove') == true;
                        changes.add(ch);
                    }
                }
                PanoramaSkillService.updateAgentSkills((Id) userId, changes);
                writeJson(res, 200, new Map<String, Object>{ 'ok' => true });
            } else {
                writeJson(res, 404, new Map<String, Object>{ 'error' => 'Not found', 'path' => path });
            }
        } catch (PanoramaSkillService.PanoramaSkillException ex) {
            writeJson(res, 403, new Map<String, Object>{ 'error' => ex.getMessage() });
        } catch (Exception ex) {
            writeJson(res, 500, new Map<String, Object>{ 'error' => ex.getMessage() });
        }
    }

    private static String normalizePath(String requestUri) {
        if (String.isBlank(requestUri)) {
            return '/';
        }
        Integer marker = requestUri.indexOf('/panorama/v1');
        String path = marker >= 0
            ? requestUri.substring(marker + '/panorama/v1'.length())
            : requestUri;
        if (String.isBlank(path)) {
            return '/';
        }
        return path.endsWith('/') && path.length() > 1
            ? path.substring(0, path.length() - 1)
            : path;
    }

    private static void writeJson(RestResponse res, Integer statusCode, Object payload) {
        res.statusCode = statusCode;
        res.addHeader('Content-Type', 'application/json');
        res.responseBody = Blob.valueOf(JSON.serialize(payload));
    }
}

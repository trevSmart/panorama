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
            } else if (path == '/queues') {
                writeJson(res, 200, PanoramaQueueService.getQueues());
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
